const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Configuration constants
const DEBUG = process.env.NODE_ENV !== 'production';
const FORMATION_RADIUS = 30; // meters - hexagonal formation radius
const BOUNDARY_SIZE = 500; // meters - operational boundary

// Logging utility
const logger = {
  debug: (...args) => DEBUG && console.log('[DEBUG]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

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

// Swarm waypoint lists - one list per swarm (center points)
// Heights vary between 100-200m for visual interest
const swarmWaypoints = {
  'SWARM-1': [
    { x: 0, y: 0, z: 0 },         // Waypoint 0: Home base
    { x: 100, y: 0, z: 120 },     // Waypoint 1: Low cruise
    { x: 200, y: 50, z: 180 },    // Waypoint 2: High altitude
    { x: 200, y: 150, z: 150 },   // Waypoint 3: Mid altitude
    { x: 100, y: 200, z: 200 },   // Waypoint 4: Maximum altitude
    { x: 0, y: 200, z: 140 },     // Waypoint 5: Descending
    { x: -100, y: 150, z: 170 },  // Waypoint 6: Climbing
    { x: -100, y: 50, z: 130 },   // Waypoint 7: Low cruise
    { x: 0, y: 100, z: 160 },     // Waypoint 8: Mid altitude
    { x: 0, y: 0, z: 0 }          // Waypoint 9: Return home
  ]
};

// Helper function: Calculate hexagonal positions around a center point
function getHexagonalFormation(centerX, centerY, centerZ, radius = FORMATION_RADIUS) {
  const positions = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * (Math.PI / 180); // 60 degrees between each
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      z: centerZ
    });
  }
  return positions;
}

// Initialize SWARM-1 positions - all start at origin (0,0,0)
const swarm1Positions = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 }
];

// HORNET states - only SWARM-1 with 6 drones
// All drones start at origin (0,0,0)
const uavStates = {
  'HORNET-1': { id: 'HORNET-1', swarm: 'SWARM-1', formationIndex: 0, position: { ...swarm1Positions[0] }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#00bfff' },
  'HORNET-2': { id: 'HORNET-2', swarm: 'SWARM-1', formationIndex: 1, position: { ...swarm1Positions[1] }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#1e90ff' },
  'HORNET-3': { id: 'HORNET-3', swarm: 'SWARM-1', formationIndex: 2, position: { ...swarm1Positions[2] }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#4169e1' },
  'HORNET-4': { id: 'HORNET-4', swarm: 'SWARM-1', formationIndex: 3, position: { ...swarm1Positions[3] }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#6495ed' },
  'HORNET-5': { id: 'HORNET-5', swarm: 'SWARM-1', formationIndex: 4, position: { ...swarm1Positions[4] }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#7b68ee' },
  'HORNET-6': { id: 'HORNET-6', swarm: 'SWARM-1', formationIndex: 5, position: { ...swarm1Positions[5] }, velocity: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, roll: 0, yaw: 0 }, battery: 100, status: 'idle', armed: false, color: '#00ced1' }
};

// Swarm targets for click-to-move
const swarmTargets = {};

// Regions of Interest (ROI)
const regionsOfInterest = {};

// Target markers
const targetMarkers = {};

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
  logger.info('Client connected');
  clients.add(ws);

  // Send current state of all UAVs to new client
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: uavStates
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const uavId = data.uavId;

      if (!uavId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing uavId in command' }));
        return;
      }

      const simulatorWs = simulatorConnections.get(uavId);

      // Forward command to specific UAV simulator
      if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
        // Minimal routing log in debug mode
        if (data.type === 'command') {
          logger.debug(`Route cmd ${data.command} -> ${uavId}`);
        }
        simulatorWs.send(JSON.stringify(data));
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Simulator for ${uavId} not connected`
        }));
      }
    } catch (error) {
      logger.error('Error parsing client message:', error);
    }
  });

  ws.on('close', () => {
    logger.info('Client disconnected');
    clients.delete(ws);
  });
});

// Simulator WebSocket connections (one per UAV)
wssSimulator.on('connection', (ws, req) => {
  // Extract UAV ID from query parameter
  const url = new URL(req.url, 'http://localhost');
  const uavId = url.searchParams.get('id') || 'UAV-1';

  logger.info(`Simulator connected for ${uavId}`);
  simulatorConnections.set(uavId, ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

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
        // Log non-state messages in debug mode
        logger.debug(`Received from simulator ${uavId}:`, data.type);
        // Forward other messages (command responses) to clients
        const message = { ...data, uavId };
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch (error) {
      logger.error('Error parsing simulator message:', error);
    }
  });

  ws.on('close', () => {
    logger.info(`Simulator disconnected for ${uavId}`);
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
  const uavId = command.uavId;

  if (!uavId) {
    return res.status(400).json({ success: false, message: 'Missing uavId in command' });
  }

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
  const { swarmId, formation, centerX, centerY, maintainAltitude } = req.body;

  // Get all HORNETs in the swarm
  const swarmHornets = Object.entries(uavStates)
    .filter(([_, uav]) => uav.swarm === swarmId)
    .map(([id, uav]) => ({ id, currentZ: uav.position.z }));

  if (swarmHornets.length === 0) {
    return res.status(404).json({ success: false, message: 'Swarm not found' });
  }

  // Use provided center coordinates
  const formationCenterX = centerX;
  const formationCenterY = centerY;
  
  // Determine target altitude
  let targetZ;
  if (maintainAltitude) {
    // Use average current altitude of swarm
    targetZ = swarmHornets.reduce((sum, h) => sum + h.currentZ, 0) / swarmHornets.length;
  } else {
    targetZ = 50; // Default formation altitude
  }

  if (formation === 'hexagon' && swarmHornets.length === 6) {
    // Hexagonal formation with 6 drones
    const radius = FORMATION_RADIUS;
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
    swarmHornets.forEach((hornet, index) => {
      const simulatorWs = simulatorConnections.get(hornet.id);
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

// Reset positions endpoint - resets drones to their hexagonal formation around first waypoint
app.post('/api/reset-positions', (req, res) => {
  const { uavId, swarmId } = req.body;

  let resetCount = 0;

  // Reset specific UAV to its formation position
  if (uavId && uavStates[uavId]) {
    const uav = uavStates[uavId];
    const swarm = uav.swarm;
    const formationIndex = uav.formationIndex;
    const centerWaypoint = swarmWaypoints[swarm][0];
    const formationPositions = getHexagonalFormation(centerWaypoint.x, centerWaypoint.y, centerWaypoint.z);
    const targetPosition = formationPositions[formationIndex];

    const simulatorWs = simulatorConnections.get(uavId);
    if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
      simulatorWs.send(JSON.stringify({
        type: 'command',
        command: 'goto',
        params: targetPosition
      }));
      resetCount++;
    }
  }
  // Reset entire swarm to hexagonal formation around first waypoint
  else if (swarmId && swarmWaypoints[swarmId]) {
    const centerWaypoint = swarmWaypoints[swarmId][0];
    const formationPositions = getHexagonalFormation(centerWaypoint.x, centerWaypoint.y, centerWaypoint.z);

    Object.entries(uavStates).forEach(([id, uav]) => {
      if (uav.swarm === swarmId) {
        const targetPosition = formationPositions[uav.formationIndex];
        const simulatorWs = simulatorConnections.get(id);

        if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
          simulatorWs.send(JSON.stringify({
            type: 'command',
            command: 'goto',
            params: targetPosition
          }));
          resetCount++;
        }
      }
    });
  }
  // Reset all drones to their respective swarm formations
  else {
    // Reset SWARM-1 to origin (0,0,0)
    Object.entries(uavStates).forEach(([id, uav]) => {
      if (uav.swarm === 'SWARM-1') {
        const targetPosition = { x: 0, y: 0, z: 0 };
        const simulatorWs = simulatorConnections.get(id);

        if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
          simulatorWs.send(JSON.stringify({
            type: 'command',
            command: 'goto',
            params: targetPosition
          }));
          resetCount++;
        }
      }
    });
  }

  res.json({
    success: true,
    message: `Reset ${resetCount} drone(s) to initial positions`,
    resetCount
  });
});

// Get waypoints for a specific swarm
app.get('/api/waypoints/:swarmId', (req, res) => {
  const { swarmId } = req.params;

  if (swarmWaypoints[swarmId]) {
    res.json({
      success: true,
      swarmId,
      waypoints: swarmWaypoints[swarmId]
    });
  } else {
    res.status(404).json({
      success: false,
      message: `No waypoints found for ${swarmId}`
    });
  }
});

// Execute waypoint navigation for swarm with hexagonal formation
app.post('/api/swarm-waypoint', (req, res) => {
  const { swarmId, waypointIndex } = req.body;

  if (!swarmId || !swarmWaypoints[swarmId]) {
    return res.status(400).json({ success: false, message: 'Invalid or missing swarmId' });
  }

  const waypoints = swarmWaypoints[swarmId];
  if (waypointIndex < 0 || waypointIndex >= waypoints.length) {
    return res.status(400).json({
      success: false,
      message: `Invalid waypoint index. Valid range: 0-${waypoints.length - 1}`
    });
  }

  // Get all drones in the swarm
  const swarmDrones = Object.entries(uavStates)
    .filter(([_, uav]) => uav.swarm === swarmId)
    .sort(([_, a], [__, b]) => a.formationIndex - b.formationIndex);

  if (swarmDrones.length !== 6) {
    return res.status(400).json({
      success: false,
      message: `Swarm must have exactly 6 drones for hexagonal formation (has ${swarmDrones.length})`
    });
  }

  // Get the center waypoint for the swarm
  const centerWaypoint = waypoints[waypointIndex];

  // Calculate hexagonal formation positions around the center waypoint
  const formationPositions = getHexagonalFormation(centerWaypoint.x, centerWaypoint.y, centerWaypoint.z);

  // Send goto commands to each drone maintaining their formation index
  let commandCount = 0;
  swarmDrones.forEach(([droneId, uav]) => {
    const targetPosition = formationPositions[uav.formationIndex];
    const simulatorWs = simulatorConnections.get(droneId);

    if (simulatorWs && simulatorWs.readyState === WebSocket.OPEN) {
      simulatorWs.send(JSON.stringify({
        type: 'command',
        command: 'goto',
        params: targetPosition
      }));
      commandCount++;
    }
  });

  res.json({
    success: true,
    message: `${swarmId} navigating to waypoint ${waypointIndex} in hexagonal formation`,
    center: centerWaypoint,
    formation: formationPositions,
    commandsSent: commandCount
  });
});

// Path planning endpoint - proxies to pathplanner service
app.post('/api/plan-mission', async (req, res) => {
  try {
    const { origins, targets, jammers } = req.body;
    
    logger.info(`Planning mission with ${origins?.length || 0} origins, ${targets?.length || 0} targets, ${jammers?.length || 0} jammers`);
    
    // Forward request to pathplanner service
    const fetch = require('node-fetch');
    const response = await fetch('http://pathplanner:5000/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        origins: origins || [],
        targets: targets || [],
        jammers: jammers || []
      })
    });
    
    if (!response.ok) {
      throw new Error(`Pathplanner returned status ${response.status}`);
    }
    
    const result = await response.json();
    logger.info(`Received ${result.trajectories?.length || 0} trajectories from pathplanner`);
    
    // Save waypoints to file for debugging
    const waypointsFile = path.join(__dirname, 'waypoints.json');
    try {
      fs.writeFileSync(waypointsFile, JSON.stringify(result, null, 2));
      logger.debug(`Saved waypoints to ${waypointsFile}`);
    } catch (error) {
      logger.error('Error saving waypoints:', error);
    }
    
    res.json(result);
  } catch (error) {
    logger.error('Error calling pathplanner:', error);
    res.status(500).json({ 
      error: 'Failed to plan mission',
      message: error.message 
    });
  }
});

// Retrieve the most recently saved waypoints
app.get('/api/waypoints', (req, res) => {
  const waypointsFile = path.join(__dirname, 'waypoints.json');

  try {
    if (!fs.existsSync(waypointsFile)) {
      return res.status(404).json({
        error: 'Waypoints not found',
        message: 'No mission has been planned yet.'
      });
    }

    const data = fs.readFileSync(waypointsFile, 'utf-8');
    const parsed = JSON.parse(data);
    res.json(parsed);
  } catch (error) {
    logger.error('Error reading waypoints file:', error);
    res.status(500).json({
      error: 'Failed to read waypoints file',
      message: error.message
    });
  }
});

// Legacy endpoint for backward compatibility
app.get('/api/mission-targets', (req, res) => {
  res.json({ targets: [] });
});

// Mission parameters endpoints (origins, targets, jammers)
app.get('/api/mission-params', (req, res) => {
  const paramsFile = path.join(__dirname, 'mission_params.json');
  
  try {
    if (!fs.existsSync(paramsFile)) {
      return res.json({
        origins: [],
        targets: [],
        jammers: []
      });
    }
    
    const data = fs.readFileSync(paramsFile, 'utf-8');
    const parsed = JSON.parse(data);
    res.json(parsed);
  } catch (error) {
    logger.error('Error reading mission params file:', error);
    res.status(500).json({
      error: 'Failed to read mission params',
      message: error.message
    });
  }
});

app.post('/api/mission-params', (req, res) => {
  const paramsFile = path.join(__dirname, 'mission_params.json');
  const { origins, targets, jammers } = req.body;
  
  try {
    const data = {
      origins: origins || [],
      targets: targets || [],
      jammers: jammers || []
    };
    
    fs.writeFileSync(paramsFile, JSON.stringify(data, null, 2));
    logger.info(`Saved mission params: ${origins?.length || 0} origins, ${targets?.length || 0} targets, ${jammers?.length || 0} jammers`);
    
    res.json({
      success: true,
      message: 'Mission parameters saved successfully'
    });
  } catch (error) {
    logger.error('Error saving mission params:', error);
    res.status(500).json({
      error: 'Failed to save mission params',
      message: error.message
    });
  }
});

// Mission management endpoints - for saving/loading complete missions
const missionsDir = path.join(__dirname, 'missions');
if (!fs.existsSync(missionsDir)) {
  fs.mkdirSync(missionsDir, { recursive: true });
}

// Get list of all saved missions
app.get('/api/missions', (req, res) => {
  try {
    const files = fs.readdirSync(missionsDir);
    const missions = files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(missionsDir, f);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          id: data.id,
          name: data.name,
          timestamp: data.timestamp,
          description: data.description,
          stats: {
            origins: data.origins?.length || 0,
            targets: data.targets?.length || 0,
            jammers: data.jammers?.length || 0,
            trajectories: data.trajectories?.length || 0
          }
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
    
    res.json({ missions });
  } catch (error) {
    logger.error('Error listing missions:', error);
    res.status(500).json({ error: 'Failed to list missions', message: error.message });
  }
});

// Get specific mission by ID
app.get('/api/missions/:id', (req, res) => {
  try {
    const filePath = path.join(missionsDir, `${req.params.id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (error) {
    logger.error('Error loading mission:', error);
    res.status(500).json({ error: 'Failed to load mission', message: error.message });
  }
});

// Save a new mission
app.post('/api/missions', (req, res) => {
  try {
    const { name, origins, targets, jammers, trajectories, waypointPayload, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Mission name is required' });
    }
    
    const missionId = `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const missionData = {
      id: missionId,
      name,
      description: description || '',
      timestamp: Date.now(),
      origins: origins || [],
      targets: targets || [],
      jammers: jammers || [],
      trajectories: trajectories || [],
      waypointPayload: waypointPayload || null
    };
    
    const filePath = path.join(missionsDir, `${missionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(missionData, null, 2));
    
    logger.info(`Mission saved: ${name} (${missionId})`);
    res.json({ success: true, id: missionId, message: 'Mission saved successfully' });
  } catch (error) {
    logger.error('Error saving mission:', error);
    res.status(500).json({ error: 'Failed to save mission', message: error.message });
  }
});

// Delete a mission
app.delete('/api/missions/:id', (req, res) => {
  try {
    const filePath = path.join(missionsDir, `${req.params.id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    
    fs.unlinkSync(filePath);
    logger.info(`Mission deleted: ${req.params.id}`);
    res.json({ success: true, message: 'Mission deleted successfully' });
  } catch (error) {
    logger.error('Error deleting mission:', error);
    res.status(500).json({ error: 'Failed to delete mission', message: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`);
  logger.info(`WebSocket endpoints:`);
  logger.info(`  - Client: ws://localhost:${PORT}/ws/client`);
  logger.info(`  - Simulator: ws://localhost:${PORT}/ws/simulator`);
});
