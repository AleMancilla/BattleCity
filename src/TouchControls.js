// On-screen controls for touch devices. Buttons inject key presses into the
// Keyboard so every mode (menu, local, online) reacts exactly as it does to a
// physical keyboard. Only built when isMobile() is true, so desktop is
// untouched. The d-pad sends the arrow keys, FIRE sends Space, and START /
// SELECT send Enter / Ctrl so the menu is navigable without a keyboard.
function TouchControls(keyboard) {
  this._keyboard = keyboard;
  this._buttons = [
    { key: Keyboard.Key.LEFT,   cls: 'tc-left',   glyph: '' },
    { key: Keyboard.Key.UP,     cls: 'tc-up',     glyph: '' },
    { key: Keyboard.Key.RIGHT,  cls: 'tc-right',  glyph: '' },
    { key: Keyboard.Key.DOWN,   cls: 'tc-down',   glyph: '' },
    { key: Keyboard.Key.SPACE,  cls: 'tc-fire',   glyph: 'B' },
    { key: Keyboard.Key.SELECT, cls: 'tc-select', glyph: 'SELECT' },
    { key: Keyboard.Key.START,  cls: 'tc-start',  glyph: 'START' }
  ];
}

// Detect phones/tablets. Accepts a navigator-like object for testability.
TouchControls.isMobile = function (nav) {
  nav = nav || (typeof navigator !== 'undefined' ? navigator : {});
  var ua = nav.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  // iPadOS 13+ reports a desktop macOS user agent; a touch-capable "Mac" is
  // really an iPad.
  if (/Macintosh/i.test(ua) && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 1) {
    return true;
  }
  return false;
};

// Build the control pad into the given container and mark the body so the
// mobile stylesheet applies.
TouchControls.prototype.attach = function (container) {
  document.body.className += (document.body.className ? ' ' : '') + 'touch';

  var pad = document.createElement('div');
  pad.id = 'touch-controls';

  var dpad = document.createElement('div');
  dpad.id = 'touch-dpad';

  var system = document.createElement('div');
  system.id = 'touch-system';

  var actions = document.createElement('div');
  actions.id = 'touch-actions';

  this._buttons.forEach(function (spec) {
    var button = this._createButton(spec);
    if (spec.cls == 'tc-fire') {
      actions.appendChild(button);
    }
    else if (spec.cls == 'tc-select' || spec.cls == 'tc-start') {
      system.appendChild(button);
    }
    else {
      dpad.appendChild(button);
    }
  }, this);

  pad.appendChild(dpad);
  pad.appendChild(system);
  pad.appendChild(actions);
  container.appendChild(pad);
};

TouchControls.prototype._createButton = function (spec) {
  var button = document.createElement('div');
  button.className = 'tc-btn ' + spec.cls;
  button.textContent = spec.glyph;
  this._bind(button, spec.key);
  return button;
};

// Pointer events unify touch and mouse and support multi-touch. Release is
// bound on the document and matched by pointerId, so the key is released no
// matter where the finger lifts (even after sliding off the button) while a
// second finger held on another button keeps its own key down.
TouchControls.prototype._bind = function (element, key) {
  var self = this;
  var activePointerId = null;

  var release = function (event) {
    if (activePointerId === null) {
      return;
    }
    if (event && event.pointerId !== undefined && event.pointerId !== activePointerId) {
      return;
    }
    activePointerId = null;
    element.className = element.className.replace(/ ?pressed/, '');
    self._keyboard.release(key);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
  };

  element.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    if (activePointerId !== null) {
      return;
    }
    activePointerId = event.pointerId;
    element.className += ' pressed';
    self._keyboard.press(key);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  });

  element.addEventListener('contextmenu', function (event) { event.preventDefault(); });
};
