// Keyboard control for the online enemy player (player 3). Listens for the
// player 3 virtual keys injected by NetworkSession and respects the freeze
// power-up like any other enemy.
function EnemyPlayerController(eventManager, tank) {
  TankController.call(this, eventManager, tank);
  this._eventManager.addSubscriber(this, [PowerUpHandler.Event.FREEZE, FreezeTimer.Event.UNFREEZE]);
  this._freezed = false;
  this.setMovementKeys({
    left: Keyboard.Key.J,
    right: Keyboard.Key.L,
    up: Keyboard.Key.I,
    down: Keyboard.Key.K
  });
  this.setShootKey(Keyboard.Key.H);
}

EnemyPlayerController.subclass(TankController);

EnemyPlayerController.prototype.notify = function (event) {
  TankController.prototype.notify.call(this, event);

  if (event.name == PowerUpHandler.Event.FREEZE) {
    this.freeze();
  }
  else if (event.name == FreezeTimer.Event.UNFREEZE) {
    this.unfreeze();
  }
};

EnemyPlayerController.prototype.keyPressed = function (key) {
  if (this._freezed) {
    return;
  }
  TankController.prototype.keyPressed.call(this, key);
};

EnemyPlayerController.prototype.isFreezed = function () {
  return this._freezed;
};

EnemyPlayerController.prototype.freeze = function () {
  this._freezed = true;
  this._sprite.stop();
};

EnemyPlayerController.prototype.unfreeze = function () {
  this._freezed = false;
};
