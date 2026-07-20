// HTML overlay for the online lobby: browse/create/join rooms, then wait in a
// room until the match starts. Rendered as a DOM overlay (not on the canvas)
// so room codes can be typed and the public-room list tapped, on desktop and
// mobile alike. All server communication goes through the callbacks, which
// NetworkSession fills in.
function OnlineLobby(callbacks) {
  this._cb = callbacks || {};
  this._shareOrigin = '';
  this._container = null;
  this._browse = null;
  this._waiting = null;
  this._roomsEl = null;
  this._codeInput = null;
  this._errorEl = null;
  this._waitCode = null;
  this._waitVisibility = null;
  this._waitPlayers = null;
  this._waitRole = null;
  this._shareInput = null;
  this._startButton = null;
}

OnlineLobby.prototype.attach = function (container) {
  var self = this;

  this._container = document.createElement('div');
  this._container.id = 'online-lobby';
  this._container.style.display = 'none';

  // --- Browse screen ---
  this._browse = document.createElement('div');
  this._browse.className = 'lobby-screen';
  this._browse.appendChild(this._title('ONLINE'));

  this._errorEl = document.createElement('div');
  this._errorEl.className = 'lobby-error';
  this._browse.appendChild(this._errorEl);

  var actions = document.createElement('div');
  actions.className = 'lobby-actions';
  actions.appendChild(this._button('QUICK JOIN', function () { self._call('quickJoin'); }));
  actions.appendChild(this._button('CREATE PUBLIC', function () { self._call('create', true); }));
  actions.appendChild(this._button('CREATE PRIVATE', function () { self._call('create', false); }));
  this._browse.appendChild(actions);

  var codeRow = document.createElement('div');
  codeRow.className = 'lobby-coderow';
  this._codeInput = document.createElement('input');
  this._codeInput.className = 'lobby-code-input';
  this._codeInput.setAttribute('maxlength', '4');
  this._codeInput.setAttribute('placeholder', 'CODE');
  this._codeInput.setAttribute('autocapitalize', 'characters');
  this._codeInput.setAttribute('autocomplete', 'off');
  this._codeInput.addEventListener('input', function () {
    self._codeInput.value = self._codeInput.value.toUpperCase();
  });
  codeRow.appendChild(this._codeInput);
  codeRow.appendChild(this._button('JOIN', function () { self._joinTyped(); }));
  this._browse.appendChild(codeRow);

  var listHeader = document.createElement('div');
  listHeader.className = 'lobby-listheader';
  var listLabel = document.createElement('span');
  listLabel.textContent = 'PUBLIC ROOMS';
  listHeader.appendChild(listLabel);
  listHeader.appendChild(this._button('REFRESH', function () { self._call('refresh'); }, 'lobby-small'));
  this._browse.appendChild(listHeader);

  this._roomsEl = document.createElement('div');
  this._roomsEl.className = 'lobby-rooms';
  this._browse.appendChild(this._roomsEl);

  this._browse.appendChild(this._button('BACK', function () { self._call('cancel'); }, 'lobby-back'));

  // --- Waiting screen ---
  this._waiting = document.createElement('div');
  this._waiting.className = 'lobby-screen';
  this._waiting.style.display = 'none';
  this._waiting.appendChild(this._title('ROOM'));

  this._waitCode = document.createElement('div');
  this._waitCode.className = 'lobby-roomcode';
  this._waiting.appendChild(this._waitCode);

  this._waitVisibility = document.createElement('div');
  this._waitVisibility.className = 'lobby-line';
  this._waiting.appendChild(this._waitVisibility);

  this._waitPlayers = document.createElement('div');
  this._waitPlayers.className = 'lobby-line';
  this._waiting.appendChild(this._waitPlayers);

  this._waitRole = document.createElement('div');
  this._waitRole.className = 'lobby-line lobby-role';
  this._waiting.appendChild(this._waitRole);

  var shareRow = document.createElement('div');
  shareRow.className = 'lobby-coderow';
  this._shareInput = document.createElement('input');
  this._shareInput.className = 'lobby-share-input';
  this._shareInput.setAttribute('readonly', 'readonly');
  shareRow.appendChild(this._shareInput);
  shareRow.appendChild(this._button('COPY', function () { self._copyShare(); }, 'lobby-small'));
  this._waiting.appendChild(shareRow);

  this._startButton = this._button('START GAME', function () { self._call('start'); }, 'lobby-start');
  this._waiting.appendChild(this._startButton);
  this._waiting.appendChild(this._button('LEAVE', function () { self._call('leave'); }, 'lobby-back'));

  this._container.appendChild(this._browse);
  this._container.appendChild(this._waiting);
  container.appendChild(this._container);
};

OnlineLobby.prototype.setShareOrigin = function (origin) {
  this._shareOrigin = origin;
};

OnlineLobby.prototype.showBrowse = function () {
  this._errorEl.textContent = '';
  this._browse.style.display = '';
  this._waiting.style.display = 'none';
  this._container.style.display = '';
};

OnlineLobby.prototype.showWaiting = function (state) {
  this._browse.style.display = 'none';
  this._waiting.style.display = '';
  this._container.style.display = '';
  this._waitCode.textContent = state.code;
  this._shareInput.value = this._shareOrigin + '/?room=' + state.code;
  this.updateWaiting(state);
};

OnlineLobby.prototype.updateWaiting = function (state) {
  this._waitVisibility.textContent = state.isPublic ? 'PUBLIC ROOM' : 'PRIVATE ROOM';
  this._waitPlayers.textContent = 'PLAYERS ' + state.players + '/' + state.max;
  this._waitRole.textContent = state.position === 3 ? 'YOU ARE THE ENEMY' : 'YOU ARE TANK ' + state.position;
  var canStart = state.isHost && state.players >= 2;
  this._startButton.style.display = canStart ? '' : 'none';
}

OnlineLobby.prototype.setRooms = function (list) {
  var self = this;
  this._roomsEl.innerHTML = '';
  if (!list.length) {
    var empty = document.createElement('div');
    empty.className = 'lobby-empty';
    empty.textContent = 'NO OPEN ROOMS';
    this._roomsEl.appendChild(empty);
    return;
  }
  list.forEach(function (room) {
    var row = document.createElement('button');
    row.className = 'lobby-room';
    row.textContent = room.code + '   ' + room.count + '/' + room.max;
    row.addEventListener('click', function () { self._call('joinCode', room.code); });
    self._roomsEl.appendChild(row);
  });
};

OnlineLobby.prototype.showError = function (reason) {
  var messages = {
    room_not_found: 'ROOM NOT FOUND',
    room_full: 'ROOM IS FULL',
    room_started: 'GAME ALREADY STARTED'
  };
  this.showBrowse();  // switches view and clears any previous error
  this._errorEl.textContent = messages[reason] || 'ERROR';
};

OnlineLobby.prototype.hide = function () {
  if (this._container) {
    this._container.style.display = 'none';
  }
};

OnlineLobby.prototype._joinTyped = function () {
  var code = (this._codeInput.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 4) {
    this._call('joinCode', code);
  }
};

OnlineLobby.prototype._copyShare = function () {
  var url = this._shareInput.value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(function () {});
  } else {
    this._shareInput.focus();
    this._shareInput.select();
    try { document.execCommand('copy'); } catch (e) {}
  }
};

OnlineLobby.prototype._call = function (name) {
  var fn = this._cb[name];
  if (fn) {
    fn(Array.prototype.slice.call(arguments, 1)[0]);
  }
};

OnlineLobby.prototype._title = function (text) {
  var el = document.createElement('div');
  el.className = 'lobby-title';
  el.textContent = text;
  return el;
};

OnlineLobby.prototype._button = function (text, handler, extraClass) {
  var el = document.createElement('button');
  el.className = 'lobby-btn' + (extraClass ? ' ' + extraClass : '');
  el.textContent = text;
  el.addEventListener('click', handler);
  return el;
};
