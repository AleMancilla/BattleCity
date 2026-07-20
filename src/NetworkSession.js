// Online multiplayer over a WebSocket relay, using deterministic lockstep:
// every client runs the full simulation; only inputs travel over the wire.
//
// Matches have 2 or 3 players: players 1 and 2 are the tanks, the optional
// player 3 controls the enemy bots (see EnemyPlayerControllerFactory).
//
// Each input is translated to an abstract action ('left', 'shoot', ...) and
// scheduled INPUT_DELAY ticks into the future. Tick N is simulated only when
// every player's inputs for N are known, and events always fire in player
// order (1, 2, 3), so all simulations stay identical.
function NetworkSession(keyboard, sceneManager, voiceChat) {
  this._keyboard = keyboard;
  this._sceneManager = sceneManager;
  this._voiceChat = voiceChat || null;
  this._state = NetworkSession.State.IDLE;
  this._socket = null;
  this._playerNumber = 0;
  this._playersCount = 0;
  this._currentTick = 0;
  this._localQueue = {};
  this._remoteQueues = {};
  this._lobby = null;
  this._pendingRoomCode = null;
  this._gameLink = null;            // P2P input mesh, set via setGameLink
  this._inputDelay = NetworkSession.INPUT_DELAY;
  this._matchStartTime = null;
  this._pingTimer = null;
  this._rtt = 0;
}

// Default ticks of input latency hidden by the protocol. The server sizes
// the real per-match delay to the measured round-trip latency (see 'start').
NetworkSession.INPUT_DELAY = 4;

// Milliseconds per simulation tick (50 FPS).
NetworkSession.TICK_MS = 20;

// Most ticks a single frame may advance while catching up after a stall. This
// lets the sim recover a latency deficit instead of accumulating it forever,
// without a huge one-frame burst.
NetworkSession.MAX_CATCHUP = 10;

NetworkSession.State = {};
NetworkSession.State.IDLE = 'idle';
NetworkSession.State.CONNECTING = 'connecting';
NetworkSession.State.BROWSING = 'browsing';   // choosing/creating a room
NetworkSession.State.WAITING = 'waiting';      // in a room, before the match
NetworkSession.State.PLAYING = 'playing';

// Singleton wired up in BattleCity.html; used by OnlineMenuItem.
NetworkSession.instance = null;

NetworkSession.keyToAction = function (key) {
  if (key == Keyboard.Key.LEFT || key == Keyboard.Key.A) { return 'left'; }
  if (key == Keyboard.Key.RIGHT || key == Keyboard.Key.D) { return 'right'; }
  if (key == Keyboard.Key.UP || key == Keyboard.Key.W) { return 'up'; }
  if (key == Keyboard.Key.DOWN || key == Keyboard.Key.S) { return 'down'; }
  if (key == Keyboard.Key.SPACE || key == Keyboard.Key.F) { return 'shoot'; }
  if (key == Keyboard.Key.START) { return 'start'; }
  return null;
};

NetworkSession.actionToKey = function (action, playerNumber) {
  if (action == 'start') { return Keyboard.Key.START; }
  if (playerNumber == 1) {
    if (action == 'left') { return Keyboard.Key.LEFT; }
    if (action == 'right') { return Keyboard.Key.RIGHT; }
    if (action == 'up') { return Keyboard.Key.UP; }
    if (action == 'down') { return Keyboard.Key.DOWN; }
    if (action == 'shoot') { return Keyboard.Key.SPACE; }
  }
  else if (playerNumber == 2) {
    if (action == 'left') { return Keyboard.Key.A; }
    if (action == 'right') { return Keyboard.Key.D; }
    if (action == 'up') { return Keyboard.Key.W; }
    if (action == 'down') { return Keyboard.Key.S; }
    if (action == 'shoot') { return Keyboard.Key.F; }
  }
  else {
    if (action == 'left') { return Keyboard.Key.J; }
    if (action == 'right') { return Keyboard.Key.L; }
    if (action == 'up') { return Keyboard.Key.I; }
    if (action == 'down') { return Keyboard.Key.K; }
    if (action == 'shoot') { return Keyboard.Key.H; }
  }
  return null;
};

NetworkSession.prototype.isActive = function () {
  return this._state != NetworkSession.State.IDLE;
};

NetworkSession.prototype.getState = function () {
  return this._state;
};

NetworkSession.prototype.getPlayerNumber = function () {
  return this._playerNumber;
};

NetworkSession.prototype.setLobby = function (lobby) {
  this._lobby = lobby;
};

NetworkSession.prototype.setGameLink = function (gameLink) {
  this._gameLink = gameLink;
};

// Connect and open the lobby. If roomCode is given (e.g. from a shared link),
// join that room directly instead of showing the browser.
NetworkSession.prototype.start = function (roomCode) {
  if (this.isActive()) {
    return;
  }
  var self = this;
  this._pendingRoomCode = roomCode || null;
  this._state = NetworkSession.State.CONNECTING;

  var protocol = window.location.protocol == 'https:' ? 'wss://' : 'ws://';
  this._socket = new WebSocket(protocol + window.location.host);

  this._socket.onopen = function () {
    self._startPinging();
    if (self._pendingRoomCode) {
      self._state = NetworkSession.State.BROWSING;
      self.joinRoom(self._pendingRoomCode);
      self._pendingRoomCode = null;
    } else {
      self._state = NetworkSession.State.BROWSING;
      if (self._lobby) { self._lobby.showBrowse(); }
    }
  };
  this._socket.onmessage = function (event) {
    self._onMessage(JSON.parse(event.data));
  };
  this._socket.onerror = function () {
    self._endSession();
  };
  this._socket.onclose = function () {
    self._endSession();
  };
};

// --- Room commands (called by the lobby UI) ---

NetworkSession.prototype.quickJoin = function () {
  this._send({ t: 'quick' });
};

NetworkSession.prototype.createRoom = function (isPublic) {
  this._send({ t: 'create', public: !!isPublic });
};

NetworkSession.prototype.joinRoom = function (code) {
  this._send({ t: 'join', code: code });
};

NetworkSession.prototype.refreshRooms = function () {
  this._send({ t: 'list' });
};

NetworkSession.prototype.hostStart = function () {
  this._send({ t: 'begin' });
};

NetworkSession.prototype.leaveRoom = function () {
  this._send({ t: 'leave' });
  this._state = NetworkSession.State.BROWSING;
  if (this._lobby) { this._lobby.showBrowse(); }
};

NetworkSession.prototype.cancel = function () {
  this._endSession();
};

NetworkSession.prototype._onMessage = function (message) {
  if (this._voiceChat && VoiceChat.isSignal(message)) {
    this._voiceChat.handleSignal(message);
    return;
  }
  if (this._gameLink && GameLink.isSignal(message)) {
    this._gameLink.handleSignal(message);
    return;
  }
  if (message.t == 'pong') {
    this._onPong(message.ts);
    return;
  }
  if (message.t == 'rooms') {
    if (this._lobby) { this._lobby.setRooms(message.rooms); }
  }
  else if (message.t == 'joined') {
    this._state = NetworkSession.State.WAITING;
    if (this._lobby) { this._lobby.showWaiting(message); }
  }
  else if (message.t == 'room_update') {
    if (this._lobby) { this._lobby.updateWaiting(message); }
  }
  else if (message.t == 'error') {
    this._state = NetworkSession.State.BROWSING;
    if (this._lobby) { this._lobby.showError(message.reason); }
  }
  else if (message.t == 'start') {
    if (this._lobby) { this._lobby.hide(); }
    this._beginMatch(message.seed, message.player, message.players, message.delay);
  }
  else if (message.t == 'i') {
    this._receiveInput(message.p, message.n, message.e);
  }
  else if (message.t == 'peer_left') {
    this._endSession();
  }
};

// Store a peer's input for a future tick. Idempotent and guarded against
// stale arrivals, so an input may safely arrive over both the relay and the
// P2P channel (whichever gets there first wins; a late duplicate is dropped).
NetworkSession.prototype._receiveInput = function (p, n, e) {
  if (this._remoteQueues[p] !== undefined && n >= this._currentTick) {
    this._remoteQueues[p][n] = e;
  }
};

NetworkSession.prototype._onPong = function (ts) {
  var rtt = Date.now() - ts;
  this._rtt = this._rtt ? Math.round(0.7 * this._rtt + 0.3 * rtt) : rtt;
  this._send({ t: 'rtt', ms: this._rtt });
};

NetworkSession.prototype._startPinging = function () {
  var self = this;
  this._stopPinging();
  var ping = function () { self._send({ t: 'ping', ts: Date.now() }); };
  ping();
  this._pingTimer = setInterval(ping, 1000);
};

NetworkSession.prototype._stopPinging = function () {
  if (this._pingTimer !== null) {
    clearInterval(this._pingTimer);
    this._pingTimer = null;
  }
};

NetworkSession.prototype._beginMatch = function (seed, playerNumber, playersCount, delay) {
  this._stopPinging();
  this._playerNumber = playerNumber;
  this._playersCount = playersCount === undefined ? 2 : playersCount;
  // The server sizes the delay to the round-trip latency; all clients get the
  // same value so the bootstrap (below) stays consistent across the match.
  this._inputDelay = delay || NetworkSession.INPUT_DELAY;
  this._currentTick = 0;
  this._matchStartTime = null;
  this._localQueue = {};
  this._remoteQueues = {};
  for (var p = 1; p <= this._playersCount; ++p) {
    if (p != this._playerNumber) {
      this._remoteQueues[p] = {};
    }
  }
  for (var t = 0; t < this._inputDelay; ++t) {
    this._localQueue[t] = [];
    for (var q in this._remoteQueues) {
      this._remoteQueues[q][t] = [];
    }
  }
  this._keyboard.drainEvents();
  Random.setSeed(seed);
  var hasEnemyPlayer = this._playersCount == 3;
  this._sceneManager.toGameScene(undefined, new Player(), new Player(Tank.Type.PLAYER_2), hasEnemyPlayer);
  this._state = NetworkSession.State.PLAYING;
  var self = this;
  if (this._gameLink) {
    this._gameLink.start(this._playerNumber, this._playersCount, this._send.bind(this),
      function (msg) { self._receiveInput(msg.p, msg.n, msg.e); });
  }
  if (this._voiceChat) {
    this._voiceChat.onMatchStart(this._playerNumber, this._playersCount, this._send.bind(this));
  }
};

// Called from the main loop instead of the normal keyboard/update path
// while the session is active.
NetworkSession.prototype.update = function (ctx) {
  if (this._state == NetworkSession.State.PLAYING) {
    this._updatePlaying(ctx);
  }
  else {
    // Connecting / browsing / waiting: the HTML lobby overlay is the UI, so
    // just keep the canvas blank behind it and discard any stray key input.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this._keyboard.drainEvents();
  }
};

NetworkSession.prototype._canAdvance = function () {
  if (this._localQueue[this._currentTick] === undefined) {
    return false;
  }
  for (var p in this._remoteQueues) {
    if (this._remoteQueues[p][this._currentTick] === undefined) {
      return false;
    }
  }
  return true;
};

NetworkSession.prototype._updatePlaying = function (ctx) {
  var now = Date.now();
  if (this._matchStartTime === null) {
    this._matchStartTime = now;
  }
  // Pace to the wall clock: advance toward the tick that real time is at, and
  // process several ticks in one frame (capped) when catching up after a
  // stall — but never run ahead of real time in steady state.
  var targetTick = Math.floor((now - this._matchStartTime) / NetworkSession.TICK_MS);
  var processed = 0;
  while (this._currentTick < targetTick &&
         processed < NetworkSession.MAX_CATCHUP &&
         this._canAdvance()) {
    this._scheduleLocalInput();
    this._fireTickEvents();
    this._sceneManager.update();
    this._currentTick++;
    processed++;

    if (this._sceneManager.getScene() instanceof MainMenuScene) {
      this._endSession();
      return;
    }
  }
  this._sceneManager.draw(ctx);
};

NetworkSession.prototype._scheduleLocalInput = function () {
  var futureTick = this._currentTick + this._inputDelay;
  var actions = [];
  this._keyboard.drainEvents().forEach(function (event) {
    var action = NetworkSession.keyToAction(event.key);
    if (action !== null) {
      actions.push([event.name == Keyboard.Event.KEY_PRESSED ? 'd' : 'u', action]);
    }
  });
  this._localQueue[futureTick] = actions;
  var message = { t: 'i', p: this._playerNumber, n: futureTick, e: actions };
  // Send over the relay (always) and P2P (when connected). The receiver keeps
  // whichever arrives first, so P2P gives the speed and the relay the safety.
  this._send(message);
  if (this._gameLink) {
    this._gameLink.send(message);
  }
};

NetworkSession.prototype._fireTickEvents = function () {
  // Every client fires the players' events in the same order (1, 2, 3) so
  // the simulations process identical event sequences.
  for (var p = 1; p <= this._playersCount; ++p) {
    var actions = p == this._playerNumber ?
      this._localQueue[this._currentTick] :
      this._remoteQueues[p][this._currentTick];
    this._firePlayerEvents(actions, p);
  }
  delete this._localQueue[this._currentTick];
  for (var q in this._remoteQueues) {
    delete this._remoteQueues[q][this._currentTick];
  }
};

NetworkSession.prototype._firePlayerEvents = function (actions, playerNumber) {
  var eventManager = this._sceneManager.getEventManager();
  actions.forEach(function (entry) {
    var key = NetworkSession.actionToKey(entry[1], playerNumber);
    if (key !== null) {
      eventManager.fireEvent({
        name: entry[0] == 'd' ? Keyboard.Event.KEY_PRESSED : Keyboard.Event.KEY_RELEASED,
        key: key
      });
    }
  });
};

NetworkSession.prototype._send = function (message) {
  if (this._socket && this._socket.readyState == WebSocket.OPEN) {
    this._socket.send(JSON.stringify(message));
  }
};

NetworkSession.prototype._endSession = function () {
  if (this._state == NetworkSession.State.IDLE) {
    return;
  }
  this._state = NetworkSession.State.IDLE;
  this._stopPinging();
  if (this._gameLink) {
    this._gameLink.stop();
  }
  if (this._voiceChat) {
    this._voiceChat.onMatchEnd();
  }
  if (this._socket) {
    this._socket.onclose = null;
    this._socket.onerror = null;
    this._socket.close();
    this._socket = null;
  }
  if (this._lobby) {
    this._lobby.hide();
  }
  if (!(this._sceneManager.getScene() instanceof MainMenuScene)) {
    this._sceneManager.toMainMenuScene(true);
  }
};
