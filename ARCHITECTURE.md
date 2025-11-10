# UAV Control System - Project Structure

```
SF_Hackathon/
├── docker-compose.yml          # Docker orchestration configuration
├── README.md                   # Project documentation
├── start.sh                    # Quick start script
├── stop.sh                     # Quick stop script
├── .gitignore                  # Git ignore rules
│
├── backend/                    # Node.js Backend Server
│   ├── server.js              # Express + WebSocket server
│   ├── package.json           # Node.js dependencies
│   ├── Dockerfile             # Backend container configuration
│   └── .dockerignore          # Docker ignore rules
│
├── frontend/                   # React Frontend Application
│   ├── public/
│   │   └── index.html         # HTML template
│   ├── src/
│   │   ├── index.js           # React entry point
│   │   ├── index.css          # Global styles
│   │   ├── App.js             # Main React component
│   │   └── App.css            # App styles
│   ├── package.json           # React dependencies
│   ├── Dockerfile             # Frontend container configuration
│   ├── nginx.conf             # Nginx configuration
│   └── .dockerignore          # Docker ignore rules
│
└── simulator/                  # Python UAV Simulator
    ├── simulator.py           # Physics simulation engine
    ├── requirements.txt       # Python dependencies
    ├── Dockerfile             # Simulator container configuration
    └── .dockerignore          # Docker ignore rules
```

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Network                         │
│                       (uav-network)                         │
│                                                             │
│  ┌───────────────┐           ┌──────────────┐               │
│  │   Frontend    │           │   Backend    │               │
│  │   (React)     │ ◄───────► │   (Node.js)  │               │
│  │   Port: 80    │ WebSocket │   Port: 3001 │               │
│  └───────────────┘           └──────────────┘               │
│         │                          ▲                        │
│         │                          │                        │
│         │                          │ WebSocket              │
│         │                          │                        │
│         │                     ┌──────────────┐              │
│         │                     │  Simulator   │              │
│         │                     │   (Python)   │              │
│         │                     │              │              │
│         │                     └──────────────┘              │
│         │                                                   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
   User's Browser
   http://localhost
```

## Communication Protocol

### Frontend ↔ Backend
- Protocol: WebSocket
- Endpoint: `ws://localhost:3001/ws/client`
- Purpose: Control commands and telemetry display

### Simulator ↔ Backend
- Protocol: WebSocket
- Endpoint: `ws://backend:3001/ws/simulator`
- Purpose: Command execution and state updates

## Message Types

### Command (Frontend → Backend → Simulator)
```json
{
  "type": "command",
  "command": "takeoff",
  "params": { "altitude": 10 },
  "timestamp": 1234567890
}
```

### State Update (Simulator → Backend → Frontend)
```json
{
  "type": "state_update",
  "data": {
    "position": { "x": 0, "y": 0, "z": 10 },
    "velocity": { "x": 0, "y": 0, "z": 0 },
    "orientation": { "pitch": 0, "roll": 0, "yaw": 0 },
    "battery": 95.5,
    "status": "flying",
    "armed": true
  },
  "timestamp": "2025-11-10T12:00:00.000Z"
}
```

### Command Response (Simulator → Backend → Frontend)
```json
{
  "type": "command_response",
  "command": "takeoff",
  "success": true,
  "message": "Taking off to 10m"
}
```
