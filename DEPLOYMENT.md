# Deploy Ludo Online (Play with Friends Anywhere)

## Free Deployment Options

### Option 1: Render.com (Easiest - No Credit Card)

**Step 1: Push to GitHub**
```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - Ludo game"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/ludoadda.git
git branch -M main
git push -u origin main
```

**Step 2: Deploy on Render**
1. Go to https://render.com and sign up (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account
4. Select your `ludoadda` repository
5. Configure:
   - **Name:** ludoadda (or any name)
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
6. Click **"Create Web Service"**

**Step 3: Wait for deployment** (~2 minutes)

**Step 4: Get your URL**
- Render gives you: `https://ludoadda-xyz123.onrender.com`
- Share this URL with friends - they can play from anywhere!

**Note:** Free tier "sleeps" after 15 minutes of inactivity. First visitor waits ~30s for wake-up.

---

### Option 2: Railway.app

1. Go to https://railway.app
2. Sign up with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your ludoadda repo
5. Railway auto-detects Node.js and deploys
6. Get your public URL from the deployment

---

### Option 3: Fly.io

```bash
# Install flyctl
# Windows (PowerShell):
iwr https://fly.io/install.ps1 -useb | iex

# Deploy
flyctl auth signup
flyctl launch
# Follow prompts, choose a name and region
flyctl deploy
```

Your game will be at: `https://your-app-name.fly.dev`

---

### Option 4: Glitch.com (No GitHub needed)

1. Go to https://glitch.com
2. Click **"New Project"** → **"Import from GitHub"**
3. Paste your GitHub repo URL OR click **"glitch-hello-node"** and paste the code manually
4. Glitch auto-deploys!
5. Your URL: `https://your-project-name.glitch.me`

---

## Custom Domain (Optional)

Once deployed, you can add a custom domain:

**Render.com:**
1. Dashboard → Your service → Settings
2. Add custom domain: `ludo.yourdomain.com`
3. Update DNS records as shown

**Railway.app / Fly.io:**
- Similar settings in their dashboards

---

## Environment Variables (Production)

Set these in your deployment platform:

```
NODE_ENV=production
ALLOWED_ORIGIN=https://your-deployed-url.com
```

**How to set on Render:**
1. Dashboard → Your service → Environment
2. Add Key-Value pairs
3. Click "Save Changes"

---

## Monitoring Your Game

### Check if it's running:
```
https://your-app-url.com/health
```

Should return:
```json
{
  "status": "ok",
  "uptime": 12345,
  "rooms": 3,
  "timestamp": 1234567890
}
```

*(Note: Add the health endpoint from SECURITY_FIXES.md first)*

---

## Updating Your Deployed Game

```bash
# Make changes to code
git add .
git commit -m "Update game"
git push

# Render/Railway/Fly auto-deploy on push
```

---

## Cost Estimate

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| Render | ✅ Always free | $7/mo (always on) | Easy setup |
| Railway | 500 hrs/mo free | $5/mo | GitHub integration |
| Fly.io | 3 shared VMs free | $1.94/mo | Advanced users |
| Glitch | ✅ Always free | $8/mo | Quick prototypes |

**Recommendation:** Start with Render.com free tier!

---

## Scaling (If You Get Popular)

**For 100+ concurrent players:**
1. Upgrade to paid tier (removes sleep)
2. Add Redis for session storage (see SECURITY_FIXES.md)
3. Enable horizontal scaling with sticky sessions

**For 1000+ concurrent players:**
- Use Kubernetes or dedicated game server
- Add database for persistence
- Implement proper load balancing

---

## Security Before Going Live

Apply fixes from **SECURITY_FIXES.md**:
- [x] XSS sanitization for player names
- [x] Rate limiting on socket events
- [x] CORS configuration
- [x] Health check endpoint
- [x] Input validation

---

**Ready to deploy? Follow Option 1 (Render.com) above! 🚀**
