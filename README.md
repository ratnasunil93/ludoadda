# Chaupar — Online Ludo (Ludo King–style)

A browser-based, real-time multiplayer Ludo game: room codes, 2–4 players on
different devices, standard rules (roll a 6 to exit, captures, safe cells,
extra turn on 6, three 6's forfeits, exact roll to finish).

- **Client**: single HTML/CSS/JS file (`public/index.html`), no build step.
- **Server**: Node.js + Express + Socket.IO (`server.js`), authoritative —
  it owns the game state so players can't cheat by editing the page.

Because it's *online* multiplayer across devices, it needs a small always-on
server — that can't run inside this chat, so you'll deploy it (free tier is
enough for playing with friends).

## 1. Run it locally first (optional but recommended)

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser tabs to test — create a room in
one, join with the code in the other.

## 2. Deploy for free so friends on other devices can join

**Render.com** (easiest, no credit card):
1. Push this folder to a new GitHub repo.
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Build command: `npm install` · Start command: `npm start`
4. Deploy. Render gives you a URL like `https://your-app.onrender.com` —
   that's the single link everyone opens to play.

Other options that work the same way: **Railway.app**, **Fly.io**, or
**Glitch.com** (Glitch even lets you paste the code directly, no GitHub
needed).

> Free tiers on Render/Railway "sleep" after inactivity — the first person
> to open the link after a while may wait ~30s for it to wake up. Fine for
> casual games with friends; upgrade to a paid tier if you want it always warm.

## Playing against AI

Click **"🤖 Play vs AI (solo)"** right on the lobby screen for an instant
1-tap solo game — it creates a room, fills the other 3 seats with bots, and
starts immediately. Or, in the waiting room, click **"+ Add AI player"** to
add bots one at a time alongside real friends (any mix of humans and bots,
up to 4 total). Bots play through the same turn-timer system as humans,
just with a short "thinking" delay (under a second) instead of the full
human timeout, and use a simple priority heuristic: capture an opponent if
possible, else finish a token if possible, else leave the yard on a 6, else
push the furthest-along token forward.

## Auto-play for forced single moves

If a roll leaves only one legal token to move, the server plays it
automatically after a short beat (500ms) — no tap needed. This only
applies to humans; if you'd rather always choose manually, remove the
`movable.length === 1 && !cp.isBot` branch in `performRoll` inside
`server.js`.

## Pause / resume

Any player can pause mid-game with the ⏸ button next to the dice (or the
Resume button on the paused overlay). Pausing freezes the turn timer at
its exact remaining time — it doesn't reset — and blocks rolls, moves, and
bot turns until someone resumes.

## Reconnecting after a drop

If a player's connection drops (phone locks, wifi blips, tab closes), their
seat is held for **2 minutes**. The browser remembers a small session token
in `localStorage`; reopening the page within that window shows a "Rejoin
your game?" prompt in the lobby that puts them straight back in their same
seat and color. After 2 minutes the seat stays empty (their turns are
skipped) but isn't reassigned. Change `RECONNECT_WINDOW_MS` in `server.js`
to adjust the window.

## Customizing tokens

In the waiting room, each player can pick an icon (🐯🦁🐸…) from the picker
under the player list — it renders inside that player's tokens on the
board for the rest of the game. Purely cosmetic, no gameplay effect.

## Top-3 podium

The game doesn't end the instant someone finishes all 4 tokens — play
continues until the top 3 places are decided (the last remaining player is
awarded whatever place is left, since there's nothing left to contest).
Each podium finish triggers a toast notification and a fireworks burst for
everyone in the room; the final results screen lists the full 🥇🥈🥉
ranking. With only 2 players, the game still ends as soon as the first
finishes, since "2nd place" isn't in question at that point.

## Turn timer

Every turn is timed, enforced by the server (not the browser) so it can't be
skipped by editing the page:

- **15 seconds** to roll the dice — if time runs out, the server rolls for
  the player automatically.
- **10 seconds** to pick which token to move, once there's a valid move —
  if time runs out, the server moves a random eligible token.

The countdown bar and "Xs left" label under the turn banner reflect the
server's actual deadline, with an urgency beep in the last 3 seconds. To
change the durations, edit `ROLL_TIMEOUT_MS` and `MOVE_TIMEOUT_MS` near the
top of `server.js`.

## How it works

- `server.js` keeps one game-state object per room (4-letter code), validates
  every roll and move server-side, and broadcasts the new state to everyone
  in the room over WebSockets — that's what makes it "online multiplayer"
  rather than just a local game.
- `public/index.html` renders the board with CSS Grid (a 15×15 grid matching
  a real Ludo board's cross layout) and talks to the server purely through
  Socket.IO events (`create_room`, `join_room`, `start_game`, `roll_dice`,
  `move_token`).

## Extending it

- **AI bots**: add a "fill empty seats with bots" option in `start_game` and
  have the server auto-roll/auto-move for bot seats.
- **Reconnection**: currently a disconnected player is skipped in turn order;
  you could store a reconnect token in `localStorage` to let them rejoin the
  same seat.
- **Persistence**: rooms live in memory and vanish on server restart — add
  Redis if you want games to survive a redeploy.
