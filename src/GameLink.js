// Peer-to-peer transport for gameplay inputs. At match start it forms a full
// WebRTC data-channel mesh between the players (signaling over the same relay
// the lockstep uses). Inputs sent here travel directly between players instead
// of bouncing through the server, roughly halving latency; the relay stays as
// a parallel backup, so a peer that can't establish P2P still gets every input.
//
// The channels are reliable but unordered: every input is guaranteed to
// arrive (lockstep can't skip a tick), while a delayed packet doesn't hold up
// the ones behind it (no head-of-line blocking). The lower player number
// makes the offer, so the two sides never collide.
function GameLink(config) {
  config = config || {};
  this._RTCPeerConnection = config.RTCPeerConnection ||
    (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
  this._iceServers = config.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];

  this._myNumber = 0;
  this._playersCount = 0;
  this._send = null;      // signaling sender (over the relay)
  this._onInput = null;   // called with each received input message
  this._peers = {};       // number -> { pc, channel, rtt }
  this._pingTimer = null;
}

GameLink.isSupported = function () {
  return typeof RTCPeerConnection !== 'undefined';
};

GameLink.isSignal = function (message) {
  return !!message && typeof message.t === 'string' && message.t.indexOf('p2p-') === 0;
};

// Open the mesh for a match. onInput receives each decoded input message.
GameLink.prototype.start = function (myNumber, playersCount, sendSignal, onInput) {
  this.stop();
  this._myNumber = myNumber;
  this._playersCount = playersCount;
  this._send = sendSignal;
  this._onInput = onInput;
  if (!this._RTCPeerConnection) {
    return;
  }
  for (var p = 1; p <= playersCount; ++p) {
    if (p !== myNumber && myNumber < p) {
      this._offerTo(p);   // lower number initiates; the peer waits for us
    }
  }
  var self = this;
  this._pingTimer = setInterval(function () { self._pingPeers(); }, 1000);
};

GameLink.prototype.stop = function () {
  if (this._pingTimer !== null) {
    clearInterval(this._pingTimer);
    this._pingTimer = null;
  }
  for (var number in this._peers) {
    this._closePeer(parseInt(number, 10));
  }
  this._peers = {};
  this._send = null;
  this._onInput = null;
};

// Round trip to the worst-connected peer, in milliseconds (0 if unknown).
GameLink.prototype.getRtt = function () {
  var max = 0;
  for (var number in this._peers) {
    if (this._peers[number].rtt) { max = Math.max(max, this._peers[number].rtt); }
  }
  return max;
};

GameLink.prototype._pingPeers = function () {
  for (var number in this._peers) {
    var channel = this._peers[number].channel;
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify({ t: 'plink-ping', ts: Date.now() }));
    }
  }
};

// Broadcast an input message to every connected peer.
GameLink.prototype.send = function (message) {
  var data = JSON.stringify(message);
  for (var number in this._peers) {
    var channel = this._peers[number].channel;
    if (channel && channel.readyState === 'open') {
      channel.send(data);
    }
  }
};

GameLink.prototype.connectedCount = function () {
  var count = 0;
  for (var number in this._peers) {
    var channel = this._peers[number].channel;
    if (channel && channel.readyState === 'open') {
      count++;
    }
  }
  return count;
};

GameLink.prototype.handleSignal = function (message) {
  if (message.to !== this._myNumber) {
    return;
  }
  if (message.t === 'p2p-offer') {
    this._onOffer(message.from, message.sdp);
  } else if (message.t === 'p2p-answer') {
    this._onAnswer(message.from, message.sdp);
  } else if (message.t === 'p2p-ice') {
    this._onIce(message.from, message.candidate);
  }
};

GameLink.prototype._offerTo = function (number) {
  var self = this;
  var peer = this._createPeer(number);
  peer.channel = peer.pc.createDataChannel('inputs', { ordered: false });
  this._setupChannel(peer.channel, number);
  peer.pc.createOffer().then(function (offer) {
    return peer.pc.setLocalDescription(offer);
  }).then(function () {
    self._send({ t: 'p2p-offer', from: self._myNumber, to: number, sdp: peer.pc.localDescription });
  }).catch(function () {});
};

GameLink.prototype._onOffer = function (from, sdp) {
  var self = this;
  var peer = this._peers[from] || this._createPeer(from);
  peer.pc.ondatachannel = function (event) {
    peer.channel = event.channel;
    self._setupChannel(event.channel, from);
  };
  peer.pc.setRemoteDescription(sdp).then(function () {
    return peer.pc.createAnswer();
  }).then(function (answer) {
    return peer.pc.setLocalDescription(answer);
  }).then(function () {
    self._send({ t: 'p2p-answer', from: self._myNumber, to: from, sdp: peer.pc.localDescription });
  }).catch(function () {});
};

GameLink.prototype._onAnswer = function (from, sdp) {
  var peer = this._peers[from];
  if (peer) {
    peer.pc.setRemoteDescription(sdp).catch(function () {});
  }
};

GameLink.prototype._onIce = function (from, candidate) {
  var peer = this._peers[from];
  if (peer && candidate) {
    peer.pc.addIceCandidate(candidate).catch(function () {});
  }
};

GameLink.prototype._createPeer = function (number) {
  var self = this;
  var pc = new this._RTCPeerConnection({ iceServers: this._iceServers });
  pc.onicecandidate = function (event) {
    if (event.candidate) {
      self._send({ t: 'p2p-ice', from: self._myNumber, to: number, candidate: event.candidate });
    }
  };
  var peer = { pc: pc, channel: null, rtt: 0 };
  this._peers[number] = peer;
  return peer;
};

GameLink.prototype._setupChannel = function (channel, number) {
  var self = this;
  channel.onmessage = function (event) {
    var message;
    try { message = JSON.parse(event.data); } catch (e) { return; }
    if (message.t === 'plink-ping') {
      channel.send(JSON.stringify({ t: 'plink-pong', ts: message.ts }));
      return;
    }
    if (message.t === 'plink-pong') {
      var peer = self._peers[number];
      if (peer) {
        var rtt = Date.now() - message.ts;
        peer.rtt = peer.rtt ? Math.round(0.7 * peer.rtt + 0.3 * rtt) : rtt;
      }
      return;
    }
    if (self._onInput) {
      self._onInput(message);
    }
  };
};

GameLink.prototype._closePeer = function (number) {
  var peer = this._peers[number];
  if (!peer) {
    return;
  }
  delete this._peers[number];
  if (peer.channel) {
    try { peer.channel.close(); } catch (e) {}
  }
  try { peer.pc.close(); } catch (e) {}
};
