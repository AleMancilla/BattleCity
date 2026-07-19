describe("TouchControls.isMobile", function () {
  it("detects Android phones", function () {
    expect(TouchControls.isMobile({userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)'})).toBeTruthy();
  });

  it("detects iPhones", function () {
    expect(TouchControls.isMobile({userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'})).toBeTruthy();
  });

  it("detects iPads that report the legacy iPad user agent", function () {
    expect(TouchControls.isMobile({userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)'})).toBeTruthy();
  });

  it("detects iPadOS masquerading as desktop macOS via touch points", function () {
    expect(TouchControls.isMobile({userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5})).toBeTruthy();
  });

  it("rejects a real desktop macOS without touch", function () {
    expect(TouchControls.isMobile({userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0})).toBeFalsy();
  });

  it("rejects desktop Windows", function () {
    expect(TouchControls.isMobile({userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})).toBeFalsy();
  });
});

describe("Keyboard press/release", function () {
  var keyboard;

  beforeEach(function () {
    // Build without _listen(), which needs jQuery + the DOM.
    keyboard = Object.create(Keyboard.prototype);
    keyboard._events = [];
    keyboard._keys = {};
  });

  it("press queues a single KEY_PRESSED and debounces held keys", function () {
    keyboard.press(Keyboard.Key.LEFT);
    keyboard.press(Keyboard.Key.LEFT);
    expect(keyboard._events).toEqual([
      {name: Keyboard.Event.KEY_PRESSED, key: Keyboard.Key.LEFT}
    ]);
  });

  it("release queues KEY_RELEASED only for a pressed key", function () {
    keyboard.release(Keyboard.Key.LEFT);
    expect(keyboard._events.length).toEqual(0);
    keyboard.press(Keyboard.Key.LEFT);
    keyboard.release(Keyboard.Key.LEFT);
    expect(keyboard._events).toEqual([
      {name: Keyboard.Event.KEY_PRESSED, key: Keyboard.Key.LEFT},
      {name: Keyboard.Event.KEY_RELEASED, key: Keyboard.Key.LEFT}
    ]);
  });

  it("can be pressed again after release", function () {
    keyboard.press(Keyboard.Key.SPACE);
    keyboard.release(Keyboard.Key.SPACE);
    keyboard.press(Keyboard.Key.SPACE);
    expect(keyboard._events.length).toEqual(3);
  });

  it("feeds the same fireEvents pipeline the physical keyboard uses", function () {
    var fired = [];
    keyboard._eventManager = { fireEvent: function (e) { fired.push(e); } };
    keyboard.press(Keyboard.Key.START);
    keyboard.fireEvents();
    expect(fired).toEqual([
      {name: Keyboard.Event.KEY_PRESSED, key: Keyboard.Key.START}
    ]);
  });
});
