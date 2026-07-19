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
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
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

// --- Matchmaking: first client waits, second client starts the match. ---

var waiting = null;

var wss = new WebSocketServer({ server: httpServer });

wss.on('connection', function (socket) {
  socket.isAlive = true;
  socket.on('pong', function () { socket.isAlive = true; });

  if (waiting === null || waiting.readyState !== waiting.OPEN) {
    waiting = socket;
    socket.peer = null;
    send(socket, { t: 'waiting' });
  }
  else {
    var host = waiting;
    waiting = null;
    host.peer = socket;
    socket.peer = host;
    var seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    send(host, { t: 'start', seed: seed, player: 1 });
    send(socket, { t: 'start', seed: seed, player: 2 });
    console.log('match started, seed=' + seed);
  }

  socket.on('message', function (data) {
    // Inputs are relayed verbatim to the peer; the server never simulates.
    if (socket.peer && socket.peer.readyState === socket.peer.OPEN) {
      socket.peer.send(data.toString());
    }
  });

  socket.on('close', function () {
    if (waiting === socket) {
      waiting = null;
    }
    if (socket.peer && socket.peer.readyState === socket.peer.OPEN) {
      send(socket.peer, { t: 'peer_left' });
      socket.peer.peer = null;
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

httpServer.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use.');
    console.error('Stop the other process or run with another port: PORT=8081 npm start');
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, function () {
  console.log('BattleCity server running at http://localhost:' + PORT);
});
