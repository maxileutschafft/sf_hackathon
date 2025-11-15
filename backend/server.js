const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// WebSocket servers
const wssClients = new WebSocket.Server({ noServer: true });
const wssSimulator = new WebSocket.Server({ noServer: true });

// Store connected clients
const clients = new Set();
const simulatorConnections = new Map(); // Map of uavId -> websocket

// HORNET states organized by SWARM (6 per swarm)
// Base position: lat 37.5139, lng -122.4961 (converted to local XY = 0,0)
const uavStates = {
  // SWARM-1 (Cyan/Blue tones) - Positioned in hexagon formation around base
  'HORNET-1': { id: 'HORNET-1', swarm: 'SWARM-1', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#00bfff' },
  'HORNET-2': { id: 'HORNET-2', swarm: 'SWARM-1', position: { x: 10, y: 10, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#1e90ff' },
  'HORNET-3': { id: 'HORNET-3', swarm: 'SWARM-1', position: { x: 20, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#4169e1' },
  'HORNET-4': { id: 'HORNET-4', swarm: 'SWARM-1', position: { x: 10, y: -10, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#6495ed' },
  'HORNET-5': { id: 'HORNET-5', swarm: 'SWARM-1', position: { x: -10, y: -10, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#7b68ee' },
  'HORNET-6': { id: 'HORNET-6', swarm: 'SWARM-1', position: { x: -10, y: 10, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#00ced1' },

  // SWARM-2 (Red/Orange tones) - Positioned slightly offset
  'HORNET-7': { id: 'HORNET-7', swarm: 'SWARM-2', position: { x: -50, y: 50, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#ff0000' },
  'HORNET-8': { id: 'HORNET-8', swarm: 'SWARM-2', position: { x: -40, y: 60, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#ff4500' },
  'HORNET-9': { id: 'HORNET-9', swarm: 'SWARM-2', position: { x: -30, y: 50, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#ff6347' },
  'HORNET-10': { id: 'HORNET-10', swarm: 'SWARM-2', position: { x: -40, y: 40, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#ff8c00' },
  'HORNET-11': { id: 'HORNET-11', swarm: 'SWARM-2', position: { x: -60, y: 40, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#ffa500' },
  'HORNET-12': { id: 'HORNET-12', swarm: 'SWARM-2', position: { x: -60, y: 60, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#ffA07a' }
};

// Swarm targets for click-to-move
const swarmTargets = {};

// Regions of Interest (ROI)
const regionsOfInterest = {};

// Target markers
const targetMarkers = {};

// Mission planning parameters (persisted to file)
const missionParamsFile = path.join(__dirname, 'mission_params.json');
let missionParams = {
  targets: [],
  origins: []
};

// Load mission parameters from file on startup
try {
  if (fs.existsSync(missionParamsFile)) {
    const data = fs.readFileSync(missionParamsFile, 'utf8');
    missionParams = JSON.parse(data);
    console.log(`Loaded mission params: ${missionParams.targets.length} targets, ${missionParams.origins.length} origins`);
  }
} catch (error) {
  console.error('Error loading mission params:', error);
  missionParams = { targets: [], origins: [] };
}

// Function to save mission parameters to file
function saveMissionParams() {
  try {
    fs.writeFileSync(missionParamsFile, JSON.stringify(missionParams, null, 2));
    console.log(`Saved mission params: ${missionParams.targets.length} targets, ${missionParams.origins.length} origins`);
  } catch (error) {
    console.error('Error saving mission params:', error);
  }
}

// WebSocket upgrade handling
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  
  if (pathname === '/ws/client') {
    wssClients.handleUpgrade(request, socket, head, (ws) => {
      wssClients.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/simulator') {
    wssSimulator.handleUpgrade(request, socket, head, (ws) => {
      wssSimulator.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Client WebSocket connections (Frontend)
wssClients.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  // Send current state of all UAVs to new client
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: uavStates
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from client:', data);

      const uavId = data.uavId || 'UAV-1';
      const simulatorWs = simulatorConnections.get(uavId);

      // Forward command to specific UAV simulator
      if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
        simulatorWs.send(JSON.stringify(data));
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Simulator for ${uavId} not connected`
        }));
      }
    } catch (error) {
      console.error('Error parsing client message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Simulator WebSocket connections (one per UAV)
wssSimulator.on('connection', (ws, req) => {
  // Extract UAV ID from query parameter
  const url = new URL(req.url, 'http://localhost');
  const uavId = url.searchParams.get('id') || 'UAV-1';

  console.log(`Simulator connected for ${uavId}`);
  simulatorConnections.set(uavId, ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received from simulator ${uavId}:`, data.type);

      // Update specific UAV state
      if (data.type === 'state_update' && uavStates[uavId]) {
        uavStates[uavId] = { ...uavStates[uavId], ...data.data };

        // Broadcast update with UAV ID to all clients
        const updateMessage = {
          type: 'state_update',
          uavId: uavId,
          data: uavStates[uavId]
        };

        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(updateMessage));
          }
        });
      } else {
        // Forward other messages (command responses) to clients
        const message = { ...data, uavId };
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch (error) {
      console.error('Error parsing simulator message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Simulator disconnected for ${uavId}`);
    simulatorConnections.delete(uavId);
  });
});

// REST API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    uavStates,
    simulatorsConnected: Array.from(simulatorConnections.keys()),
    clientsConnected: clients.size
  });
});

app.post('/api/command', (req, res) => {
  const command = req.body;
  const uavId = command.uavId || 'UAV-1';
  const simulatorWs = simulatorConnections.get(uavId);

  if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
    simulatorWs.send(JSON.stringify(command));
    res.json({ success: true, message: `Command sent to ${uavId}` });
  } else {
    res.status(503).json({ success: false, message: `Simulator for ${uavId} not connected` });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ROI (Region of Interest) endpoints
app.get('/api/roi', (req, res) => {
  res.json({ regions: regionsOfInterest });
});

app.post('/api/roi', (req, res) => {
  const { id, x, y, radius } = req.body;
  regionsOfInterest[id] = { id, x, y, radius, timestamp: Date.now() };

  // Broadcast to all clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'roi_update',
        data: regionsOfInterest
      }));
    }
  });

  res.json({ success: true, region: regionsOfInterest[id] });
});

app.delete('/api/roi/:id', (req, res) => {
  const { id } = req.params;
  delete regionsOfInterest[id];

  // Broadcast to all clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'roi_update',
        data: regionsOfInterest
      }));
    }
  });

  res.json({ success: true });
});

// Target marker endpoints
app.get('/api/targets', (req, res) => {
  res.json({ targets: targetMarkers });
});

app.post('/api/targets', (req, res) => {
  const { id, x, y, z } = req.body;
  targetMarkers[id] = { id, x, y, z, timestamp: Date.now() };

  // Broadcast to all clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'target_update',
        data: targetMarkers
      }));
    }
  });

  res.json({ success: true, target: targetMarkers[id] });
});

app.delete('/api/targets/:id', (req, res) => {
  const { id } = req.params;
  delete targetMarkers[id];

  // Broadcast to all clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'target_update',
        data: targetMarkers
      }));
    }
  });

  res.json({ success: true });
});

// Swarm target endpoints
app.post('/api/swarm-target', (req, res) => {
  const { swarmId, x, y, z } = req.body;
  swarmTargets[swarmId] = { x, y, z, timestamp: Date.now() };

  // Send goto command to all HORNETs in the swarm
  Object.entries(uavStates).forEach(([uavId, uav]) => {
    if (uav.swarm === swarmId) {
      const simulatorWs = simulatorConnections.get(uavId);
      if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
        simulatorWs.send(JSON.stringify({
          type: 'command',
          command: 'goto',
          params: { x, y, z }
        }));
      }
    }
  });

  // Broadcast to all clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'swarm_target_update',
        swarmId,
        target: swarmTargets[swarmId]
      }));
    }
  });

  res.json({ success: true, target: swarmTargets[swarmId] });
});

// Swarm formation endpoint
app.post('/api/swarm-formation', (req, res) => {
  const { swarmId, formation, centerX, centerY } = req.body;

  // Get all HORNETs in the swarm
  const swarmHornets = Object.entries(uavStates)
    .filter(([_, uav]) => uav.swarm === swarmId)
    .map(([id, _]) => id);

  if (swarmHornets.length === 0) {
    return res.status(404).json({ success: false, message: 'Swarm not found' });
  }

  // Use provided center coordinates or calculate from current positions
  let formationCenterX, formationCenterY, targetZ;

  if (centerX !== undefined && centerY !== undefined) {
    formationCenterX = centerX;
    formationCenterY = centerY;
    targetZ = 50; // Use standard formation altitude when assembling at specific location
  } else {
    // Calculate center from current positions
    let sumX = 0, sumY = 0, sumZ = 0;
    swarmHornets.forEach(uavId => {
      const uav = uavStates[uavId];
      sumX += uav.position.x;
      sumY += uav.position.y;
      sumZ += uav.position.z;
    });
    formationCenterX = sumX / swarmHornets.length;
    formationCenterY = sumY / swarmHornets.length;
    targetZ = Math.max(sumZ / swarmHornets.length, 50);
  }

  if (formation === 'hexagon' && swarmHornets.length === 6) {
    // Hexagonal formation with 6 drones
    const radius = 30; // 30 meters from center
    const positions = [];

    // Calculate hexagon positions
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60) * (Math.PI / 180); // 60 degrees between each
      positions.push({
        x: formationCenterX + radius * Math.cos(angle),
        y: formationCenterY + radius * Math.sin(angle),
        z: targetZ
      });
    }

    // Send goto commands to each HORNET
    swarmHornets.forEach((uavId, index) => {
      const simulatorWs = simulatorConnections.get(uavId);
      if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
        simulatorWs.send(JSON.stringify({
          type: 'command',
          command: 'goto',
          params: positions[index]
        }));
      }
    });

    res.json({
      success: true,
      message: `${swarmId} forming hexagon`,
      formation: 'hexagon',
      positions
    });
  } else {
    res.status(400).json({
      success: false,
      message: `Formation '${formation}' not supported or wrong number of drones (need 6 for hexagon)`
    });
  }
});

// Mission Planning Parameters endpoints
app.get('/api/mission-params', (req, res) => {
  res.json(missionParams);
});

app.post('/api/mission-params', (req, res) => {
  const { targets, origins } = req.body;
  missionParams.targets = targets || [];
  missionParams.origins = origins || [];
  saveMissionParams();
  res.json({ success: true, ...missionParams });
});

// Legacy endpoint for backward compatibility
app.get('/api/mission-targets', (req, res) => {
  res.json({ targets: missionParams.targets });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket endpoints:`);
  console.log(`  - Client: ws://localhost:${PORT}/ws/client`);
  console.log(`  - Simulator: ws://localhost:${PORT}/ws/simulator`);
});
