function SpriteController(eventManager, sprite) {
  this._eventManager = eventManager;
  this._eventManager.addSubscriber(this, [Keyboard.Event.KEY_PRESSED, Keyboard.Event.KEY_RELEASED]);
  this._sprite = sprite;
  this._pauseListener = new PauseListener(this._eventManager);
  this._moveKeys = {
    left: Keyboard.Key.LEFT,
    right: Keyboard.Key.RIGHT,
    up: Keyboard.Key.UP,
    down: Keyboard.Key.DOWN
  };
}

SpriteController.prototype.setMovementKeys = function (keys) {
  this._moveKeys = keys;
};

SpriteController.prototype.destroy = function () {
  this._pauseListener.destroy();
  this._eventManager.removeSubscriber(this);
};

SpriteController.prototype.notify = function (event) {
  if (event.name == Keyboard.Event.KEY_PRESSED && !this._pauseListener.isPaused()) {
    this.keyPressed(event.key);
  }
  else if (event.name == Keyboard.Event.KEY_RELEASED) {
    this.keyReleased(event.key);
  }
};

SpriteController.prototype.keyPressed = function (key) {
  if (key == this._moveKeys.left) {
    this._sprite.setDirection(Sprite.Direction.LEFT);
    this._sprite.toNormalSpeed();
  }
  else if (key == this._moveKeys.right) {
    this._sprite.setDirection(Sprite.Direction.RIGHT);
    this._sprite.toNormalSpeed();
  }
  else if (key == this._moveKeys.up) {
    this._sprite.setDirection(Sprite.Direction.UP);
    this._sprite.toNormalSpeed();
  }
  else if (key == this._moveKeys.down) {
    this._sprite.setDirection(Sprite.Direction.DOWN);
    this._sprite.toNormalSpeed();
  }
};

SpriteController.prototype.keyReleased = function (key) {
  if (this._sprite.getDirection() == Sprite.Direction.LEFT && key == this._moveKeys.left ||
      this._sprite.getDirection() == Sprite.Direction.RIGHT && key == this._moveKeys.right ||
      this._sprite.getDirection() == Sprite.Direction.UP && key == this._moveKeys.up ||
      this._sprite.getDirection() == Sprite.Direction.DOWN && key == this._moveKeys.down) {
    this._sprite.stop();
  }
};
