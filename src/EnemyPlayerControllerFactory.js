// Gives the online enemy player (player 3) control over the bots: whenever
// no enemy is under player control, the next enemy to spawn is taken over —
// its AI controller is removed and an EnemyPlayerController is attached.
// When the controlled enemy dies, control moves to the next spawn, so over a
// stage the player cycles through every enemy type, flashing reds included.
function EnemyPlayerControllerFactory(eventManager) {
  this._eventManager = eventManager;
  this._eventManager.addSubscriber(this, [
    EnemyFactory.Event.ENEMY_CREATED,
    Tank.Event.DESTROYED,
    PowerUpHandler.Event.FREEZE,
    FreezeTimer.Event.UNFREEZE
  ]);
  this._aiControllersContainer = null;
  this._controlledTank = null;
  this._controller = null;
  this._freezed = false;
}

EnemyPlayerControllerFactory.prototype.setAIControllersContainer = function (container) {
  this._aiControllersContainer = container;
};

EnemyPlayerControllerFactory.prototype.getControlledTank = function () {
  return this._controlledTank;
};

EnemyPlayerControllerFactory.prototype.notify = function (event) {
  if (event.name == EnemyFactory.Event.ENEMY_CREATED && this._controlledTank === null) {
    this.takeControl(event.enemy);
  }
  else if (event.name == Tank.Event.DESTROYED && event.tank === this._controlledTank) {
    this.releaseControl();
  }
  else if (event.name == PowerUpHandler.Event.FREEZE) {
    this._freezed = true;
  }
  else if (event.name == FreezeTimer.Event.UNFREEZE) {
    this._freezed = false;
  }
};

EnemyPlayerControllerFactory.prototype.takeControl = function (tank) {
  // The AI factory subscribes first, so by now the tank has an AI
  // controller: remove it before attaching the player controller.
  var controllers = this._aiControllersContainer.getControllers();
  for (var i = 0; i < controllers.length; ++i) {
    if (controllers[i].getTank() === tank) {
      controllers[i].destroy();
      break;
    }
  }
  tank.stop();
  this._controlledTank = tank;
  this._controller = new EnemyPlayerController(this._eventManager, tank);
  if (this._freezed) {
    this._controller.freeze();
  }
};

EnemyPlayerControllerFactory.prototype.releaseControl = function () {
  if (this._controller !== null) {
    this._controller.destroy();
  }
  this._controller = null;
  this._controlledTank = null;
};
