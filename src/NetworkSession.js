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
  this._lobbyCount = 0;
  this._lobbyPosition = 0;
  this._lobbyMax = 3;
  this._statusText = '';
}

// Ticks of input latency hidden by the protocol (3 ticks = 60 ms at 50 FPS).
NetworkSession.INPUT_DELAY = 3;

NetworkSession.State = {};
NetworkSession.State.IDLE = 'idle';
NetworkSession.State.CONNECTING = 'connecting';
NetworkSession.State.LOBBY = 'lobby';
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

NetworkSession.prototype.start = function () {
  if (this.isActive()) {
    return;
  }
  var self = this;
  this._state = NetworkSession.State.CONNECTING;
  this._statusText = 'CONNECTING...';

  var protocol = window.location.protocol == 'https:' ? 'wss://' : 'ws://';
  this._socket = new WebSocket(protocol + window.location.host);

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

NetworkSession.prototype._onMessage = function (message) {
  if (this._voiceChat && VoiceChat.isSignal(message)) {
    this._voiceChat.handleSignal(message);
    return;
  }
  if (message.t == 'lobby') {
    this._state = NetworkSession.State.LOBBY;
    this._lobbyCount = message.count;
    this._lobbyPosition = message.position;
    this._lobbyMax = message.max;
  }
  else if (message.t == 'start') {
    this._beginMatch(message.seed, message.player, message.players);
  }
  else if (message.t == 'i') {
    if (this._remoteQueues[message.p] !== undefined) {
      this._remoteQueues[message.p][message.n] = message.e;
    }
  }
  else if (message.t == 'peer_left') {
    this._endSession();
  }
};

NetworkSession.prototype._beginMatch = function (seed, playerNumber, playersCount) {
  this._playerNumber = playerNumber;
  this._playersCount = playersCount === undefined ? 2 : playersCount;
  this._currentTick = 0;
  this._localQueue = {};
  this._remoteQueues = {};
  for (var p = 1; p <= this._playersCount; ++p) {
    if (p != this._playerNumber) {
      this._remoteQueues[p] = {};
    }
  }
  for (var t = 0; t < NetworkSession.INPUT_DELAY; ++t) {
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
    this._updateMenu(ctx);
  }
};

NetworkSession.prototype._updateMenu = function (ctx) {
  var self = this;
  var cancelled = false;
  this._keyboard.drainEvents().forEach(function (event) {
    if (event.name != Keyboard.Event.KEY_PRESSED) {
      return;
    }
    if (event.key == Keyboard.Key.SELECT) {
      cancelled = true;
    }
    else if (event.key == Keyboard.Key.START &&
             self._state == NetworkSession.State.LOBBY &&
             self._lobbyPosition == 1 && self._lobbyCount >= 2) {
      self._send({ t: 'begin' });
    }
  });
  if (cancelled) {
    this._endSession();
    return;
  }
  this._drawStatus(ctx);
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
  if (this._canAdvance()) {
    this._scheduleLocalInput();
    this._fireTickEvents();
    this._sceneManager.update();
    this._currentTick++;

    if (this._sceneManager.getScene() instanceof MainMenuScene) {
      this._endSession();
      return;
    }
  }
  this._sceneManager.draw(ctx);
};

NetworkSession.prototype._scheduleLocalInput = function () {
  var futureTick = this._currentTick + NetworkSession.INPUT_DELAY;
  var actions = [];
  this._keyboard.drainEvents().forEach(function (event) {
    var action = NetworkSession.keyToAction(event.key);
    if (action !== null) {
      actions.push([event.name == Keyboard.Event.KEY_PRESSED ? 'd' : 'u', action]);
    }
  });
  this._localQueue[futureTick] = actions;
  this._send({ t: 'i', p: this._playerNumber, n: futureTick, e: actions });
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
  if (this._voiceChat) {
    this._voiceChat.onMatchEnd();
  }
  if (this._socket) {
    this._socket.onclose = null;
    this._socket.onerror = null;
    this._socket.close();
    this._socket = null;
  }
  if (!(this._sceneManager.getScene() instanceof MainMenuScene)) {
    this._sceneManager.toMainMenuScene(true);
  }
};

NetworkSession.prototype._drawStatus = function (ctx) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "#ffffff";
  this._drawCentered(ctx, "ONLINE", 128);

  if (this._state == NetworkSession.State.LOBBY) {
    this._drawCentered(ctx, "PLAYERS " + this._lobbyCount + "/" + this._lobbyMax, 192);
    var role = this._lobbyPosition == 3 ? "YOU ARE THE ENEMY" : "YOU ARE TANK " + this._lobbyPosition;
    this._drawCentered(ctx, role, 224);
    this._drawCentered(ctx, "3RD PLAYER JOINS AS THE ENEMY", 256);
    if (this._lobbyPosition == 1 && this._lobbyCount >= 2) {
      this._drawCentered(ctx, "PRESS ENTER TO START", 304);
    }
    else {
      this._drawCentered(ctx, "WAITING FOR PLAYERS...", 304);
    }
  }
  else {
    this._drawCentered(ctx, this._statusText, 224);
  }
  this._drawCentered(ctx, "PRESS CTRL TO CANCEL", 368);
};

NetworkSession.prototype._drawCentered = function (ctx, text, y) {
  ctx.fillText(text, Math.floor((ctx.canvas.width - text.length * 16) / 2), y);
};
