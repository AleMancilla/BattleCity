// Opt-in voice chat between the players in a match. Audio travels peer-to-peer
// over WebRTC; only the signaling (offers/answers/ICE) rides the existing
// WebSocket relay, so voice reaches exactly the room's members and no one else.
//
// Each player controls their own participation with a toggle button: enabling
// grabs the microphone and connects to the other participants; disabling drops
// out. Two players are connected only when BOTH have voice enabled.
//
// Connections form a full mesh (fine for 2-3 players). To avoid both sides
// sending an offer at once (glare), the lower player number always offers.
function VoiceChat(config) {
  config = config || {};
  this._getUserMedia = config.getUserMedia || function (constraints) {
    return navigator.mediaDevices.getUserMedia(constraints);
  };
  this._RTCPeerConnection = config.RTCPeerConnection ||
    (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
  this._iceServers = config.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];

  this._active = false;      // a match is in progress
  this._enabled = false;     // this player's mic is on
  this._myNumber = 0;
  this._send = null;
  this._localStream = null;
  this._peers = {};          // number -> { pc, audio }
  this._voicePeers = {};     // number -> true (peers whose mic is on)

  this._container = null;
  this._button = null;
}

VoiceChat.isSupported = function () {
  return typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    !!navigator.mediaDevices.getUserMedia;
};

// A voice signaling message is one this module owns.
VoiceChat.isSignal = function (message) {
  return !!message && typeof message.t === 'string' && message.t.indexOf('voice-') === 0;
};

VoiceChat.prototype.attach = function (container) {
  this._container = document.createElement('div');
  this._container.id = 'voice-chat';
  this._container.style.display = 'none';

  this._button = document.createElement('button');
  this._button.id = 'voice-toggle';
  var self = this;
  this._button.addEventListener('click', function () { self.toggle(); });

  this._container.appendChild(this._button);
  container.appendChild(this._container);
  this._render();
};

// --- Match lifecycle, driven by NetworkSession ---

VoiceChat.prototype.onMatchStart = function (myNumber, playersCount, sendFn) {
  this._active = true;
  this._myNumber = myNumber;
  this._send = sendFn;
  this._voicePeers = {};
  if (this._container) {
    this._container.style.display = '';
  }
  this._render();
};

VoiceChat.prototype.onMatchEnd = function () {
  this.disable();
  this._active = false;
  this._send = null;
  if (this._container) {
    this._container.style.display = 'none';
  }
};

VoiceChat.prototype.isEnabled = function () {
  return this._enabled;
};

VoiceChat.prototype.getConnectedCount = function () {
  return Object.keys(this._peers).length;
};

VoiceChat.prototype.toggle = function () {
  if (this._enabled) {
    this.disable();
  } else {
    this.enable();
  }
};

VoiceChat.prototype.enable = function () {
  if (!this._active || this._enabled) {
    return;
  }
  var self = this;
  this._setButtonText('VOICE ...');
  this._getUserMedia({ audio: true, video: false }).then(function (stream) {
    if (!self._active) {                 // match ended while asking for the mic
      self._stopStream(stream);
      return;
    }
    self._localStream = stream;
    self._enabled = true;
    self._send({ t: 'voice-join', from: self._myNumber });
    // Offer to everyone already in voice that we should initiate to.
    for (var number in self._voicePeers) {
      self._maybeOffer(parseInt(number, 10));
    }
    self._render();
  }).catch(function () {
    self._enabled = false;
    self._setButtonText('VOICE: NO MIC');
  });
};

VoiceChat.prototype.disable = function () {
  if (!this._enabled) {
    return;
  }
  this._enabled = false;
  if (this._send) {
    this._send({ t: 'voice-leave', from: this._myNumber });
  }
  for (var number in this._peers) {
    this._closePeer(parseInt(number, 10));
  }
  this._stopStream(this._localStream);
  this._localStream = null;
  this._render();
};

// --- Signaling, routed here by NetworkSession ---

VoiceChat.prototype.handleSignal = function (message) {
  if (message.t === 'voice-join') {
    this._onJoin(message.from);
  } else if (message.t === 'voice-leave') {
    this._onLeave(message.from);
  } else if (message.to === this._myNumber) {
    if (message.t === 'voice-offer') {
      this._onOffer(message.from, message.sdp);
    } else if (message.t === 'voice-answer') {
      this._onAnswer(message.from, message.sdp);
    } else if (message.t === 'voice-ice') {
      this._onIce(message.from, message.candidate);
    }
  }
};

VoiceChat.prototype._onJoin = function (from) {
  this._voicePeers[from] = true;
  this._maybeOffer(from);
  this._render();
};

VoiceChat.prototype._onLeave = function (from) {
  delete this._voicePeers[from];
  this._closePeer(from);
  this._render();
};

// Start a connection to `number` if we both have voice on and we are the
// designated offerer (lower number). The higher peer waits for our offer.
VoiceChat.prototype._maybeOffer = function (number) {
  if (!this._enabled || !this._voicePeers[number] || this._peers[number]) {
    return;
  }
  if (this._myNumber >= number) {
    return;
  }
  var self = this;
  var peer = this._createPeer(number);
  peer.pc.createOffer().then(function (offer) {
    return peer.pc.setLocalDescription(offer);
  }).then(function () {
    self._send({ t: 'voice-offer', from: self._myNumber, to: number, sdp: peer.pc.localDescription });
  }).catch(function () {});
};

VoiceChat.prototype._onOffer = function (from, sdp) {
  if (!this._enabled) {
    return;
  }
  this._voicePeers[from] = true;
  var self = this;
  var peer = this._peers[from] || this._createPeer(from);
  peer.pc.setRemoteDescription(sdp).then(function () {
    return peer.pc.createAnswer();
  }).then(function (answer) {
    return peer.pc.setLocalDescription(answer);
  }).then(function () {
    self._send({ t: 'voice-answer', from: self._myNumber, to: from, sdp: peer.pc.localDescription });
  }).catch(function () {});
};

VoiceChat.prototype._onAnswer = function (from, sdp) {
  var peer = this._peers[from];
  if (peer) {
    peer.pc.setRemoteDescription(sdp).catch(function () {});
  }
};

VoiceChat.prototype._onIce = function (from, candidate) {
  var peer = this._peers[from];
  if (peer && candidate) {
    peer.pc.addIceCandidate(candidate).catch(function () {});
  }
};

VoiceChat.prototype._createPeer = function (number) {
  var self = this;
  var pc = new this._RTCPeerConnection({ iceServers: this._iceServers });

  if (this._localStream) {
    this._localStream.getTracks().forEach(function (track) {
      pc.addTrack(track, self._localStream);
    });
  }

  pc.onicecandidate = function (event) {
    if (event.candidate) {
      self._send({ t: 'voice-ice', from: self._myNumber, to: number, candidate: event.candidate });
    }
  };

  var audio = document.createElement('audio');
  audio.autoplay = true;
  if (this._container) {
    this._container.appendChild(audio);
  }
  pc.ontrack = function (event) {
    audio.srcObject = event.streams[0];
  };

  var peer = { pc: pc, audio: audio };
  this._peers[number] = peer;
  return peer;
};

VoiceChat.prototype._closePeer = function (number) {
  var peer = this._peers[number];
  if (!peer) {
    return;
  }
  delete this._peers[number];
  try { peer.pc.close(); } catch (e) {}
  if (peer.audio) {
    peer.audio.srcObject = null;
    if (peer.audio.parentNode) {
      peer.audio.parentNode.removeChild(peer.audio);
    }
  }
};

VoiceChat.prototype._stopStream = function (stream) {
  if (stream && stream.getTracks) {
    stream.getTracks().forEach(function (track) { track.stop(); });
  }
};

// --- UI ---

VoiceChat.prototype._render = function () {
  if (!this._button) {
    return;
  }
  if (this._enabled) {
    var count = this.getConnectedCount();
    this._setButtonText(count > 0 ? 'VOICE ON (' + count + ')' : 'VOICE ON');
    this._button.className = 'voice-on';
  } else {
    this._setButtonText('VOICE OFF');
    this._button.className = 'voice-off';
  }
};

VoiceChat.prototype._setButtonText = function (text) {
  if (this._button) {
    this._button.textContent = text;
  }
};
