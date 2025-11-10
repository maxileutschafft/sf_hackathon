# UAV Control System

A complete web-based control system for remote UAV operations with real-time telemetry and command interface.

## Architecture

The system consists of three main components:

1. **Backend (Node.js)** - WebSocket server that manages communication between frontend and simulator
2. **Frontend (React)** - Web-based control interface with real-time telemetry display
3. **Simulator (Python)** - Physics-based UAV simulation environment

## Features

- ✈️ Real-time UAV control interface
- 📊 Live telemetry data (position, velocity, battery, status)
- 🎮 Intuitive control panel (ARM, TAKEOFF, LAND, MOVE, ROTATE)
- 🔄 WebSocket-based real-time communication
- 🐳 Fully containerized with Docker
- 🔋 Battery simulation with automatic emergency landing
- 🎯 Physics-based flight simulation

## Prerequisites

- Docker
- Docker Compose

## Quick Start

### Using Docker (Recommended)

1. **Clone or navigate to the project directory:**
   ```bash
   cd .../SF_Hackathon
   ```

2. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - Frontend: http://localhost
   - Backend API: http://localhost:3001/api/status

4. **Stop all services:**
   ```bash
   docker-compose down
   ```

### Development Mode (Without Docker)

#### Backend Setup

```bash
cd backend
npm install
npm start
```

The backend server will run on http://localhost:3001

#### Frontend Setup

```bash
cd frontend
npm install
npm start
```

The frontend will run on http://localhost:3000

#### Simulator Setup

```bash
cd simulator
pip install -r requirements.txt
python simulator.py
```

## Usage Guide

### Control Interface

1. **ARM** - Prepare the UAV for flight (must be on ground)
2. **TAKEOFF** - Launch UAV to specified altitude (default 10m)
3. **Movement Controls:**
   - UP/DOWN - Adjust altitude
   - FORWARD/BACKWARD - Move along X-axis
   - LEFT/RIGHT - Move along Y-axis
4. **Rotation:**
   - CW (Clockwise) / CCW (Counter-clockwise) - Rotate UAV
5. **LAND** - Initiate landing sequence
6. **DISARM** - Disarm UAV (must be on ground)

### Telemetry Display

- **Status** - Current UAV state (idle, armed, flying, landing)
- **Armed** - Whether UAV is armed
- **Battery** - Remaining battery percentage
- **Altitude** - Current height above ground
- **Position** - X, Y coordinates
- **Velocity** - Current speed
- **Yaw** - Current heading in degrees

## System Architecture

```
┌─────────────┐      WebSocket       ┌─────────────┐
│   Frontend  │◄────────────────────►│   Backend   │
│   (React)   │  ws://localhost:3001 │  (Node.js)  │
└─────────────┘                      └─────────────┘
                                            ▲
                                            │ WebSocket
                                            │
                                      ┌─────────────┐
                                      │  Simulator  │
                                      │  (Python)   │
                                      └─────────────┘
```

## Docker Services

- **backend**: Node.js Express server with WebSocket support
- **frontend**: React application served by Nginx
- **simulator**: Python UAV physics simulator

All services communicate via a Docker bridge network named `uav-network`.

## API Endpoints

### REST API

- `GET /api/status` - Get system status and UAV state
- `POST /api/command` - Send command to UAV
- `GET /api/health` - Health check endpoint

### WebSocket Endpoints

- `ws://localhost:3001/ws/client` - Frontend connection
- `ws://localhost:3001/ws/simulator` - Simulator connection

## Commands

Commands are sent as JSON via WebSocket:

```json
{
  "type": "command",
  "command": "takeoff",
  "params": {
    "altitude": 10
  },
  "timestamp": 1234567890
}
```

Available commands:
- `arm` - Arm the UAV
- `disarm` - Disarm the UAV
- `takeoff` - Take off to specified altitude
- `land` - Land the UAV
- `move` - Move by specified deltas (dx, dy, dz)
- `rotate` - Rotate by specified angle (yaw)

## Troubleshooting

### Backend not connecting to simulator
- Check Docker network connectivity
- Verify all containers are running: `docker-compose ps`
- Check logs: `docker-compose logs simulator`

### Frontend not displaying telemetry
- Ensure backend is running and accessible
- Check browser console for WebSocket errors
- Verify WebSocket URL in browser matches backend address

### Simulator not responding to commands
- Check simulator logs: `docker-compose logs -f simulator`
- Verify WebSocket connection to backend
- Ensure UAV is in correct state for command (e.g., armed for takeoff)

## Development

### Adding New Commands

1. Add command handler in `simulator/simulator.py` in `handle_command()` method
2. Update frontend UI in `frontend/src/App.js`
3. Backend automatically forwards commands between services

### Customizing Physics

Edit simulation parameters in `simulator/simulator.py`:
- `max_velocity` - Maximum UAV speed
- `acceleration` - Rate of acceleration
- `drag_coefficient` - Air resistance
- `battery_drain_*` - Battery consumption rates


