const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

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

// HORNET states organized by SWARM
const uavStates = {
  'HORNET-1': {
    id: 'HORNET-1',
    swarm: 'SWARM-1',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    battery: 100,
    status: 'idle',
    armed: false,
    color: '#00bfff'
  },
  'HORNET-2': {
    id: 'HORNET-2',
    swarm: 'SWARM-1',
    position: { x: 50, y: 50, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    battery: 100,
    status: 'idle',
    armed: false,
    color: '#00ff00'
  },
  'HORNET-3': {
    id: 'HORNET-3',
    swarm: 'SWARM-2',
    position: { x: -50, y: 50, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    battery: 100,
    status: 'idle',
    armed: false,
    color: '#ff00ff'
  },
  'HORNET-4': {
    id: 'HORNET-4',
    swarm: 'SWARM-2',
    position: { x: 50, y: -50, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    battery: 100,
    status: 'idle',
    armed: false,
    color: '#ffff00'
  },
  'HORNET-5': {
    id: 'HORNET-5',
    swarm: 'SWARM-2',
    position: { x: -50, y: -50, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    battery: 100,
    status: 'idle',
    armed: false,
    color: '#ff6600'
  }
};

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

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket endpoints:`);
  console.log(`  - Client: ws://localhost:${PORT}/ws/client`);
  console.log(`  - Simulator: ws://localhost:${PORT}/ws/simulator`);
});
