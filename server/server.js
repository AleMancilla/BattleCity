// BattleCity online server: serves the game files over HTTP and pairs
// players over WebSocket, relaying their tick-tagged inputs (lockstep).
//
// Usage: cd server && npm install && npm start
// Then both players open http://<host>:8080 and choose ONLINE in the menu.

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

// --- Matchmaking ---
//
// Clients gather in a lobby of up to 3. The first two are the tanks; an
// optional third player controls the enemy bots. The match starts when the
// lobby is full, or earlier when the host (first player) sends 'begin'.

var MAX_PLAYERS = 3;
var lobby = [];

var wss = new WebSocketServer({ server: httpServer });

function broadcastLobby() {
  lobby.forEach(function (socket, i) {
    send(socket, { t: 'lobby', count: lobby.length, position: i + 1, max: MAX_PLAYERS });
  });
}

function startMatch() {
  var members = lobby;
  lobby = [];
  var seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  members.forEach(function (socket, i) {
    socket.peers = members.filter(function (other) { return other !== socket; });
    send(socket, { t: 'start', seed: seed, player: i + 1, players: members.length });
  });
  console.log('match started: ' + members.length + ' players, seed=' + seed);
}

wss.on('connection', function (socket) {
  socket.isAlive = true;
  socket.peers = null;
  socket.on('pong', function () { socket.isAlive = true; });

  lobby.push(socket);
  broadcastLobby();
  if (lobby.length === MAX_PLAYERS) {
    startMatch();
  }

  socket.on('message', function (data) {
    var text = data.toString();
    var message;
    try { message = JSON.parse(text); } catch (e) { return; }

    if (message.t === 'begin') {
      // Only the host can start early, and only with at least 2 players.
      if (socket === lobby[0] && lobby.length >= 2) {
        startMatch();
      }
      return;
    }
    // Inputs are relayed verbatim to every peer; the server never simulates.
    if (socket.peers) {
      socket.peers.forEach(function (peer) {
        if (peer.readyState === peer.OPEN) {
          peer.send(text);
        }
      });
    }
  });

  socket.on('close', function () {
    var index = lobby.indexOf(socket);
    if (index !== -1) {
      lobby.splice(index, 1);
      broadcastLobby();
    }
    if (socket.peers) {
      socket.peers.forEach(function (peer) {
        if (peer.readyState === peer.OPEN) {
          send(peer, { t: 'peer_left' });
        }
      });
      socket.peers = null;
    }
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
