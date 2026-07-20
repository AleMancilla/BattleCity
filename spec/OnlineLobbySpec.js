describe("OnlineLobby", function () {
  var lobby, container, calls;

  beforeEach(function () {
    calls = [];
    lobby = new OnlineLobby({
      quickJoin: function () { calls.push(['quickJoin']); },
      create: function (pub) { calls.push(['create', pub]); },
      joinCode: function (code) { calls.push(['joinCode', code]); },
      refresh: function () { calls.push(['refresh']); },
      start: function () { calls.push(['start']); },
      leave: function () { calls.push(['leave']); },
      cancel: function () { calls.push(['cancel']); }
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    lobby.attach(container);
    lobby.setShareOrigin('https://game.example');
  });

  afterEach(function () {
    document.body.removeChild(container);
  });

  it("lists public rooms as tappable rows that join by code", function () {
    lobby.setRooms([{ code: 'AB12', count: 1, max: 3 }, { code: 'CD34', count: 2, max: 3 }]);
    var rows = container.querySelectorAll('.lobby-room');
    expect(rows.length).toEqual(2);
    expect(rows[0].textContent).toContain('AB12');
    expect(rows[1].textContent).toContain('2/3');
    rows[1].click();
    expect(calls).toContain(['joinCode', 'CD34']);
  });

  it("shows a placeholder when there are no rooms", function () {
    lobby.setRooms([]);
    expect(container.querySelector('.lobby-empty')).not.toBeNull();
  });

  it("builds the share link from the room code", function () {
    lobby.showWaiting({ code: 'WXYZ', isPublic: true, position: 1, players: 1, isHost: true, max: 3 });
    expect(container.querySelector('.lobby-share-input').value).toEqual('https://game.example/?room=WXYZ');
    expect(container.querySelector('.lobby-roomcode').textContent).toEqual('WXYZ');
  });

  it("shows the start button only to a host with 2+ players", function () {
    lobby.showWaiting({ code: 'WXYZ', isPublic: true, position: 1, players: 1, isHost: true, max: 3 });
    var startBtn = container.querySelector('.lobby-start');
    expect(startBtn.style.display).toEqual('none');
    lobby.updateWaiting({ code: 'WXYZ', isPublic: true, position: 1, players: 2, isHost: true, max: 3 });
    expect(startBtn.style.display).not.toEqual('none');
    lobby.updateWaiting({ code: 'WXYZ', isPublic: true, position: 2, players: 2, isHost: false, max: 3 });
    expect(startBtn.style.display).toEqual('none');
  });

  it("labels the enemy role for the third slot", function () {
    lobby.showWaiting({ code: 'WXYZ', isPublic: false, position: 3, players: 3, isHost: false, max: 3 });
    expect(container.querySelector('.lobby-role').textContent).toEqual('YOU ARE THE ENEMY');
    expect(container.querySelector('.lobby-line').textContent).toEqual('PRIVATE ROOM');
  });

  it("reports create public vs private", function () {
    var buttons = container.querySelectorAll('.lobby-actions .lobby-btn');
    buttons[1].click();  // CREATE PUBLIC
    buttons[2].click();  // CREATE PRIVATE
    expect(calls).toContain(['create', true]);
    expect(calls).toContain(['create', false]);
  });

  it("joins the typed 4-letter code", function () {
    var input = container.querySelector('.lobby-code-input');
    input.value = 'ab12';
    container.querySelector('.lobby-coderow .lobby-btn').click();  // JOIN
    expect(calls).toContain(['joinCode', 'AB12']);
  });

  it("shows a friendly error message and returns to browse", function () {
    lobby.showWaiting({ code: 'WXYZ', isPublic: true, position: 1, players: 1, isHost: true, max: 3 });
    lobby.showError('room_full');
    expect(container.querySelector('.lobby-error').textContent).toEqual('ROOM IS FULL');
  });
});

describe("NetworkSession room protocol", function () {
  var ns, sent, lobby;

  function fakeLobby() {
    return {
      showBrowse: jasmine.createSpy('showBrowse'),
      showWaiting: jasmine.createSpy('showWaiting'),
      updateWaiting: jasmine.createSpy('updateWaiting'),
      setRooms: jasmine.createSpy('setRooms'),
      showError: jasmine.createSpy('showError'),
      hide: jasmine.createSpy('hide')
    };
  }

  beforeEach(function () {
    sent = [];
    var keyboard = { drainEvents: function () { return []; } };
    var sceneManager = {
      getEventManager: function () { return new EventManager(); },
      toGameScene: function () {}
    };
    ns = new NetworkSession(keyboard, sceneManager);
    ns._socket = { readyState: WebSocket.OPEN, send: function (s) { sent.push(JSON.parse(s)); } };
    lobby = fakeLobby();
    ns.setLobby(lobby);
  });

  it("sends the room commands the lobby triggers", function () {
    ns.quickJoin();
    ns.createRoom(true);
    ns.createRoom(false);
    ns.joinRoom('AB12');
    ns.refreshRooms();
    ns.hostStart();
    expect(sent).toEqual([
      { t: 'quick' },
      { t: 'create', public: true },
      { t: 'create', public: false },
      { t: 'join', code: 'AB12' },
      { t: 'list' },
      { t: 'begin' }
    ]);
  });

  it("routes a room list to the lobby", function () {
    ns._onMessage({ t: 'rooms', rooms: [{ code: 'AB12', count: 1, max: 3 }] });
    expect(lobby.setRooms).toHaveBeenCalledWith([{ code: 'AB12', count: 1, max: 3 }]);
  });

  it("enters WAITING and shows the room when joined", function () {
    ns._onMessage({ t: 'joined', code: 'AB12', isPublic: true, position: 1, players: 1, isHost: true, max: 3 });
    expect(ns.getState()).toEqual(NetworkSession.State.WAITING);
    expect(lobby.showWaiting).toHaveBeenCalled();
  });

  it("updates the waiting room on roster changes", function () {
    ns._onMessage({ t: 'room_update', code: 'AB12', players: 2, isHost: true, position: 1, isPublic: true, max: 3 });
    expect(lobby.updateWaiting).toHaveBeenCalled();
  });

  it("surfaces server errors through the lobby", function () {
    ns._onMessage({ t: 'error', reason: 'room_full' });
    expect(ns.getState()).toEqual(NetworkSession.State.BROWSING);
    expect(lobby.showError).toHaveBeenCalledWith('room_full');
  });

  it("hides the lobby and starts the match on start", function () {
    ns._onMessage({ t: 'start', seed: 42, player: 1, players: 2 });
    expect(lobby.hide).toHaveBeenCalled();
    expect(ns.getState()).toEqual(NetworkSession.State.PLAYING);
    expect(ns.getPlayerNumber()).toEqual(1);
  });
});
