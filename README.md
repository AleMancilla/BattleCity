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

Players then open `http://<host>:8080` and choose ONLINE. Up to 3 players
share a match: the first two are the tanks, and an optional 3rd player is
**the enemy** — they take control of one of the attacking bots (marked with a
blinking white outline that only the enemy player can see; to the tanks the
human is indistinguishable from the AI) and respawn as the next bot each time
they die,
cycling through every enemy type, flashing reds included. The match starts
automatically when 3 players are in the lobby, or the first player can press
Enter to start with just 2. Everyone plays with the arrow keys (or WASD) and
shoots with Space (or F).

![Screenshot of the Battle City game](screenshot.jpg)
