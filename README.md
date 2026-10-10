# PROP HUNT 3D – Online setup

This folder is the whole online game. There is nothing to install.

- `server.js`  – game server (no dependencies, needs Node 18+)
- `index.html` – the game page (the server sends it to players)
- `package.json`

## Why it must be hosted
The server hands out the game page AND runs the multiplayer on the same web address.
The game inside the Claude preview cannot connect to outside servers, so online
only works when players open YOUR server's address.

## Try it on your computer (2 minutes)
1. Install Node.js (nodejs.org, LTS version).
2. Open a terminal in this folder and run:  `node server.js`
3. Open http://localhost:8080 in two browser tabs.
4. Play Online > Create Room in tab 1, then Join Room with the 4-letter code in tab 2.
   Host presses Start Match (needs at least 2 players, up to 8).

## Put it on the internet (so friends can join)
Easiest free-tier hosts: Render.com, Railway.app, Fly.io.
Render example:
1. Put these 3 files in a GitHub repository.
2. Render > New > Web Service > pick the repository.
3. Build command: (leave empty).  Start command: `node server.js`
4. After deploy, open the address Render gives you (https://something.onrender.com).
   Everybody opens that same address on their phone. Done.
(Free plans may sleep when idle; the first load can take ~30 seconds.)

## How a match works
- Up to 8 players per room; 1 random Hunter, everyone else Hides. Hunter rotates each round.
- Server controls the timer (30s hide, 120s hunt), catches, and who wins.
- Hiders can only pick a prop during the 30s hide phase.
- Hunter is blind during hiding and does not receive hider positions or props early.
- Moving faster than allowed is rejected and the player is snapped back.
- If the Hunter leaves, Hiders win. Host leaving passes host to the next player.

## Known limits (honest list)
- Needs at least 2 real players. No bots online.
- Players' walls/collision are checked on their own device, so a modified game
  could walk through walls (speed is checked, wall positions are not).
- Tested here with simulated clients, not with real phones over the internet.
  Expect to tune movement smoothness once real devices connect.
