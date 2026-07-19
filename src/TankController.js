function TankController(eventManager, tank) {
  SpriteController.call(this, eventManager, tank);
  this._eventManager.addSubscriber(this, [BaseExplosion.Event.DESTROYED]);
  this._active = true;
  this._shootKey = Keyboard.Key.SPACE;
}

TankController.subclass(SpriteController);

TankController.prototype.setShootKey = function (key) {
  this._shootKey = key;
};

TankController.prototype.notify = function (event) {
  SpriteController.prototype.notify.call(this, event);
  
  if (event.name == BaseExplosion.Event.DESTROYED) {
    this._sprite.stop();
    this._active = false;
  }
};

TankController.prototype.keyPressed = function (key) {
  if (!this._active || !this._sprite.canMove()) {
    return;
  }
  SpriteController.prototype.keyPressed.call(this, key);
  
  if (key == this._shootKey) {
    this._sprite.shoot();
  }
};
