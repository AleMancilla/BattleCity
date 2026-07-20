// BattleCity online server: serves the game files over HTTP and hosts named
// rooms over WebSocket, relaying the tick-tagged inputs (lockstep) and voice
// signaling between the members of each room.
//
// Usage: cd server && npm install && npm start
// Then players open http://<host>:8080 and choose ONLINE in the menu.

var http = require('http');
var fs = require('fs');
var path = require('path');
var WebSocketServer = require('ws').Server;

var PORT = process.env.PORT || 8080;
var ROOT = path.join(__dirname, '..');

var CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

var httpServer = http.createServer(function (req, res) {
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/') {
    urlPath = '/BattleCity.html';
  }
  var filePath = path.join(ROOT, path.normalize(urlPath));
  if (filePath.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate'
    });
    res.end(data);
  });
});

// --- Rooms ---
//
// Each room holds up to MAX_PLAYERS. Public rooms are listed so strangers can
// join the incomplete ones; private rooms are reachable only by their code.
// The match starts when a room fills up, or earlier when its host asks to
// begin (with at least 2 players). A room's members join order determines the
// player numbers (host = player 1).

var MAX_PLAYERS = 3;
var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
var rooms = {};

var wss = new WebSocketServer({ server: httpServer });

function generateCode() {
  var code;
  do {
    code = '';
    for (var i = 0; i < 4; ++i) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (rooms[code]);
  return code;
}

function publicRoomList() {
  var list = [];
  for (var code in rooms) {
    var room = rooms[code];
    if (room.isPublic && !room.started && room.members.length < MAX_PLAYERS) {
      list.push({ code: code, count: room.members.length, max: MAX_PLAYERS });
    }
  }
  return list;
}

// Push the public-room list to everyone who is browsing (not in a room).
function broadcastRooms() {
  var list = publicRoomList();
  wss.clients.forEach(function (socket) {
    if (!socket.room) {
      send(socket, { t: 'rooms', rooms: list });
    }
  });
}

function roomStateFor(socket) {
  var room = socket.room;
  return {
    code: room.code,
    isPublic: room.isPublic,
    position: room.members.indexOf(socket) + 1,
    players: room.members.length,
    isHost: room.members[0] === socket,
    max: MAX_PLAYERS
  };
}

function broadcastRoomState(room, type) {
  room.members.forEach(function (socket) {
    var state = roomStateFor(socket);
    state.t = type;
    send(socket, state);
  });
}

function joinRoom(socket, room) {
  room.members.push(socket);
  socket.room = room;
  send(socket, Object.assign({ t: 'joined' }, roomStateFor(socket)));
  // Tell the others already waiting that the roster changed.
  room.members.forEach(function (member) {
    if (member !== socket) {
      var state = roomStateFor(member);
      state.t = 'room_update';
      send(member, state);
    }
  });
  broadcastRooms();
  if (room.members.length >= MAX_PLAYERS) {
    startRoom(room);
  }
}

function startRoom(room) {
  if (room.started || room.members.length < 2) {
    return;
  }
  room.started = true;
  var seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  room.members.forEach(function (socket, i) {
    send(socket, { t: 'start', seed: seed, player: i + 1, players: room.members.length });
  });
  broadcastRooms();
  console.log('room ' + room.code + ' started: ' + room.members.length + ' players');
}

function leaveRoom(socket) {
  var room = socket.room;
  if (!room) {
    return;
  }
  socket.room = null;
  var index = room.members.indexOf(socket);
  if (index !== -1) {
    room.members.splice(index, 1);
  }
  if (room.members.length === 0) {
    delete rooms[room.code];
  } else if (room.started) {
    room.members.forEach(function (member) { send(member, { t: 'peer_left' }); });
  } else {
    broadcastRoomState(room, 'room_update');
  }
  broadcastRooms();
}

function pickQuickRoom() {
  // Fill the fullest still-joinable public room first, so games start sooner.
  var best = null;
  for (var code in rooms) {
    var room = rooms[code];
    if (room.isPublic && !room.started && room.members.length < MAX_PLAYERS) {
      if (!best || room.members.length > best.members.length) {
        best = room;
      }
    }
  }
  return best;
}

wss.on('connection', function (socket) {
  socket.isAlive = true;
  socket.room = null;
  socket.on('pong', function () { socket.isAlive = true; });

  send(socket, { t: 'rooms', rooms: publicRoomList() });

  socket.on('message', function (data) {
    var message;
    try { message = JSON.parse(data.toString()); } catch (e) { return; }

    if (message.t === 'list') {
      send(socket, { t: 'rooms', rooms: publicRoomList() });
    }
    else if (message.t === 'create') {
      if (socket.room) { leaveRoom(socket); }
      var room = { code: generateCode(), isPublic: !!message.public, members: [], started: false };
      rooms[room.code] = room;
      joinRoom(socket, room);
    }
    else if (message.t === 'join') {
      if (socket.room) { leaveRoom(socket); }
      var target = rooms[(message.code || '').toUpperCase()];
      if (!target) {
        send(socket, { t: 'error', reason: 'room_not_found' });
      } else if (target.started) {
        send(socket, { t: 'error', reason: 'room_started' });
      } else if (target.members.length >= MAX_PLAYERS) {
        send(socket, { t: 'error', reason: 'room_full' });
      } else {
        joinRoom(socket, target);
      }
    }
    else if (message.t === 'quick') {
      if (socket.room) { leaveRoom(socket); }
      var room = pickQuickRoom();
      if (!room) {
        room = { code: generateCode(), isPublic: true, members: [], started: false };
        rooms[room.code] = room;
      }
      joinRoom(socket, room);
    }
    else if (message.t === 'begin') {
      if (socket.room && socket.room.members[0] === socket) {
        startRoom(socket.room);
      }
    }
    else if (message.t === 'leave') {
      leaveRoom(socket);
      send(socket, { t: 'rooms', rooms: publicRoomList() });
    }
    else if (socket.room && socket.room.started) {
      // In-match traffic (inputs, voice signaling): relay to the other members.
      var text = data.toString();
      socket.room.members.forEach(function (member) {
        if (member !== socket && member.readyState === member.OPEN) {
          member.send(text);
        }
      });
    }
  });

  socket.on('close', function () {
    leaveRoom(socket);
  });
});

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

setInterval(function () {
  wss.clients.forEach(function (socket) {
    if (!socket.isAlive) {
      return socket.terminate();
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

function onListenError(err) {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use.');
    console.error('Stop the other process or run with another port: PORT=8081 npm start');
    process.exit(1);
  }
  throw err;
}

httpServer.on('error', onListenError);
wss.on('error', onListenError);

httpServer.listen(PORT, function () {
  console.log('BattleCity server running at http://localhost:' + PORT);
});
