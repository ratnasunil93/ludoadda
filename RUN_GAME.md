# How to Run the Ludo Game

## Quick Start (Windows)

### Step 1: Install Node.js (if not already installed)
1. Download from: https://nodejs.org/
2. Install the LTS version (v20 or later)
3. Verify installation:
   ```cmd
   node --version
   npm --version
   ```

### Step 2: Install Dependencies
Open Command Prompt or PowerShell in the project folder:
```cmd
cd "D:\Games\Git pro ludo\ludoadda"
npm install
```

### Step 3: Start the Server
```cmd
npm start
```

You should see:
```
Ludo server running on port 3000
```

### Step 4: Play the Game
1. Open your browser and go to: **http://localhost:3000**
2. Enter your name and click **"Create a room"**
3. Share the 4-letter room code with friends OR click **"🤖 Play vs AI (solo)"** for instant solo play

### Playing with Friends

**On the same computer (testing):**
1. Open Tab 1: http://localhost:3000 → Create room
2. Open Tab 2: http://localhost:3000 → Join with the code

**On different devices (same network):**
1. Find your computer's IP address:
   ```cmd
   ipconfig
   ```
   Look for "IPv4 Address" (e.g., 192.168.1.100)

2. Share this URL with friends on the same WiFi:
   ```
   http://192.168.1.100:3000
   ```

### Playing Online (with friends anywhere)

The game needs to be deployed to play across the internet. See DEPLOYMENT.md

## Troubleshooting

**Port already in use:**
```cmd
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Dependencies not installing:**
```cmd
npm cache clean --force
npm install
```

**Game not loading:**
- Check console for errors (F12 in browser)
- Make sure server is running
- Try http://127.0.0.1:3000 instead

## Game Controls

- **Create Room** - Start a new game lobby
- **Join Room** - Enter a 4-letter code to join
- **Play vs AI** - Instant solo game with 3 bots
- **Add AI Player** - Add bots to your room (host only)
- **Start Game** - Begin playing (host only, needs 2+ players)
- **Roll Dice** - Click the dice when it's your turn
- **Move Token** - Click a highlighted token to move it
- **Pause** - ⏸ button pauses the game (any player)
- **Mute** - 🔊 button toggles sound effects

## Tips

- You need a **6** to get tokens out of the yard
- Three **6's** in a row forfeits your turn
- Land on opponents to send them home (except safe cells ⭐)
- Capturing or rolling 6 gives you an extra turn
- First to get all 4 tokens home wins!

---

**Enjoy the game! 🎲**
