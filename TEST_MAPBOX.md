# Mapbox Not Loading - Debugging Steps

## Issue
The Mapbox 3D terrain view is not loading.

## Possible Causes

### 1. Docker Permission Issue (MOST LIKELY)
You're still getting Docker permission errors. Fix this first:

```bash
# Run in your terminal:
sudo usermod -aG docker $USER

# Then EITHER:
# Option A: Logout and login
# Option B: Run this:
newgrp docker

# Option C: Use sudo for now:
sudo docker compose up --build
```

### 2. Check if App is Running
```bash
# After fixing Docker permissions:
docker compose ps

# Should show 3 containers running:
# - uav-frontend (port 80)
# - uav-backend (port 3001)
# - uav-simulator
```

### 3. Browser Console Errors
Open http://localhost in browser, then press F12 and check Console tab.

**Look for:**
- "Mapbox token: Token is set" ✓
- "Initializing map at Grand Canyon" ✓
- "Map loaded successfully!" ✓
- Any RED errors ✗

### 4. Common Errors & Fixes

**401 Unauthorized Error:**
- Token is wrong or expired
- Get new token from: https://account.mapbox.com/
- Update `frontend/.env`

**mapbox-gl not found:**
- Dependencies not installed
- Run: `docker compose up --build` (forces reinstall)

**Map container has 0 height:**
- Fixed by adding inline style: `height: 500px`

**Token not loading from .env:**
- Rebuild container: `docker compose down && docker compose up --build`
- .env changes require rebuild in Docker

## Quick Fix to Test Without Docker

```bash
# In terminal 1 - Backend
cd backend
npm install
npm start

# In terminal 2 - Frontend
cd frontend
npm install
npm start

# In terminal 3 - Simulator
cd simulator
pip install -r requirements.txt
python simulator.py

# Then open: http://localhost:3000
```

## Current Token
Your token is set in `frontend/.env`:
```
REACT_APP_MAPBOX_TOKEN=pk.eyJ1IjoibGtsb3N0ZXJtYWlyIiwiYSI6ImNtaHRnb3g0aTFnbGcybHB2bmp1YXR4OXYifQ.skgkNKNpVn1QhmpJdnpQKA
```

This is a valid public token (starts with `pk.`)

## What to Check Right Now

1. **Fix Docker permissions** (most important)
2. **Rebuild containers:** `sudo docker compose up --build`
3. **Open browser:** http://localhost
4. **Check console:** F12 → Console tab
5. **Tell me what errors you see**
