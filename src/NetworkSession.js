// Online 2-player mode over a WebSocket relay, using deterministic lockstep:
// both clients run the full simulation; only inputs travel over the wire.
//
// Each input is translated to an abstract action ('left', 'shoot', ...) and
// scheduled INPUT_DELAY ticks into the future. Tick N is simulated only when
// both players' inputs for N are known, so both simulations stay identical.
function NetworkSession(keyboard, sceneManager) {
  this._keyboard = keyboard;
  this._sceneManager = sceneManager;
  this._state = NetworkSession.State.IDLE;
  this._socket = null;
  this._playerNumber = 0;
  this._currentTick = 0;
  this._localQueue = {};
  this._remoteQueue = {};
  this._statusText = '';
}

// Ticks of input latency hidden by the protocol (3 ticks = 60 ms at 50 FPS).
NetworkSession.INPUT_DELAY = 3;

NetworkSession.State = {};
NetworkSession.State.IDLE = 'idle';
NetworkSession.State.CONNECTING = 'connecting';
NetworkSession.State.WAITING = 'waiting';
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
  else {
    if (action == 'left') { return Keyboard.Key.A; }
    if (action == 'right') { return Keyboard.Key.D; }
    if (action == 'up') { return Keyboard.Key.W; }
    if (action == 'down') { return Keyboard.Key.S; }
    if (action == 'shoot') { return Keyboard.Key.F; }
  }
  return null;
};

NetworkSession.prototype.isActive = function () {
  return this._state != NetworkSession.State.IDLE;
};

NetworkSession.prototype.getState = function () {
  return this._state;
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
  if (message.t == 'waiting') {
    this._state = NetworkSession.State.WAITING;
    this._statusText = 'WAITING FOR OPPONENT';
  }
  else if (message.t == 'start') {
    this._beginMatch(message.seed, message.player);
  }
  else if (message.t == 'i') {
    this._remoteQueue[message.n] = message.e;
  }
  else if (message.t == 'peer_left') {
    this._endSession();
  }
};

NetworkSession.prototype._beginMatch = function (seed, playerNumber) {
  this._playerNumber = playerNumber;
  this._currentTick = 0;
  this._localQueue = {};
  this._remoteQueue = {};
  for (var t = 0; t < NetworkSession.INPUT_DELAY; ++t) {
    this._localQueue[t] = [];
    this._remoteQueue[t] = [];
  }
  this._keyboard.drainEvents();
  Random.setSeed(seed);
  this._sceneManager.toGameScene(undefined, new Player(), new Player(Tank.Type.PLAYER_2));
  this._state = NetworkSession.State.PLAYING;
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
  var cancelled = this._keyboard.drainEvents().some(function (event) {
    return event.name == Keyboard.Event.KEY_PRESSED && event.key == Keyboard.Key.SELECT;
  });
  if (cancelled) {
    this._endSession();
    return;
  }
  this._drawStatus(ctx);
};

NetworkSession.prototype._updatePlaying = function (ctx) {
  if (this._localQueue[this._currentTick] !== undefined &&
      this._remoteQueue[this._currentTick] !== undefined) {
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
  this._send({ t: 'i', n: futureTick, e: actions });
};

NetworkSession.prototype._fireTickEvents = function () {
  // Both clients fire player 1's events before player 2's so the
  // simulations process identical event sequences.
  var mine = this._localQueue[this._currentTick];
  var theirs = this._remoteQueue[this._currentTick];
  var first = this._playerNumber == 1 ? mine : theirs;
  var second = this._playerNumber == 1 ? theirs : mine;
  this._firePlayerEvents(first, 1);
  this._firePlayerEvents(second, 2);
  delete this._localQueue[this._currentTick];
  delete this._remoteQueue[this._currentTick];
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
  ctx.fillText("ONLINE", 208, 160);
  ctx.fillText(this._statusText, (ctx.canvas.width - this._statusText.length * 16) / 2, 224);
  ctx.fillText("PRESS CTRL TO CANCEL", 96, 320);
};
