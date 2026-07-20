describe("GameLink", function () {
  var sent, link;

  function FakeChannel() { this.readyState = 'open'; this.sentData = []; this.onmessage = null; }
  FakeChannel.prototype.send = function (d) { this.sentData.push(d); };
  FakeChannel.prototype.close = function () { this.readyState = 'closed'; };

  function FakePC() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.dataChannel = null;
    this.closed = false;
    FakePC.instances.push(this);
  }
  FakePC.instances = [];
  FakePC.prototype.createDataChannel = function () { this.dataChannel = new FakeChannel(); return this.dataChannel; };
  FakePC.prototype.createOffer = function () { return Promise.resolve({ type: 'offer', sdp: 'OFFER' }); };
  FakePC.prototype.createAnswer = function () { return Promise.resolve({ type: 'answer', sdp: 'ANSWER' }); };
  FakePC.prototype.setLocalDescription = function (d) { this.localDescription = d; return Promise.resolve(); };
  FakePC.prototype.setRemoteDescription = function (d) { this.remoteDescription = d; return Promise.resolve(); };
  FakePC.prototype.addIceCandidate = function () { return Promise.resolve(); };
  FakePC.prototype.close = function () { this.closed = true; };

  function makeLink() {
    return new GameLink({ RTCPeerConnection: FakePC, iceServers: [] });
  }
  function sentOfType(t) {
    var m = null;
    sent.forEach(function (x) { if (x.t === t) m = x; });
    return m;
  }

  beforeEach(function () {
    sent = [];
    FakePC.instances = [];
    link = makeLink();
  });

  it("recognizes its own signaling messages", function () {
    expect(GameLink.isSignal({ t: 'p2p-offer' })).toBeTruthy();
    expect(GameLink.isSignal({ t: 'voice-offer' })).toBeFalsy();
    expect(GameLink.isSignal({ t: 'i' })).toBeFalsy();
  });

  it("offers only to higher-numbered peers at start", function () {
    link.start(2, 3, function (m) { sent.push(m); }, function () {});
    waitsFor(function () { return sentOfType('p2p-offer'); }, "offer", 1000);
    runs(function () {
      var offer = sentOfType('p2p-offer');
      expect(offer.from).toEqual(2);
      expect(offer.to).toEqual(3);
      // Peer 1 is lower, so we wait for its offer rather than sending one.
      var offers = sent.filter(function (m) { return m.t === 'p2p-offer'; });
      expect(offers.length).toEqual(1);
    });
  });

  it("answers an incoming offer and opens a channel", function () {
    link.start(2, 2, function (m) { sent.push(m); }, function () {});
    // Player 1 (lower) offers to us; we are player 2 so we did not offer.
    link.handleSignal({ t: 'p2p-offer', from: 1, to: 2, sdp: { sdp: 'X' } });
    waitsFor(function () { return sentOfType('p2p-answer'); }, "answer", 1000);
    runs(function () {
      expect(sentOfType('p2p-answer').to).toEqual(1);
    });
  });

  it("ignores signaling addressed to another player", function () {
    link.start(2, 3, function (m) { sent.push(m); }, function () {});
    link.handleSignal({ t: 'p2p-offer', from: 1, to: 3, sdp: { sdp: 'X' } });
    expect(sentOfType('p2p-answer')).toBeNull();
  });

  it("sends inputs over every open channel", function () {
    link.start(1, 3, function (m) { sent.push(m); }, function () {});
    waitsFor(function () { return FakePC.instances.length === 2; }, "peers", 1000);
    runs(function () {
      link.send({ t: 'i', p: 1, n: 10, e: [] });
      var channels = FakePC.instances.map(function (pc) { return pc.dataChannel; }).filter(Boolean);
      expect(channels.length).toEqual(2);
      channels.forEach(function (ch) {
        expect(ch.sentData.length).toEqual(1);
      });
    });
  });

  it("delivers received inputs to the callback", function () {
    var received = [];
    link.start(1, 2, function () {}, function (m) { received.push(m); });
    waitsFor(function () { return FakePC.instances.length === 1 && FakePC.instances[0].dataChannel; }, "channel", 1000);
    runs(function () {
      var channel = FakePC.instances[0].dataChannel;
      channel.onmessage({ data: JSON.stringify({ t: 'i', p: 2, n: 5, e: [['d', 'left']] }) });
      expect(received.length).toEqual(1);
      expect(received[0].p).toEqual(2);
    });
  });

  it("stop closes all peer connections", function () {
    link.start(1, 3, function () {}, function () {});
    waitsFor(function () { return FakePC.instances.length === 2; }, "peers", 1000);
    runs(function () {
      link.stop();
      FakePC.instances.forEach(function (pc) { expect(pc.closed).toBeTruthy(); });
      expect(link.connectedCount()).toEqual(0);
    });
  });
});

describe("NetworkSession netcode improvements", function () {
  var ns;

  function build() {
    var keyboard = { drainEvents: function () { return []; } };
    var sceneManager = {
      getEventManager: function () { return new EventManager(); },
      toGameScene: function () {}
    };
    var n = new NetworkSession(keyboard, sceneManager);
    n._socket = { readyState: WebSocket.OPEN, send: function () {} };
    return n;
  }

  beforeEach(function () { ns = build(); });

  it("uses the per-match delay from the start message for the bootstrap", function () {
    ns._onMessage({ t: 'start', seed: 1, player: 1, players: 2, delay: 7 });
    expect(ns._inputDelay).toEqual(7);
    // The first 7 ticks of the remote queue are pre-filled empty.
    expect(ns._remoteQueues[2][0]).toEqual([]);
    expect(ns._remoteQueues[2][6]).toEqual([]);
    expect(ns._remoteQueues[2][7]).toBeUndefined();
  });

  it("falls back to the default delay when none is given", function () {
    ns._onMessage({ t: 'start', seed: 1, player: 1, players: 2 });
    expect(ns._inputDelay).toEqual(NetworkSession.INPUT_DELAY);
  });

  it("stores a peer input for a future tick", function () {
    ns._onMessage({ t: 'start', seed: 1, player: 1, players: 2, delay: 4 });
    ns._receiveInput(2, 20, [['d', 'up']]);
    expect(ns._remoteQueues[2][20]).toEqual([['d', 'up']]);
  });

  it("drops a stale input for a tick already past (dual-path duplicate)", function () {
    ns._onMessage({ t: 'start', seed: 1, player: 1, players: 2, delay: 4 });
    ns._currentTick = 30;
    ns._receiveInput(2, 20, [['d', 'up']]);   // arrived late over the second path
    expect(ns._remoteQueues[2][20]).toBeUndefined();
  });

  it("keeps an input that arrives for the current tick", function () {
    ns._onMessage({ t: 'start', seed: 1, player: 1, players: 2, delay: 4 });
    ns._currentTick = 20;
    ns._receiveInput(2, 20, [['u', 'up']]);
    expect(ns._remoteQueues[2][20]).toEqual([['u', 'up']]);
  });

  it("reports measured RTT back to the server on pong", function () {
    var reported = [];
    ns._socket.send = function (s) { reported.push(JSON.parse(s)); };
    ns._onMessage({ t: 'pong', ts: Date.now() - 40 });
    var rtt = reported.filter(function (m) { return m.t === 'rtt'; })[0];
    expect(rtt).toBeDefined();
    expect(rtt.ms).toBeGreaterThan(0);
  });
});
