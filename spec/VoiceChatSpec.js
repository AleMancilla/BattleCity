describe("VoiceChat", function () {
  var sent, gum, stream;

  function FakePC(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.addedTracks = [];
    this.addedIce = [];
    this.closed = false;
    this.onicecandidate = null;
    this.ontrack = null;
    FakePC.instances.push(this);
  }
  FakePC.instances = [];
  FakePC.prototype.addTrack = function (t) { this.addedTracks.push(t); };
  FakePC.prototype.createOffer = function () { return Promise.resolve({ type: 'offer', sdp: 'OFFER' }); };
  FakePC.prototype.createAnswer = function () { return Promise.resolve({ type: 'answer', sdp: 'ANSWER' }); };
  FakePC.prototype.setLocalDescription = function (d) { this.localDescription = d; return Promise.resolve(); };
  FakePC.prototype.setRemoteDescription = function (d) { this.remoteDescription = d; return Promise.resolve(); };
  FakePC.prototype.addIceCandidate = function (c) { this.addedIce.push(c); return Promise.resolve(); };
  FakePC.prototype.close = function () { this.closed = true; };

  function makeVoiceChat() {
    return new VoiceChat({
      getUserMedia: gum,
      RTCPeerConnection: FakePC,
      iceServers: []
    });
  }

  function sentTypes() {
    return sent.map(function (m) { return m.t; });
  }
  function lastSentOfType(t) {
    var found = null;
    sent.forEach(function (m) { if (m.t === t) found = m; });
    return found;
  }

  beforeEach(function () {
    sent = [];
    stream = { getTracks: function () { return [{ stop: function () {}, kind: 'audio' }]; } };
    gum = function () { return Promise.resolve(stream); };
    FakePC.instances = [];
  });

  it("recognizes its own signaling messages", function () {
    expect(VoiceChat.isSignal({ t: 'voice-join' })).toBeTruthy();
    expect(VoiceChat.isSignal({ t: 'voice-offer' })).toBeTruthy();
    expect(VoiceChat.isSignal({ t: 'i' })).toBeFalsy();
    expect(VoiceChat.isSignal({ t: 'start' })).toBeFalsy();
    expect(VoiceChat.isSignal(null)).toBeFalsy();
  });

  it("starts disabled and does nothing before a match", function () {
    var vc = makeVoiceChat();
    expect(vc.isEnabled()).toBeFalsy();
    vc.enable();
    expect(sent.length).toEqual(0);
  });

  it("announces itself and offers to higher-numbered peers already in voice", function () {
    var vc = makeVoiceChat();
    vc.onMatchStart(1, 2, function (m) { sent.push(m); });
    vc.handleSignal({ t: 'voice-join', from: 2 });   // peer 2 already talking
    vc.enable();

    waitsFor(function () { return lastSentOfType('voice-offer'); }, "offer to be sent", 1000);
    runs(function () {
      expect(sentTypes()).toContain('voice-join');
      var offer = lastSentOfType('voice-offer');
      expect(offer.from).toEqual(1);
      expect(offer.to).toEqual(2);
      expect(FakePC.instances.length).toEqual(1);
    });
  });

  it("as the higher-numbered peer, announces but waits for the offer", function () {
    var vc = makeVoiceChat();
    vc.onMatchStart(2, 2, function (m) { sent.push(m); });
    vc.handleSignal({ t: 'voice-join', from: 1 });
    vc.enable();

    waitsFor(function () { return lastSentOfType('voice-join'); }, "join to be sent", 1000);
    runs(function () {
      expect(lastSentOfType('voice-offer')).toBeNull();
      expect(FakePC.instances.length).toEqual(0);
    });
  });

  it("answers an incoming offer addressed to it", function () {
    var vc = makeVoiceChat();
    vc.onMatchStart(2, 2, function (m) { sent.push(m); });
    vc.enable();

    waitsFor(function () { return vc.isEnabled(); }, "enable", 1000);
    runs(function () {
      vc.handleSignal({ t: 'voice-offer', from: 1, to: 2, sdp: { type: 'offer', sdp: 'X' } });
    });
    waitsFor(function () { return lastSentOfType('voice-answer'); }, "answer", 1000);
    runs(function () {
      var answer = lastSentOfType('voice-answer');
      expect(answer.from).toEqual(2);
      expect(answer.to).toEqual(1);
      expect(FakePC.instances[0].remoteDescription.sdp).toEqual('X');
    });
  });

  it("ignores signaling addressed to another player", function () {
    var vc = makeVoiceChat();
    vc.onMatchStart(2, 3, function (m) { sent.push(m); });
    vc.enable();

    waitsFor(function () { return vc.isEnabled(); }, "enable", 1000);
    runs(function () {
      vc.handleSignal({ t: 'voice-offer', from: 1, to: 3, sdp: { sdp: 'X' } });
      expect(lastSentOfType('voice-answer')).toBeNull();
      expect(FakePC.instances.length).toEqual(0);
    });
  });

  it("closes a peer when it leaves voice", function () {
    var vc = makeVoiceChat();
    vc.onMatchStart(2, 2, function (m) { sent.push(m); });
    vc.enable();

    waitsFor(function () { return vc.isEnabled(); }, "enable", 1000);
    runs(function () {
      vc.handleSignal({ t: 'voice-offer', from: 1, to: 2, sdp: { sdp: 'X' } });
    });
    waitsFor(function () { return FakePC.instances.length === 1; }, "peer", 1000);
    runs(function () {
      var pc = FakePC.instances[0];
      vc.handleSignal({ t: 'voice-leave', from: 1 });
      expect(pc.closed).toBeTruthy();
      expect(vc.getConnectedCount()).toEqual(0);
    });
  });

  it("disabling broadcasts leave, closes peers and stops the mic", function () {
    var stopped = false;
    stream = { getTracks: function () { return [{ stop: function () { stopped = true; }, kind: 'audio' }]; } };
    var vc = makeVoiceChat();
    vc.onMatchStart(2, 2, function (m) { sent.push(m); });
    vc.enable();

    waitsFor(function () { return vc.isEnabled(); }, "enable", 1000);
    runs(function () {
      vc.handleSignal({ t: 'voice-offer', from: 1, to: 2, sdp: { sdp: 'X' } });
    });
    waitsFor(function () { return FakePC.instances.length === 1; }, "peer", 1000);
    runs(function () {
      var pc = FakePC.instances[0];
      vc.disable();
      expect(vc.isEnabled()).toBeFalsy();
      expect(sentTypes()).toContain('voice-leave');
      expect(pc.closed).toBeTruthy();
      expect(stopped).toBeTruthy();
    });
  });

  it("ends the match: disables and forgets peers", function () {
    var vc = makeVoiceChat();
    vc.onMatchStart(1, 2, function (m) { sent.push(m); });
    vc.enable();

    waitsFor(function () { return vc.isEnabled(); }, "enable", 1000);
    runs(function () {
      vc.onMatchEnd();
      expect(vc.isEnabled()).toBeFalsy();
      vc.enable();  // no session -> no effect
      var afterEnd = sent.filter(function (m) { return m.t === 'voice-join'; }).length;
      expect(afterEnd).toEqual(1);  // only the first enable announced
    });
  });
});
