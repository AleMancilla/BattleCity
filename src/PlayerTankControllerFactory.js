function PlayerTankControllerFactory(eventManager) {
  this._eventManager = eventManager;
  this._eventManager.addSubscriber(this, [PlayerTankFactory.Event.PLAYER_TANK_CREATED]);
}

PlayerTankControllerFactory.prototype.notify = function (event) {
  if (event.name == PlayerTankFactory.Event.PLAYER_TANK_CREATED) {
    this.create(event.tank);
  }
};

PlayerTankControllerFactory.prototype.create = function (tank) {
  var controller = new TankController(this._eventManager, tank);
  if (tank.getType() == Tank.Type.PLAYER_2) {
    controller.setMovementKeys({
      left: Keyboard.Key.A,
      right: Keyboard.Key.D,
      up: Keyboard.Key.W,
      down: Keyboard.Key.S
    });
    controller.setShootKey(Keyboard.Key.F);
  }
  return controller;
};
