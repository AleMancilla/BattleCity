JavaScript/HTML5 remake of the Famicom "Battle City" game
=====================================================

[Play](http://newagebegins.github.io/BattleCity/BattleCity.html)  
[Run tests](http://newagebegins.github.io/BattleCity/SpecRunner.html)

The code was written with TDD (Test-Driven Development) methodology.

Local 2-player co-op mode is available from the main menu ("2 PLAYERS"):

- Player 1 (yellow tank): arrow keys to move, Space to shoot.
- Player 2 (green tank): W/A/S/D to move, F to shoot.

To run locally, serve the directory over HTTP (e.g. `python3 -m http.server 8000`)
and open `http://localhost:8000/BattleCity.html`.

Online 2-player mode ("ONLINE" in the main menu) uses deterministic lockstep
over a WebSocket relay. To play online, run the bundled server instead:

    cd server
    npm install
    npm start

Players then open `http://<host>:8080` and choose ONLINE. This opens the room
browser, where you can **quick join** (drop into an open public room, or start
a fresh one if none are open), **create** a public or private room, **join by
code**, or tap a room in the public list. Each room holds up to 3 players and
shows a shareable code (and a `?room=CODE` link — open it to jump straight in).
Public incomplete rooms are listed for strangers to join; private rooms are
reachable only by their code. A room starts when it fills up, or when its host
presses START. Up to 3 players
share a match: the first two are the tanks, and an optional 3rd player is
**the enemy** — they take control of one of the attacking bots (marked with a
blinking white outline that only the enemy player can see; to the tanks the
human is indistinguishable from the AI) and respawn as the next bot each time
they die, cycling through every enemy type, flashing reds included. The match
starts automatically when 3 players are in the lobby, or the first player can
press Enter to start with just 2. Everyone plays with the arrow keys (or WASD)
and shoots with Space (or F).

### Voice chat

During an online match a **VOICE** button appears (top-right). Each player can
turn their own microphone on or off; two players hear each other only when both
have voice enabled. Audio is peer-to-peer over WebRTC — only the connection
setup uses the relay, so voice stays within the room. Requires microphone
permission and a secure origin (HTTPS or localhost); the Render deployment is
HTTPS, so it works there. A public STUN server handles most home networks;
players behind very restrictive NATs may not connect (that would need a TURN
server, which the free setup does not include).

Mobile
------

On phones and tablets an on-screen control pad appears automatically (a d-pad,
a fire button, and START / SELECT so the menu is reachable without a keyboard).
Desktop is unaffected — it keeps the physical keyboard controls. The pad drives
every mode, including online play.

Deploying (free hosting on Render)
----------------------------------

The repo includes a `render.yaml` blueprint. Push the repo to your own
GitHub, then on [render.com](https://render.com): **New → Blueprint**, connect
the repo and deploy. The single service serves both the game files and the
WebSocket relay, so the resulting `https://<name>.onrender.com` URL is all
players need. Note that free instances sleep after 15 idle minutes; the
first visit afterwards takes up to a minute to wake the server.

![Screenshot of the Battle City game](screenshot.jpg)
