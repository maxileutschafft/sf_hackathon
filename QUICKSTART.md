# UAV Control System - Quick Reference

## 🚀 Quick Start Commands

### Start the System
```bash
./start.sh
# Or manually:
docker-compose up --build -d
```

### Stop the System
```bash
./stop.sh
# Or manually:
docker-compose down
```

### Check Status
```bash
./status.sh
```

### View Logs
```bash
./logs.sh              # All services
./logs.sh backend      # Backend only
./logs.sh frontend     # Frontend only
./logs.sh simulator    # Simulator only
```

### Restart Services
```bash
docker-compose restart           # All services
docker-compose restart backend   # Backend only
```

### Rebuild After Changes
```bash
docker-compose up --build
```

## 🌐 Access Points

- **Frontend UI**: http://localhost
- **Backend API**: http://localhost:3001/api/status
- **Health Check**: http://localhost:3001/api/health

## 🎮 UAV Control Flow

1. **ARM** the UAV (status: idle → armed)
2. **TAKEOFF** to desired altitude (status: armed → flying)
3. **MOVE** using directional controls
4. **ROTATE** to change heading
5. **LAND** when done (status: flying → landing → armed)
6. **DISARM** to complete (status: armed → idle)

## ⚠️ Important Rules

- ✅ Can only ARM when on ground (z < 0.1m)
- ✅ Can only TAKEOFF when armed and on ground
- ✅ Can only MOVE/ROTATE when flying
- ✅ Can only LAND when flying
- ✅ Can only DISARM when on ground
- ⚠️ Auto-landing triggers at battery < 10%

## 📊 Telemetry Values

| Parameter | Description | Unit |
|-----------|-------------|------|
| Position X | Forward/Backward position | meters |
| Position Y | Left/Right position | meters |
| Altitude (Z) | Height above ground | meters |
| Velocity | Combined speed | m/s |
| Yaw | Heading angle | degrees |
| Battery | Remaining power | % |
| Status | Current state | text |
| Armed | Ready for flight | boolean |

## 🐛 Troubleshooting

### Services won't start
```bash
# Check Docker status
docker info

# Check for port conflicts
lsof -i :80
lsof -i :3001

# Remove old containers and rebuild
docker-compose down -v
./start.sh
```

### Frontend shows "Disconnected"
```bash
# Check backend is running
curl http://localhost:3001/api/health

# View backend logs
./logs.sh backend
```

### Simulator not responding
```bash
# View simulator logs
./logs.sh simulator

# Restart simulator
docker-compose restart simulator
```

### Reset everything
```bash
docker-compose down -v
docker system prune -f
./start.sh
```

## 🔧 Development Mode

### Backend (Port 3001)
```bash
cd backend
npm install
npm start
```

### Frontend (Port 3000)
```bash
cd frontend
npm install
npm start
```

### Simulator
```bash
cd simulator
pip install -r requirements.txt
python simulator.py
```

Note: In dev mode, update WebSocket URLs manually:
- Frontend: Edit `src/App.js` - change `REACT_APP_WS_URL`
- Simulator: Edit `simulator.py` - change `backend_url`

## 📝 Common Docker Commands

```bash
# View running containers
docker ps

# Stop all containers
docker-compose stop

# Remove all containers
docker-compose rm -f

# View container logs
docker logs uav-backend
docker logs uav-frontend
docker logs uav-simulator

# Access container shell
docker exec -it uav-backend sh
docker exec -it uav-simulator sh

# Check resource usage
docker stats
```

## 🔑 Environment Variables

### Backend
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode

### Frontend
- `REACT_APP_WS_URL`: Backend WebSocket URL

### Simulator
- `BACKEND_URL`: Backend WebSocket URL

## 📦 Project Structure

```
SF_Hackathon/
├── backend/          Node.js server
├── frontend/         React application
├── simulator/        Python UAV simulator
├── docker-compose.yml
└── *.sh             Utility scripts
```

## 🤝 Support

For issues:
1. Check `./status.sh`
2. View logs with `./logs.sh`
3. Restart services
4. Check README.md and ARCHITECTURE.md

## ⚡ Performance Tips

- Backend updates state at 20 Hz (every 50ms)
- Frontend reconnects automatically if disconnected
- Simulator includes physics: gravity, drag, battery drain
- Docker network provides low-latency communication

---

**Happy Flying! 🚁✈️**
