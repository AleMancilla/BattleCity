function Keyboard(eventManager) {
  this._eventManager = eventManager;
  this._events = [];
  this._listen();
  this._keys = {};
}

Keyboard.Key = {};
Keyboard.Key.SPACE = 32;
Keyboard.Key.LEFT = 37;
Keyboard.Key.UP = 38;
Keyboard.Key.RIGHT = 39;
Keyboard.Key.DOWN = 40;
Keyboard.Key.S = 83;
Keyboard.Key.A = 65;
Keyboard.Key.D = 68;
Keyboard.Key.W = 87;
Keyboard.Key.F = 70;
// Virtual key codes for the online enemy player (player 3); never typed
// physically, only injected through the lockstep input stream.
Keyboard.Key.H = 72;
Keyboard.Key.I = 73;
Keyboard.Key.J = 74;
Keyboard.Key.K = 75;
Keyboard.Key.L = 76;
Keyboard.Key.SELECT = 17;
Keyboard.Key.START = 13;

Keyboard.Event = {};
Keyboard.Event.KEY_PRESSED = 'Keyboard.Event.KEY_PRESSED';
Keyboard.Event.KEY_RELEASED = 'Keyboard.Event.KEY_RELEASED';

Keyboard.prototype._listen = function () {
  var self = this;
  $(document).keydown(function (event) {
    if (!self._keys[event.which]) {
      self._keys[event.which] = true;
      self._events.push({name: Keyboard.Event.KEY_PRESSED, key: event.which});
    }
    event.preventDefault();
  });
  $(document).keyup(function (event) {
    if (self._keys[event.which]) {
      self._keys[event.which] = false;
      self._events.push({name: Keyboard.Event.KEY_RELEASED, key: event.which});
    }
    event.preventDefault();
  });
};

Keyboard.prototype.fireEvents = function () {
  this._events.forEach(function (event) {
    this._eventManager.fireEvent(event);
  }, this);
  this._events = [];
};

Keyboard.prototype.drainEvents = function () {
  var events = this._events;
  this._events = [];
  return events;
};
