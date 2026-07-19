describe("NetworkSession", function () {
  describe("#keyToAction", function () {
    it("maps player 1 style keys", function () {
      expect(NetworkSession.keyToAction(Keyboard.Key.LEFT)).toEqual('left');
      expect(NetworkSession.keyToAction(Keyboard.Key.RIGHT)).toEqual('right');
      expect(NetworkSession.keyToAction(Keyboard.Key.UP)).toEqual('up');
      expect(NetworkSession.keyToAction(Keyboard.Key.DOWN)).toEqual('down');
      expect(NetworkSession.keyToAction(Keyboard.Key.SPACE)).toEqual('shoot');
    });

    it("maps player 2 style keys to the same actions", function () {
      expect(NetworkSession.keyToAction(Keyboard.Key.A)).toEqual('left');
      expect(NetworkSession.keyToAction(Keyboard.Key.D)).toEqual('right');
      expect(NetworkSession.keyToAction(Keyboard.Key.W)).toEqual('up');
      expect(NetworkSession.keyToAction(Keyboard.Key.S)).toEqual('down');
      expect(NetworkSession.keyToAction(Keyboard.Key.F)).toEqual('shoot');
    });

    it("maps START and ignores unknown keys", function () {
      expect(NetworkSession.keyToAction(Keyboard.Key.START)).toEqual('start');
      expect(NetworkSession.keyToAction(999)).toBeNull();
    });
  });

  describe("#actionToKey", function () {
    it("maps actions to player 1 keys", function () {
      expect(NetworkSession.actionToKey('left', 1)).toEqual(Keyboard.Key.LEFT);
      expect(NetworkSession.actionToKey('right', 1)).toEqual(Keyboard.Key.RIGHT);
      expect(NetworkSession.actionToKey('up', 1)).toEqual(Keyboard.Key.UP);
      expect(NetworkSession.actionToKey('down', 1)).toEqual(Keyboard.Key.DOWN);
      expect(NetworkSession.actionToKey('shoot', 1)).toEqual(Keyboard.Key.SPACE);
    });

    it("maps actions to player 2 keys", function () {
      expect(NetworkSession.actionToKey('left', 2)).toEqual(Keyboard.Key.A);
      expect(NetworkSession.actionToKey('right', 2)).toEqual(Keyboard.Key.D);
      expect(NetworkSession.actionToKey('up', 2)).toEqual(Keyboard.Key.W);
      expect(NetworkSession.actionToKey('down', 2)).toEqual(Keyboard.Key.S);
      expect(NetworkSession.actionToKey('shoot', 2)).toEqual(Keyboard.Key.F);
    });

    it("maps actions to player 3 (enemy) virtual keys", function () {
      expect(NetworkSession.actionToKey('left', 3)).toEqual(Keyboard.Key.J);
      expect(NetworkSession.actionToKey('right', 3)).toEqual(Keyboard.Key.L);
      expect(NetworkSession.actionToKey('up', 3)).toEqual(Keyboard.Key.I);
      expect(NetworkSession.actionToKey('down', 3)).toEqual(Keyboard.Key.K);
      expect(NetworkSession.actionToKey('shoot', 3)).toEqual(Keyboard.Key.H);
    });

    it("maps start to the shared START key", function () {
      expect(NetworkSession.actionToKey('start', 1)).toEqual(Keyboard.Key.START);
      expect(NetworkSession.actionToKey('start', 2)).toEqual(Keyboard.Key.START);
      expect(NetworkSession.actionToKey('start', 3)).toEqual(Keyboard.Key.START);
    });

    it("round-trips tank actions through both tank players", function () {
      ['left', 'right', 'up', 'down', 'shoot'].forEach(function (action) {
        expect(NetworkSession.keyToAction(NetworkSession.actionToKey(action, 1))).toEqual(action);
        expect(NetworkSession.keyToAction(NetworkSession.actionToKey(action, 2))).toEqual(action);
      });
    });

    it("gives each player distinct virtual keys", function () {
      var keys = {};
      [1, 2, 3].forEach(function (player) {
        ['left', 'right', 'up', 'down', 'shoot'].forEach(function (action) {
          var key = NetworkSession.actionToKey(action, player);
          expect(keys[key]).toBeUndefined();
          keys[key] = true;
        });
      });
    });
  });

  it("is inactive when created", function () {
    var session = new NetworkSession({}, {});
    expect(session.isActive()).toBeFalsy();
  });
});

describe("Keyboard #drainEvents", function () {
  it("returns queued events and empties the queue", function () {
    var eventManager = new EventManager();
    spyOn(eventManager, 'fireEvent');
    var keyboard = Object.create(Keyboard.prototype);
    keyboard._eventManager = eventManager;
    keyboard._events = [{name: Keyboard.Event.KEY_PRESSED, key: Keyboard.Key.LEFT}];
    var drained = keyboard.drainEvents();
    expect(drained.length).toEqual(1);
    expect(keyboard.drainEvents().length).toEqual(0);
    keyboard.fireEvents();
    expect(eventManager.fireEvent).not.toHaveBeenCalled();
  });
});
