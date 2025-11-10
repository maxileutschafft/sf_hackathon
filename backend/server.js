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
let simulatorConnection = null;

// UAV state
let uavState = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  orientation: { pitch: 0, roll: 0, yaw: 0 },
  battery: 100,
  status: 'idle',
  armed: false
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
  
  // Send current UAV state to new client
  ws.send(JSON.stringify({
    type: 'state_update',
    data: uavState
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from client:', data);
      
      // Forward command to simulator
      if (simulatorConnection && simulatorConnection.readyState === WebSocket.OPEN) {
        simulatorConnection.send(JSON.stringify(data));
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Simulator not connected'
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

// Simulator WebSocket connection
wssSimulator.on('connection', (ws) => {
  console.log('Simulator connected');
  simulatorConnection = ws;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from simulator:', data.type);
      
      // Update UAV state
      if (data.type === 'state_update') {
        uavState = { ...uavState, ...data.data };
      }
      
      // Broadcast to all clients
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('Error parsing simulator message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Simulator disconnected');
    simulatorConnection = null;
  });
});

// REST API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    uavState,
    simulatorConnected: simulatorConnection !== null,
    clientsConnected: clients.size
  });
});

app.post('/api/command', (req, res) => {
  const command = req.body;
  
  if (simulatorConnection && simulatorConnection.readyState === WebSocket.OPEN) {
    simulatorConnection.send(JSON.stringify(command));
    res.json({ success: true, message: 'Command sent to simulator' });
  } else {
    res.status(503).json({ success: false, message: 'Simulator not connected' });
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
