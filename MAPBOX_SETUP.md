# Mapbox 3D Terrain Setup Guide

## Getting Your Free Mapbox API Key

1. **Sign up for Mapbox** (completely free):
   - Go to: https://account.mapbox.com/auth/signup/
   - Create a free account (no credit card required)

2. **Get your access token**:
   - After signing up, you'll be redirected to your account page
   - Copy your "Default public token" from the dashboard
   - Or go to: https://account.mapbox.com/access-tokens/

3. **Add the token to your .env file**:
   - Open: `frontend/.env`
   - Find the line: `REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here`
   - Replace `your_mapbox_token_here` with your actual token
   - Save the file

   **Note:** The `.env` file is already in `.gitignore` so your token won't be committed to git.

## Free Tier Limits

Mapbox free tier includes:
- **50,000 free map loads per month**
- No credit card required
- Perfect for development and demos

## Running the Application

### Option 1: Docker (Recommended)

```bash
# Build and start all services
docker compose up --build

# Access the app
# Open browser: http://localhost
```

### Option 2: Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm install
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm start
```

**Terminal 3 - Simulator:**
```bash
cd simulator
pip install -r requirements.txt
python simulator.py
```

Then open: http://localhost:3000

## Features

### 3D Terrain View
- **Real elevation data** from Mapbox's global DEM
- **Satellite imagery** overlay
- **3D buildings** in urban areas
- **60° pitch angle** for dramatic perspective
- **Realistic sky** with atmospheric effects

### UAV Visualization
- **Live UAV marker** (🚁) that tracks your drone position
- **Pulsing animation** for visibility
- **Auto-follow camera** when flying
- **Real-time position updates** (20Hz)

### Controls
- **Zoom/Pan/Rotate** with mouse or navigation controls
- **Camera follows UAV** automatically during flight
- **Terrain exaggeration** (1.5x) for better visibility

## Customization Options

### Change Starting Location
Edit `frontend/src/TerrainMap.js`:
```javascript
const [lng] = useState(-122.4);  // San Francisco
const [lat] = useState(37.8);
```

Popular coordinates:
- San Francisco: `-122.4, 37.8`
- New York: `-74.0, 40.7`
- Grand Canyon: `-112.1, 36.1`
- Mount Everest: `86.9, 27.9`

### Adjust Terrain Exaggeration
```javascript
map.current.setTerrain({
  source: 'mapbox-dem',
  exaggeration: 2.0  // Higher = more dramatic terrain
});
```

### Change Map Style
```javascript
style: 'mapbox://styles/mapbox/satellite-streets-v12',
// Other options:
// 'mapbox://styles/mapbox/outdoors-v12'
// 'mapbox://styles/mapbox/dark-v11'
// 'mapbox://styles/mapbox/light-v11'
```

## Coordinate System Notes

The UAV simulator uses a simple **Cartesian coordinate system** (meters):
- X: Forward/Backward
- Y: Left/Right
- Z: Altitude

The map converts these to **geographic coordinates** (lng/lat) using a simple approximation. For production use, you'd want to:
1. Use real GPS coordinates from your UAV
2. Or implement a proper local coordinate system transformation

## Troubleshooting

### Map not loading
- Check browser console for errors
- Verify your Mapbox token is valid
- Check if you've exceeded free tier limits (unlikely)

### UAV marker not visible
- Make sure backend and simulator are running
- Check WebSocket connection in console
- Verify UAV status is not "idle"

### Performance issues
- Reduce terrain exaggeration
- Lower map quality: `map.current.setMaxPitch(45)`
- Disable 3D buildings for better performance

## Docker Note

When running in Docker, the frontend rebuild happens inside the container. If you change the Mapbox token:

```bash
# Stop containers
docker compose down

# Rebuild with new token
docker compose up --build
```

## Support

For Mapbox issues: https://docs.mapbox.com/help/
For project issues: Check README.md and ARCHITECTURE.md
