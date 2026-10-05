# Security Improvements for Production

## Priority Fixes

### 1. XSS Protection - Player Names

**Issue:** Player names are inserted into DOM without sanitization.

**Fix in server.js:**
```javascript
// Add this helper function at the top
function sanitizeName(name) {
  return (name || 'Player')
    .replace(/[<>'"&]/g, (c) => ({
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
      '&': '&amp;'
    }[c]))
    .slice(0, 16);
}

// Update create_room handler (line 352):
socket.on('create_room', ({ name }, cb) => {
  const code = genCode();
  const room = newRoom(code);
  const color = COLORS[0];
  const token = genToken();
  room.players.push({ 
    id: socket.id, 
    name: sanitizeName(name),  // <-- Change here
    color, 
    connected: true, 
    token 
  });
  // ... rest of handler
});

// Update join_room handler (line 369):
socket.on('join_room', ({ code, name }, cb) => {
  // ... validation code
  room.players.push({ 
    id: socket.id, 
    name: sanitizeName(name),  // <-- Change here
    color, 
    connected: true, 
    token 
  });
  // ... rest of handler
});
```

### 2. Rate Limiting

**Install dependency:**
```bash
npm install express-rate-limit socket.io-rate-limit
```

**Add to server.js (after requires):**
```javascript
const rateLimit = require('express-rate-limit');

// HTTP rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/socket.io/', limiter);
```

### 3. CORS Configuration

**Add to server.js (after creating io):**
```javascript
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

**Set environment variable on deployment:**
```
ALLOWED_ORIGIN=https://your-app.onrender.com
```

### 4. Health Check Endpoint

**Add to server.js (before server.listen):**
```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    rooms: rooms.size,
    timestamp: Date.now()
  });
});
```

### 5. Socket Event Rate Limiting

**Add socket event throttling:**
```javascript
const socketRateLimits = new Map(); // Add at top with other Maps

function checkSocketRateLimit(socketId, event) {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const limit = socketRateLimits.get(key) || { count: 0, resetAt: now + 1000 };
  
  if (now > limit.resetAt) {
    limit.count = 1;
    limit.resetAt = now + 1000;
  } else {
    limit.count++;
  }
  
  socketRateLimits.set(key, limit);
  return limit.count <= 10; // max 10 events per second per type
}

// Use in socket handlers:
socket.on('roll_dice', () => {
  if (!checkSocketRateLimit(socket.id, 'roll_dice')) return;
  // ... rest of handler
});

socket.on('move_token', ({ tokenIdx }) => {
  if (!checkSocketRateLimit(socket.id, 'move_token')) return;
  // ... rest of handler
});
```

### 6. Input Validation for Token Index

**Add to move_token handler:**
```javascript
socket.on('move_token', ({ tokenIdx }) => {
  // Validate tokenIdx is a safe integer
  if (!Number.isInteger(tokenIdx) || tokenIdx < 0 || tokenIdx > 3) return;
  
  const room = rooms.get(socket.data.roomCode);
  // ... rest of handler
});
```

## Medium Priority

### 7. Add Helmet for Security Headers

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false // Socket.IO needs inline scripts
}));
```

### 8. Add Logging

```bash
npm install winston
```

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Use throughout code:
logger.info('Room created', { code, players: room.players.length });
logger.error('Invalid move attempt', { socketId: socket.id, tokenIdx });
```

## Deployment Checklist

- [ ] Apply XSS sanitization fix
- [ ] Add rate limiting
- [ ] Configure CORS with production domain
- [ ] Add health check endpoint
- [ ] Add socket event rate limits
- [ ] Validate all numeric inputs
- [ ] Set NODE_ENV=production
- [ ] Add Helmet security headers
- [ ] Add logging system
- [ ] Review and update package dependencies
- [ ] Set up monitoring alerts

## Environment Variables for Production

Create `.env` file (don't commit):
```
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://your-domain.com
RECONNECT_WINDOW_MS=120000
ROLL_TIMEOUT_MS=15000
MOVE_TIMEOUT_MS=10000
```

Load with:
```javascript
require('dotenv').config();
```
