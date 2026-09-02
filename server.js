// Ludo Online — server.js
// Authoritative game server: rooms, turns, dice rolls, moves, captures, win detection,
// per-turn timers (auto-play on timeout), AI bot players, pause/resume, and a timed
// reconnection window for players who drop mid-game.

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const COLORS = ['red', 'green', 'yellow', 'blue'];
const START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // start cells + star cells
const HOME_ENTRY = 51; // relative pos where a token leaves the shared 52-ring
const FINISH = 56; // relative pos when a token reaches home

const ROLL_TIMEOUT_MS = 15000; // time a human has to roll the dice
const MOVE_TIMEOUT_MS = 10000; // time a human has to pick which token to move
const BOT_ROLL_MS = 700; // "thinking" delay before a bot rolls
const BOT_MOVE_MS = 800; // "thinking" delay before a bot picks a token
const AUTO_MOVE_MS = 500; // delay before playing a forced move (only one legal token)
const RECONNECT_WINDOW_MS = 120000; // how long a dropped player's seat is held open

const TOKEN_ICONS = ['🐯', '🦁', '🐸', '🐵', '🐱', '🐶', '🦊', '🐼', '⭐', '💎', '🚀', '⚡'];

/** rooms keyed by 4-char code */
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function genToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function newRoom(code) {
  return {
    code,
    players: [], // { id, name, color, connected, token, isBot, icon, disconnectedAt }
    status: 'waiting', // waiting | playing | finished
    paused: false,
    turnIndex: 0,
    tokens: {
      red: [-1, -1, -1, -1],
      green: [-1, -1, -1, -1],
      yellow: [-1, -1, -1, -1],
      blue: [-1, -1, -1, -1],
    },
    diceValue: null,
    consecutiveSixes: 0,
    movable: [],
    winner: null,
    finishOrder: [], // colors in the order they completed all 4 tokens
    log: [],
    timerHandle: null,
    timerType: null, // 'roll' | 'move' | null
    deadline: null,
    timerDuration: null,
    pausedRemainingMs: null,
    pausedTimerType: null,
    cleanupHandle: null,
    autoSingle: false, // true when the pending 'move' timer is a forced single-legal-move, not a real timeout
  };
}

function publicState(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({
      name: p.name,
      color: p.color,
      connected: p.connected,
      isBot: !!p.isBot,
      icon: p.icon || null,
    })),
    status: room.status,
    paused: room.paused,
    turnIndex: room.turnIndex,
    tokens: room.tokens,
    diceValue: room.diceValue,
    movable: room.movable,
    winner: room.winner,
    finishOrder: room.finishOrder,
    log: room.log.slice(-8),
    deadline: room.deadline,
    timerDuration: room.timerDuration,
  };
}

function currentPlayer(room) {
  return room.players[room.turnIndex];
}
function isBotTurn(room) {
  const cp = currentPlayer(room);
  return !!(cp && cp.isBot);
}
function globalCell(color, rel) {
  return (START_OFFSET[color] + rel) % 52;
}

function clearTimer(room) {
  if (room.timerHandle) clearTimeout(room.timerHandle);
  room.timerHandle = null;
  room.timerType = null;
  room.deadline = null;
  room.timerDuration = null;
}

function scheduleTimer(room, type, ms) {
  clearTimer(room);
  room.timerType = type;
  room.timerDuration = ms;
  room.deadline = Date.now() + ms;
  room.timerHandle = setTimeout(() => {
    room.timerHandle = null;
    if (room.paused) return;
    const cp = currentPlayer(room);
    if (type === 'roll') {
      performRoll(room, cp && cp.isBot ? 'bot' : 'timeout');
    } else if (type === 'move') {
      const pool = room.movable;
      if (pool && pool.length) {
        const forcedSingle = room.autoSingle;
        room.autoSingle = false;
        const tokenIdx = cp && cp.isBot
          ? chooseBotMove(room, cp.color, pool)
          : (forcedSingle ? pool[0] : pool[Math.floor(Math.random() * pool.length)]);
        const reason = cp && cp.isBot ? 'bot' : (forcedSingle ? 'single' : 'timeout');
        performMove(room, tokenIdx, reason);
      }
    }
  }, ms);
}
function scheduleRollTimer(room) {
  scheduleTimer(room, 'roll', isBotTurn(room) ? BOT_ROLL_MS : ROLL_TIMEOUT_MS);
}
function scheduleMoveTimer(room) {
  scheduleTimer(room, 'move', isBotTurn(room) ? BOT_MOVE_MS : MOVE_TIMEOUT_MS);
}

function computeMovable(room, color, dice) {
  const movable = [];
  const tokens = room.tokens[color];
  tokens.forEach((pos, idx) => {
    if (pos === -1) {
      if (dice === 6) movable.push(idx); // can leave yard only on a 6
    } else if (pos === FINISH) {
      // already home, can't move
    } else {
      const next = pos + dice;
      if (next <= FINISH) movable.push(idx); // must not overshoot
    }
  });
  return movable;
}

/** Would moving this token capture an opponent? Used by the bot heuristic. */
function wouldCapture(room, color, tokenIdx, dice) {
  const pos = room.tokens[color][tokenIdx];
  const newPos = pos === -1 ? 0 : pos + dice;
  if (newPos >= HOME_ENTRY) return false;
  const gcell = globalCell(color, newPos);
  if (SAFE_CELLS.has(gcell)) return false;
  return COLORS.some((oc) => oc !== color && room.tokens[oc].some((opos) =>
    opos !== -1 && opos < HOME_ENTRY && globalCell(oc, opos) === gcell));
}

/** Simple priority heuristic: capture > finish a token > leave the yard > push the furthest token. */
function chooseBotMove(room, color, movable) {
  const dice = room.diceValue;
  const captureMoves = movable.filter((idx) => wouldCapture(room, color, idx, dice));
  if (captureMoves.length) return captureMoves[Math.floor(Math.random() * captureMoves.length)];

  const finishMoves = movable.filter((idx) => {
    const pos = room.tokens[color][idx];
    return (pos === -1 ? 0 : pos + dice) === FINISH;
  });
  if (finishMoves.length) return finishMoves[0];

  const exitMoves = movable.filter((idx) => room.tokens[color][idx] === -1);
  if (exitMoves.length) return exitMoves[0];

  let best = movable[0], bestPos = room.tokens[color][best];
  movable.forEach((idx) => {
    const p = room.tokens[color][idx];
    if (p > bestPos) { best = idx; bestPos = p; }
  });
  return best;
}

function applyMove(room, color, tokenIdx, dice) {
  const tokens = room.tokens[color];
  let pos = tokens[tokenIdx];
  let captured = false;

  if (pos === -1) pos = 0;
  else pos = pos + dice;
  tokens[tokenIdx] = pos;

  if (pos < HOME_ENTRY) {
    const gcell = globalCell(color, pos);
    if (!SAFE_CELLS.has(gcell)) {
      for (const otherColor of COLORS) {
        if (otherColor === color) continue;
        const otherTokens = room.tokens[otherColor];
        otherTokens.forEach((opos, oi) => {
          if (opos !== -1 && opos < HOME_ENTRY && globalCell(otherColor, opos) === gcell) {
            otherTokens[oi] = -1;
            captured = true;
            room.log.push(`${otherColor} token sent home by ${color}!`);
          }
        });
      }
    }
  }

  if (pos === FINISH) room.log.push(`${color} token reached home!`);
  return { captured };
}

function hasWon(room, color) {
  return room.tokens[color].every((p) => p === FINISH);
}

function advanceTurn(room, extraTurn) {
  room.diceValue = null;
  room.movable = [];
  if (!extraTurn) {
    let next = room.turnIndex;
    for (let i = 0; i < room.players.length; i++) {
      next = (next + 1) % room.players.length;
      const p = room.players[next];
      if (p.connected && !room.finishOrder.includes(p.color)) break;
    }
    room.turnIndex = next;
  }
  room.consecutiveSixes = extraTurn ? room.consecutiveSixes : 0;
}

/** reason: null (manual) | 'timeout' (human ran out of time) | 'bot' (AI turn) */
function performRoll(room, reason) {
  const cp = currentPlayer(room);
  if (!cp) return;

  const dice = 1 + Math.floor(Math.random() * 6);
  room.diceValue = dice;
  const suffix = reason === 'timeout' ? ' (time ran out — auto-rolled)' : reason === 'bot' ? ' (AI)' : '';
  room.log.push(`${cp.color} rolled a ${dice}${suffix}`);
  io.to(room.code).emit('dice_rolled', { color: cp.color, value: dice, auto: reason === 'timeout' });

  if (dice === 6) room.consecutiveSixes += 1;
  else room.consecutiveSixes = 0;

  if (room.consecutiveSixes === 3) {
    room.log.push(`${cp.color} rolled three 6s in a row — turn forfeited`);
    advanceTurn(room, false);
    scheduleRollTimer(room);
    io.to(room.code).emit('room_update', publicState(room));
    return;
  }

  const movable = computeMovable(room, cp.color, dice);
  room.movable = movable;

  if (movable.length === 0) {
    room.log.push(`${cp.color} has no valid moves`);
    advanceTurn(room, dice === 6);
    scheduleRollTimer(room);
  } else if (movable.length === 1 && !cp.isBot) {
    // Only one legal token can move — play it automatically, no tap needed.
    room.autoSingle = true;
    scheduleTimer(room, 'move', AUTO_MOVE_MS);
  } else {
    room.autoSingle = false;
    scheduleMoveTimer(room);
  }
  io.to(room.code).emit('room_update', publicState(room));
}

/** reason: null (manual) | 'timeout' | 'bot' */
function performMove(room, tokenIdx, reason) {
  const cp = currentPlayer(room);
  if (!cp) return;
  const dice = room.diceValue;
  if (dice === null || !room.movable.includes(tokenIdx)) return;

  const { captured } = applyMove(room, cp.color, tokenIdx, dice);
  if (reason === 'timeout') room.log.push(`${cp.color} ran out of time — moved a token automatically`);
  else if (reason === 'bot') room.log.push(`${cp.color} (AI) moved a token`);
  else if (reason === 'single') room.log.push(`${cp.color} only had one legal move — played automatically`);

  if (hasWon(room, cp.color) && !room.finishOrder.includes(cp.color)) {
    room.finishOrder.push(cp.color);
    const place = room.finishOrder.length;
    const placeLabel = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
    room.log.push(`${cp.color} finished in ${placeLabel} place! 🎉`);
    io.to(room.code).emit('player_finished', { color: cp.color, place });

    // Play continues until the top 3 places are decided (or, with fewer than
    // 4 players, until only one contender is left — their place is trivial).
    if (room.finishOrder.length >= room.players.length - 1) {
      room.players.forEach((p) => {
        if (!room.finishOrder.includes(p.color)) room.finishOrder.push(p.color);
      });
      room.status = 'finished';
      room.winner = room.finishOrder[0];
      room.diceValue = null;
      room.movable = [];
      clearTimer(room);
      io.to(room.code).emit('room_update', publicState(room));
      return;
    }
  }

  const extraTurn = dice === 6 || captured;
  advanceTurn(room, extraTurn);
  scheduleRollTimer(room);
  io.to(room.code).emit('room_update', publicState(room));
}

function scheduleRoomCleanupCheck(room) {
  if (room.cleanupHandle) clearTimeout(room.cleanupHandle);
  room.cleanupHandle = setTimeout(() => {
    const anyHumanConnected = room.players.some((p) => !p.isBot && p.connected);
    if (!anyHumanConnected) {
      clearTimer(room);
      rooms.delete(room.code);
    }
  }, RECONNECT_WINDOW_MS + 5000);
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.color = null;

  socket.on('create_room', ({ name }, cb) => {
    const code = genCode();
    const room = newRoom(code);
    const color = COLORS[0];
    const token = genToken();
    room.players.push({ id: socket.id, name: name?.slice(0, 16) || 'Player', color, connected: true, token });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.color = color;
    cb({ ok: true, code, color, token, isHost: true });
    io.to(code).emit('room_update', publicState(room));
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.status !== 'waiting') return cb({ ok: false, error: 'Game already started' });
    if (room.players.length >= 4) return cb({ ok: false, error: 'Room is full' });
    const usedColors = new Set(room.players.map((p) => p.color));
    const color = COLORS.find((c) => !usedColors.has(c));
    const token = genToken();
    room.players.push({ id: socket.id, name: name?.slice(0, 16) || 'Player', color, connected: true, token });
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.color = color;
    cb({ ok: true, code: room.code, color, token, isHost: false });
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('reconnect_room', ({ code, color, token }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    const player = room.players.find((p) => p.color === color && p.token === token);
    if (!player) return cb({ ok: false, error: 'No matching seat found' });
    if (player.connected) return cb({ ok: false, error: 'Already connected' });
    if (player.disconnectedAt && Date.now() - player.disconnectedAt > RECONNECT_WINDOW_MS) {
      return cb({ ok: false, error: 'Reconnect window expired' });
    }
    player.connected = true;
    player.id = socket.id;
    delete player.disconnectedAt;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.color = color;
    room.log.push(`${color} reconnected`);
    cb({ ok: true, code: room.code, color, token: player.token, isHost: room.players[0].color === color, state: publicState(room) });
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('add_bot', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'waiting') return;
    if (!room.players.length || room.players[0].id !== socket.id) return; // host only
    if (room.players.length >= 4) return;
    const usedColors = new Set(room.players.map((p) => p.color));
    const color = COLORS.find((c) => !usedColors.has(c));
    if (!color) return;
    room.players.push({
      id: `bot-${color}-${Date.now()}`,
      name: `AI (${color[0].toUpperCase()}${color.slice(1)})`,
      color, connected: true, isBot: true, token: null,
    });
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('remove_bot', ({ color }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'waiting') return;
    if (!room.players.length || room.players[0].id !== socket.id) return; // host only
    const idx = room.players.findIndex((p) => p.isBot && p.color === color);
    if (idx === -1) return;
    room.players.splice(idx, 1);
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('set_token_icon', ({ icon }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    player.icon = TOKEN_ICONS.includes(icon) ? icon : null;
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('start_game', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (room.players.length < 2) return;
    if (room.players[0].id !== socket.id) return; // only host starts
    room.status = 'playing';
    room.turnIndex = 0;
    room.log.push('Game started!');
    scheduleRollTimer(room);
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('pause_game', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.paused) return;
    if (!room.players.some((p) => p.id === socket.id)) return;
    const player = room.players.find((p) => p.id === socket.id);
    room.paused = true;
    room.pausedRemainingMs = room.deadline ? Math.max(1000, room.deadline - Date.now()) : null;
    room.pausedTimerType = room.timerType;
    clearTimer(room);
    room.log.push(`Game paused by ${player.color}`);
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('resume_game', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || !room.paused) return;
    if (!room.players.some((p) => p.id === socket.id)) return;
    const player = room.players.find((p) => p.id === socket.id);
    room.paused = false;
    room.log.push(`Game resumed by ${player.color}`);
    if (room.pausedTimerType && room.pausedRemainingMs != null) {
      scheduleTimer(room, room.pausedTimerType, room.pausedRemainingMs);
    } else {
      scheduleRollTimer(room);
    }
    room.pausedRemainingMs = null;
    room.pausedTimerType = null;
    io.to(room.code).emit('room_update', publicState(room));
  });

  socket.on('roll_dice', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.paused) return;
    const cp = currentPlayer(room);
    if (!cp || cp.id !== socket.id) return;
    if (room.diceValue !== null) return;
    performRoll(room, null);
  });

  socket.on('move_token', ({ tokenIdx }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.paused) return;
    const cp = currentPlayer(room);
    if (!cp || cp.id !== socket.id) return;
    if (room.diceValue === null) return;
    if (!room.movable.includes(tokenIdx)) return;
    performMove(room, tokenIdx, null);
  });

  socket.on('leave_room', () => handleLeave(socket));
  socket.on('disconnect', () => handleLeave(socket));

  function handleLeave(sock) {
    const code = sock.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === sock.id && !p.isBot);
    if (player) {
      player.connected = false;
      player.disconnectedAt = Date.now();
      room.log.push(`${player.color} disconnected — holding their seat for a couple of minutes`);
    }
    sock.leave(code);

    const anyHumanConnected = room.players.some((p) => !p.isBot && p.connected);
    if (!anyHumanConnected) {
      scheduleRoomCleanupCheck(room);
    } else {
      if (room.status === 'playing' && !room.paused && currentPlayer(room) && !currentPlayer(room).connected) {
        advanceTurn(room, false);
        scheduleRollTimer(room);
      }
    }
    io.to(code).emit('room_update', publicState(room));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ludo server running on port ${PORT}`));
