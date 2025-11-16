import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import TerrainMap from './TerrainMap';
import HornetCard from './components/HornetCard';
import { mapToSimulatorCoords, getHexagonalFormation } from './utils/coordinateUtils';
import { logger } from './utils/logger';
import { PHYSICS, LOGGING } from './config/constants';

function MissionControl({ onNavigateHome, missionData }) {
  const [connected, setConnected] = useState(false);
  const [uavs, setUavs] = useState({
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
    }
  });
  const [selectedUavId, setSelectedUavId] = useState(null);
  const [selectedSwarm, setSelectedSwarm] = useState(null);
  const [is2DView, setIs2DView] = useState(true); // Track current view mode
  const [expandedSwarms, setExpandedSwarms] = useState({ 'SWARM-1': true });
  const [logs, setLogs] = useState([]);
  const [showControls, setShowControls] = useState(false);
  const [rois, setRois] = useState([]);
  const [targets, setTargets] = useState([]);
  const [assemblyMode, setAssemblyMode] = useState(null);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState({});
  const [trajectories, setTrajectories] = useState([]);
  const [missionJammers, setMissionJammers] = useState([]);
  const [missionExecuting, setMissionExecuting] = useState(false);
  const [missionInitialized, setMissionInitialized] = useState(false);
  const [missionCompleted, setMissionCompleted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const wsRef = useRef(null);

  // Load mission data if provided
  useEffect(() => {
    if (missionData) {
      logger.info('Loading mission data:', missionData);
      
      // Set targets from mission
      if (missionData.targets) {
        setTargets(missionData.targets.map(t => ({
          id: t.id,
          x: t.x,
          y: t.y,
          name: t.name
        })));
      }
      
      // Set trajectories from mission
      if (missionData.trajectories) {
        setTrajectories(missionData.trajectories);
      }
      
      // Set jammers from mission
      if (missionData.jammers) {
        setMissionJammers(missionData.jammers);
      }
      
      // Initialize drones at origin position
      if (missionData.origins && missionData.origins.length > 0) {
        logger.info('Mission origins loaded:', missionData.origins);
        initializeDronesAtOrigin(missionData.origins[0]);
      }
    }
  }, [missionData]);

  const initializeDronesAtOrigin = async (origin) => {
    try {
      // Small formation radius around origin (10 meters)
      const formationRadius = 10;
      
      const response = await fetch('http://localhost:3001/api/reset-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centerX: origin.x,
          centerY: origin.y,
          radius: formationRadius
        })
      });

      if (response.ok) {
        const data = await response.json();
        logger.info('Drones initialized at origin:', data);
        setMissionInitialized(true);
        addLog(`Drones initialized at origin: ${origin.name}`);
      }
    } catch (error) {
      logger.error('Error initializing drones:', error);
      addLog('Failed to initialize drones at origin', 'error');
    }
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3001/ws/client';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      logger.info('Connected to backend');
      setConnected(true);
      addLog('Connected to backend server');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'initial_state') {
          setUavs(data.data);
        } else if (data.type === 'state_update') {
          const uavId = data.uavId;
          if (uavId) {
            setUavs(prev => ({
              ...prev,
              [uavId]: {
                ...prev[uavId],
                ...data.data
              }
            }));
          }
        } else if (data.type === 'roi_update') {
          setRois(data.rois || []);
        } else if (data.type === 'target_update') {
          setTargets(data.targets || []);
        } else if (data.type === 'command_response') {
          addLog(`Command ${data.command}: ${data.message}`);
        } else if (data.type === 'error') {
          addLog(`Error: ${data.message}`, 'error');
        }
      } catch (error) {
        logger.error('Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      logger.error('WebSocket error:', error);
      addLog('WebSocket error occurred', 'error');
    };

    ws.onclose = () => {
      logger.info('Disconnected from backend');
      setConnected(false);
      addLog('Disconnected from backend server');
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-(LOGGING.MAX_LOG_ENTRIES - 1)), { timestamp, message, type }]);
  }, []);

  const sendCommand = useCallback((command, params = {}, uavId = null) => {
    // CRITICAL: uavId parameter must be used, not selectedUavId fallback
    if (!uavId) {
      addLog('No UAV ID provided for command', 'error');
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const commandData = {
        type: 'command',
        command,
        params,
        uavId: uavId,
        timestamp: Date.now()
      };
      wsRef.current.send(JSON.stringify(commandData));
      addLog(`[${uavId}] Sent command: ${command}`);
    } else {
      addLog('Not connected to server', 'error');
    }
  }, [addLog]);

  const selectedUav = uavs[selectedUavId];

  const handleArm = useCallback(() => {
    if (!selectedUavId) return;
    sendCommand('arm', {}, selectedUavId);
  }, [sendCommand, selectedUavId]);
  
  const handleDisarm = useCallback(() => {
    if (!selectedUavId) return;
    sendCommand('disarm', {}, selectedUavId);
  }, [sendCommand, selectedUavId]);
  
  const handleTakeoff = useCallback(() => {
    if (!selectedUavId) return;
    sendCommand('takeoff', { altitude: 10 }, selectedUavId);
  }, [sendCommand, selectedUavId]);
  
  const handleLand = useCallback(() => {
    if (!selectedUavId) return;
    sendCommand('land', {}, selectedUavId);
  }, [sendCommand, selectedUavId]);

  // Single, canonical move API
  const moveSelectedUav = useCallback((x, y) => {
    if (!selectedUavId) {
      addLog('Select a UAV first', 'warning');
      return;
    }

    const currentUav = uavs[selectedUavId];
    if (!currentUav) {
      addLog('Selected UAV not found', 'error');
      return;
    }

    // CRITICAL: Capture the UAV ID in a local variable to avoid closure issues
    const targetUavId = selectedUavId;
    const currentZ = typeof currentUav?.position?.z === 'number' ? currentUav.position.z : 0;
    const targetZ = currentZ > 1 ? currentZ : 20; // auto takeoff altitude if on ground

    if (currentUav.status !== 'flying') {
      // Sequence: arm -> takeoff -> goto
      // Use targetUavId consistently to avoid stale closure
      sendCommand('arm', {}, targetUavId);
      addLog(`[${targetUavId}] Arming`);
      setTimeout(() => {
        sendCommand('takeoff', { altitude: targetZ }, targetUavId);
        addLog(`[${targetUavId}] Takeoff to ${targetZ}m`);
      }, 200);
      setTimeout(() => {
        sendCommand('goto', { x, y, z: targetZ }, targetUavId);
        addLog(`[${targetUavId}] Moving to (${x.toFixed(1)}, ${y.toFixed(1)}, ${targetZ.toFixed(1)})`);
      }, 800);
      return;
    }

    // Already flying, just move
    sendCommand('goto', { x, y, z: targetZ }, targetUavId);
    addLog(`[${targetUavId}] Moving to (${x.toFixed(1)}, ${y.toFixed(1)}, ${targetZ.toFixed(1)})`);
  }, [selectedUavId, uavs, sendCommand, addLog]);

  const handleAltitudePreset = useCallback(async (altitude) => {
    if (selectedSwarm) {
      const swarmDrones = Object.entries(uavs).filter(([_, uav]) => uav.swarm === selectedSwarm);
      swarmDrones.forEach(([uavId, uav]) => {
        if (uav && uav.position) {
          sendCommand('goto', { x: uav.position.x, y: uav.position.y, z: altitude }, uavId);
        }
      });
      addLog(`${selectedSwarm} moving to ${altitude}m altitude`);
    } else if (selectedUavId) {
      const uav = uavs[selectedUavId];
      if (uav && uav.position) {
        sendCommand('goto', { x: uav.position.x, y: uav.position.y, z: altitude }, selectedUavId);
      }
    }
  }, [selectedSwarm, selectedUavId, uavs, sendCommand, addLog]);

  const handleSwarmCommand = useCallback(async (command) => {
    if (!selectedSwarm) return;

    const swarmDrones = Object.entries(uavs).filter(([_, uav]) => uav.swarm === selectedSwarm);
    const params = command === 'takeoff' ? { altitude: 20 } : {};

    swarmDrones.forEach(([uavId]) => {
      sendCommand(command, params, uavId);
    });

    addLog(`${selectedSwarm}: ${command} command sent to all drones`);
  }, [selectedSwarm, uavs, sendCommand, addLog]);

  const handleMapClick = useCallback((lng, lat) => {
    // Convert map coordinates to simulator coordinates
    const { x, y } = mapToSimulatorCoords(lng, lat);

    logger.debug('Map clicked', { selectedUavId, selectedSwarm, x, y });

    // If individual UAV selected, move just that UAV
    if (selectedUavId) {
      logger.debug('Moving individual UAV:', selectedUavId);
      moveSelectedUav(x, y);
      return;
    }

    // If swarm selected, move entire swarm in hexagonal formation
    if (selectedSwarm) {
      logger.debug('Moving swarm:', selectedSwarm);
      const swarmDrones = Object.entries(uavs).filter(([_, uav]) => uav.swarm === selectedSwarm);
      const targetZ = 150; // Standard flight altitude

      if (swarmDrones.length === 0) {
        logger.error('No drones found for swarm:', selectedSwarm);
        addLog(`Error: No drones found for ${selectedSwarm}`, 'error');
        return;
      }

      // Calculate hexagonal formation positions around the clicked center point
      const hexPositions = getHexagonalFormation(x, y, targetZ, PHYSICS.FORMATION_RADIUS);

      logger.debug(`Sending commands to ${swarmDrones.length} drones in hexagonal formation`);
      swarmDrones.forEach(([uavId, uav], index) => {
        const currentZ = typeof uav?.position?.z === 'number' ? uav.position.z : 0;
        const flightZ = currentZ > 1 ? currentZ : targetZ;

        // Get position from hexagonal formation (use index to match formation)
        const targetPos = hexPositions[index % hexPositions.length];
        const targetX = targetPos.x;
        const targetY = targetPos.y;

        if (uav.status !== 'flying') {
          // Arm and takeoff sequence
          sendCommand('arm', {}, uavId);
          setTimeout(() => {
            sendCommand('takeoff', { altitude: flightZ }, uavId);
          }, 200 + (index * 100)); // Stagger commands
          setTimeout(() => {
            sendCommand('goto', { x: targetX, y: targetY, z: flightZ }, uavId);
          }, 800 + (index * 100));
        } else {
          // Already flying, just move to hex position
          sendCommand('goto', { x: targetX, y: targetY, z: flightZ }, uavId);
        }
      });

      addLog(`${selectedSwarm} moving ${swarmDrones.length} drones in formation to (${x.toFixed(1)}, ${y.toFixed(1)})`);
      return;
    }

    addLog('Select a UAV or swarm first', 'warning');
  }, [selectedUavId, selectedSwarm, uavs, moveSelectedUav, sendCommand, addLog]);

  const handleAssemble = useCallback((swarmName) => {
    setAssemblyMode(swarmName);
    addLog(`Click on map to set assembly center for ${swarmName}`);
  }, [addLog]);

  const handleSwarmClick = useCallback((swarmName) => {
    // If the same swarm is clicked again, just toggle expansion
    if (selectedSwarm === swarmName) {
      setExpandedSwarms(prev => ({ ...prev, [swarmName]: !prev[swarmName] }));
      return;
    }

    // Otherwise, clear UAV selection and set swarm
    setSelectedUavId(null);
    setSelectedSwarm(swarmName);
    setExpandedSwarms(prev => ({ ...prev, [swarmName]: true })); // Always expand when selecting new swarm

    addLog(`Selected ${swarmName}`);
  }, [selectedSwarm, selectedUavId, addLog]);

  const handleHornetClick = useCallback((uavId) => {
    // If the same UAV is clicked again, ignore
    if (selectedUavId === uavId) {
      return;
    }
    setSelectedUavId(uavId);
    setSelectedSwarm(null);
    addLog(`Selected ${uavId}`);
  }, [addLog, selectedSwarm, selectedUavId]);

  const handleAddROI = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/roi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 0, radius: 50 })
      });
      if (response.ok) {
        addLog('ROI added');
      }
    } catch (error) {
      logger.error('Error adding ROI:', error);
    }
  };

  const handleAddTarget = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 0 })
      });
      if (response.ok) {
        addLog('Target added');
      }
    } catch (error) {
      logger.error('Error adding target:', error);
    }
  };

  const handleResetPositions = async (target) => {
    try {
      const body = {};
      if (target === 'uav' && selectedUavId) {
        body.uavId = selectedUavId;
      } else if (target === 'swarm' && selectedSwarm) {
        body.swarmId = selectedSwarm;
      }
      // If target is 'all' or no specific selection, send empty body to reset all

      const response = await fetch('http://localhost:3001/api/reset-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        addLog(data.message);

        // Reset mission completion state
        if (target === 'all') {
          setMissionCompleted(false);
          setMissionInitialized(false);
        }

        // Reset waypoint index
        if (target === 'swarm' && selectedSwarm) {
          setCurrentWaypointIndex(prev => ({ ...prev, [selectedSwarm]: 0 }));
        }
      }
    } catch (error) {
      logger.error('Error resetting positions:', error);
      addLog('Failed to reset positions', 'error');
    }
  };

  const handleSwarmWaypoint = async (swarmId, waypointIndex) => {
    try {
      const response = await fetch('http://localhost:3001/api/swarm-waypoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarmId, waypointIndex })
      });

      if (response.ok) {
        const data = await response.json();
        addLog(data.message);
        setCurrentWaypointIndex(prev => ({ ...prev, [swarmId]: waypointIndex }));
      }
    } catch (error) {
      logger.error('Error navigating to waypoint:', error);
      addLog('Failed to navigate to waypoint', 'error');
    }
  };

  const executeMission = async () => {
    if (!missionData || !missionData.trajectories || missionData.trajectories.length === 0) {
      addLog('No mission trajectories available', 'error');
      return;
    }

    if (missionExecuting) {
      addLog('Mission already executing', 'error');
      return;
    }

    setMissionExecuting(true);
    addLog('Starting mission execution...');

    try {
      // Step 0: Teleport all drones to origin point
      if (missionData.origins && missionData.origins.length > 0) {
        const origin = missionData.origins[0];
        addLog(`Step 0: Teleporting drones to origin: ${origin.name || 'Origin Point'}...`);
        
        const response = await fetch('http://localhost:3001/api/reset-positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            centerX: origin.x,
            centerY: origin.y,
            radius: 5 // Small radius to keep them together at origin
          })
        });

        if (response.ok) {
          addLog('✓ Drones teleported to origin');
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          addLog('Failed to teleport drones', 'error');
        }
      }

      // Get all UAVs in SWARM-1
      const allUavIds = Object.keys(uavs).filter(id => uavs[id].swarm === 'SWARM-1');
      
      // Use first trajectory's waypoints as swarm center path
      const waypointsPath = missionData.trajectories[0].waypoints || [];
      
      if (waypointsPath.length === 0) {
        addLog('No waypoints in mission trajectory', 'error');
        setMissionExecuting(false);
        return;
      }

      addLog(`Mission has ${waypointsPath.length} waypoints`);

      // Step 1: Arm all drones
      addLog('Step 1: Arming all drones...');
      for (const uavId of allUavIds) {
        sendCommand('arm', {}, uavId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Takeoff to formation altitude
      const formationAltitude = 100; // meters
      addLog(`Step 2: Taking off to ${formationAltitude}m...`);
      for (const uavId of allUavIds) {
        sendCommand('takeoff', { altitude: formationAltitude }, uavId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for all to reach altitude

      // Step 3: Move into hexagonal formation around first waypoint
      const formationRadius = 30; // meters
      addLog(`Step 3: Moving into formation (${formationRadius}m radius)...`);
      
      const firstWaypoint = waypointsPath[0];
      let centerX, centerY;
      
      if (firstWaypoint.x !== undefined && firstWaypoint.y !== undefined) {
        centerX = firstWaypoint.x;
        centerY = firstWaypoint.y;
      } else if (firstWaypoint.lat !== undefined && firstWaypoint.lng !== undefined) {
        const coords = mapToSimulatorCoords(firstWaypoint.lng, firstWaypoint.lat);
        centerX = coords.x;
        centerY = coords.y;
      }

      const formationPositions = getHexagonalFormation(centerX, centerY, formationAltitude, formationRadius);
      
      for (let i = 0; i < allUavIds.length; i++) {
        const uavId = allUavIds[i];
        const pos = formationPositions[i];
        sendCommand('goto', { x: pos.x, y: pos.y, z: pos.z }, uavId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait to reach formation

      // Step 4: Move swarm center through waypoints (maintaining formation)
      // Gradually decrease altitude from 100m to 0m
      addLog(`Step 4: Executing waypoint trajectory...`);
      
      for (let wpIndex = 1; wpIndex < waypointsPath.length; wpIndex++) {
        const wp = waypointsPath[wpIndex];
        
        // Calculate altitude: linear descent from 100m at start to 0m at final waypoint
        const progress = wpIndex / (waypointsPath.length - 1);
        const altitude = formationAltitude * (1 - progress);
        
        let wpCenterX, wpCenterY;
        if (wp.x !== undefined && wp.y !== undefined) {
          wpCenterX = wp.x;
          wpCenterY = wp.y;
        } else if (wp.lat !== undefined && wp.lng !== undefined) {
          const coords = mapToSimulatorCoords(wp.lng, wp.lat);
          wpCenterX = coords.x;
          wpCenterY = coords.y;
        }

        addLog(`Moving to waypoint ${wpIndex + 1}/${waypointsPath.length} (altitude: ${altitude.toFixed(1)}m)...`);
        
        // Calculate new formation positions around this waypoint
        const newFormation = getHexagonalFormation(wpCenterX, wpCenterY, altitude, formationRadius);
        
        // Send all drones to their formation positions around new center
        for (let i = 0; i < allUavIds.length; i++) {
          const uavId = allUavIds[i];
          const pos = newFormation[i];
          sendCommand('goto', { x: pos.x, y: pos.y, z: pos.z }, uavId);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Wait for swarm to reach waypoint
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Mission complete - land all drones
      addLog('Landing all drones...');
      for (const uavId of allUavIds) {
        sendCommand('land', {}, uavId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      addLog('Mission execution complete!');
      setMissionCompleted(true);
      setShowSuccessModal(true);
    } catch (error) {
      logger.error('Error executing mission:', error);
      addLog(`Mission execution failed: ${error.message}`, 'error');
    } finally {
      setMissionExecuting(false);
    }
  };

  // Fetch swarm waypoints from backend
  const [swarmWaypoints, setSwarmWaypoints] = useState({});

  useEffect(() => {
    // Fetch waypoints for SWARM-1
    const fetchWaypoints = async () => {
      try {
        const swarm1Res = await fetch('http://localhost:3001/api/waypoints/SWARM-1');
        const swarm1Data = await swarm1Res.json();

        setSwarmWaypoints({
          'SWARM-1': swarm1Data.waypoints || []
        });
      } catch (error) {
        logger.error('Error fetching waypoints:', error);
      }
    };

    fetchWaypoints();
  }, []);

  const handleNextWaypoint = () => {
    if (!selectedSwarm) return;

    const waypoints = swarmWaypoints[selectedSwarm];
    if (!waypoints || waypoints.length === 0) return;

    const currentIndex = currentWaypointIndex[selectedSwarm] || 0;
    const nextIndex = (currentIndex + 1) % waypoints.length;

    handleSwarmWaypoint(selectedSwarm, nextIndex);
  };

  const handlePrevWaypoint = () => {
    if (!selectedSwarm) return;

    const waypoints = swarmWaypoints[selectedSwarm];
    if (!waypoints || waypoints.length === 0) return;

    const currentIndex = currentWaypointIndex[selectedSwarm] || 0;
    const prevIndex = currentIndex === 0 ? waypoints.length - 1 : currentIndex - 1;

    handleSwarmWaypoint(selectedSwarm, prevIndex);
  };

  const [onToggleStyle, setOnToggleStyle] = useState(null);
  const [onToggle2DView, setOnToggle2DView] = useState(null);

  return (
    <div className="App">
      <TerrainMap
        uavs={uavs}
        selectedUavId={selectedUavId}
        selectedSwarm={selectedSwarm}
        onSelectUav={handleHornetClick}
        onMapClick={handleMapClick}
        rois={rois}
        targets={targets}
        trajectories={trajectories}
        jammers={missionJammers}
        onToggleStyleReady={setOnToggleStyle}
        onToggle2DViewReady={setOnToggle2DView}
        assemblyMode={assemblyMode}
        initialViewMode="2d"
      />

      <div className="top-bar">
        <button className="home-nav-btn" onClick={onNavigateHome}>
          ← HOME
        </button>
        <div style={{ flex: 1 }}>
        </div>
        {missionData && (
          <button
            className="execute-mission-btn"
            onClick={executeMission}
            disabled={!connected || missionExecuting || !missionInitialized}
            style={{
              padding: '10px 24px',
              marginRight: '15px',
              background: missionExecuting ? 'rgba(255, 165, 0, 0.3)' : 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
              border: 'none',
              borderRadius: '6px',
              color: missionExecuting ? '#ffa500' : '#0a0e27',
              fontWeight: 'bold',
              fontSize: '14px',
              cursor: (!connected || missionExecuting || !missionInitialized) ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              boxShadow: missionExecuting ? 'none' : '0 4px 15px rgba(0, 255, 136, 0.4)',
              opacity: (!connected || !missionInitialized) ? 0.5 : 1
            }}
          >
            {missionExecuting ? '⏳ EXECUTING...' : '▶ EXECUTE MISSION'}
          </button>
        )}
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● CONNECTED' : '○ DISCONNECTED'}
        </div>
      </div>

      <div className="left-sidebar">
        <div className="sidebar-header">
          <div style={{
            fontSize: '14px',
            color: '#ffa500',
            fontWeight: 'bold',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            SELECTED: {selectedUavId || selectedSwarm || 'NONE'}
          </div>
          <button
            className="topology-toggle-btn"
            onClick={() => handleResetPositions('all')}
            disabled={!connected}
            style={{ backgroundColor: '#ff6b35' }}
          >
            ↺ RESET ALL
          </button>
          <button
            className="topology-toggle-btn"
            onClick={() => {
              if (onToggle2DView) {
                onToggle2DView();
                setIs2DView(!is2DView);
              }
            }}
          >
            {is2DView ? '3D VIEW' : '2D VIEW'}
          </button>
        </div>



        {Object.entries(
          Object.entries(uavs).reduce((swarms, [uavId, uav]) => {
            const swarmName = uav.swarm || 'UNASSIGNED';
            if (!swarms[swarmName]) swarms[swarmName] = [];
            swarms[swarmName].push([uavId, uav]);
            return swarms;
          }, {})
        ).map(([swarmName, hornets]) => (
          <div key={swarmName} className="swarm-group">
            <div
              className={`swarm-header ${selectedSwarm === swarmName ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleSwarmClick(swarmName);
              }}
            >
              <span className="swarm-toggle">{expandedSwarms[swarmName] ? '▼' : '▶'}</span>
              <span className="swarm-name">{swarmName}</span>
              <span className="swarm-count">{hornets.length}</span>
            </div>

            {expandedSwarms[swarmName] && hornets
              .filter(([uavId, uav]) => !missionCompleted || uav.status === 'idle') // Hide completed drones
              .map(([uavId, uav]) => (
              <HornetCard
                key={uavId}
                uavId={uavId}
                uav={uav}
                isSelected={selectedUavId === uavId}
                onClick={(e) => {
                  e.stopPropagation();
                  handleHornetClick(uavId);
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="floating-controls-btn">
        <button
          className={`toggle-btn ${showControls ? 'active' : ''}`}
          onClick={() => setShowControls(!showControls)}
        >
          {showControls ? '✕' : '⚙'} CONTROLS
        </button>
      </div>

      {showControls && (selectedUavId || selectedSwarm) && (
        <div className="controls-panel">
          <div className="panel-header">
            <h2>{selectedSwarm ? `Swarm Controls - ${selectedSwarm}` : `Flight Controls - ${selectedUav?.id}`}</h2>
            <button className="close-btn" onClick={() => setShowControls(false)}>✕</button>
          </div>

          <div className="panel-content">
            {selectedSwarm ? (
              <>
                <div className="control-group">
                  <h3>Swarm System</h3>
                  <div className="button-row">
                    <button
                      onClick={() => handleSwarmCommand('arm')}
                      disabled={!connected}
                      className="btn btn-warning"
                    >
                      ARM ALL
                    </button>
                    <button
                      onClick={() => handleSwarmCommand('disarm')}
                      disabled={!connected}
                      className="btn btn-danger"
                    >
                      DISARM ALL
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Swarm Flight</h3>
                  <div className="button-row">
                    <button
                      onClick={() => handleSwarmCommand('takeoff')}
                      disabled={!connected}
                      className="btn btn-success"
                    >
                      TAKEOFF ALL
                    </button>
                    <button
                      onClick={() => handleSwarmCommand('land')}
                      disabled={!connected}
                      className="btn btn-primary"
                    >
                      LAND ALL
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Altitude Presets</h3>
                  <div className="button-row">
                    <button
                      onClick={() => handleAltitudePreset(0)}
                      disabled={!connected}
                      className="btn btn-control"
                    >
                      GROUND (0m)
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      onClick={() => handleAltitudePreset(100)}
                      disabled={!connected}
                      className="btn btn-control"
                    >
                      HOVER (100m)
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      onClick={() => handleAltitudePreset(500)}
                      disabled={!connected}
                      className="btn btn-control"
                    >
                      RECON (500m)
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Navigation</h3>
                  <div className="info-text">
                    Click on map to move swarm to location
                  </div>
                </div>

                <div className="control-group">
                  <h3>Waypoint Navigation</h3>
                  <div style={{
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    padding: '8px',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#00ff00'
                  }}>
                    Waypoint: {(currentWaypointIndex[selectedSwarm] || 0) + 1} / {
                      swarmWaypoints[selectedSwarm]?.length || 0
                    }
                  </div>
                  <div className="button-row">
                    <button
                      onClick={handlePrevWaypoint}
                      disabled={!connected || !selectedSwarm}
                      className="btn btn-control"
                    >
                      ◄ PREV
                    </button>
                    <button
                      onClick={handleNextWaypoint}
                      disabled={!connected || !selectedSwarm}
                      className="btn btn-control"
                    >
                      NEXT ►
                    </button>
                  </div>
                  <div className="info-text" style={{ marginTop: '8px', fontSize: '12px' }}>
                    Swarm flies in hexagonal formation around waypoint center
                  </div>
                </div>

                <div className="control-group">
                  <h3>Reset</h3>
                  <div className="button-row">
                    <button
                      onClick={() => handleResetPositions('swarm')}
                      disabled={!connected || !selectedSwarm}
                      className="btn btn-warning"
                    >
                      ↺ RESET SWARM POSITIONS
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="control-group">
                  <h3>System</h3>
                  <div className="button-row">
                    <button
                      onClick={handleArm}
                      disabled={!connected || selectedUav?.armed}
                      className="btn btn-warning"
                    >
                      ARM
                    </button>
                    <button
                      onClick={handleDisarm}
                      disabled={!connected || !selectedUav?.armed}
                      className="btn btn-danger"
                    >
                      DISARM
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Flight Mode</h3>
                  <div className="button-row">
                    <button
                      onClick={handleTakeoff}
                      disabled={!connected || !selectedUav?.armed || selectedUav?.status === 'flying'}
                      className="btn btn-success"
                    >
                      TAKEOFF
                    </button>
                    <button
                      onClick={handleLand}
                      disabled={!connected || selectedUav?.status !== 'flying'}
                      className="btn btn-primary"
                    >
                      LAND
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Altitude Presets</h3>
                  <div className="button-row">
                    <button
                      onClick={() => handleAltitudePreset(0)}
                      disabled={!connected || !selectedUav}
                      className="btn btn-control"
                    >
                      GROUND (0m)
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      onClick={() => handleAltitudePreset(100)}
                      disabled={!connected || !selectedUav}
                      className="btn btn-control"
                    >
                      HOVER (100m)
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      onClick={() => handleAltitudePreset(500)}
                      disabled={!connected || !selectedUav}
                      className="btn btn-control"
                    >
                      RECON (500m)
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Navigation</h3>
                  <div className="info-text">
                    Click on map to move to location
                  </div>
                </div>

                <div className="control-group">
                  <h3>Reset</h3>
                  <div className="button-row">
                    <button
                      onClick={() => handleResetPositions('uav')}
                      disabled={!connected || !selectedUavId}
                      className="btn btn-warning"
                    >
                      ↺ RESET POSITION
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mission Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🎉 Mission Success!</h2>
            </div>
            <div className="modal-body">
              <p>The mission has been completed successfully.</p>
              <p>All drones have landed safely at the final waypoint.</p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-primary" 
                onClick={() => setShowSuccessModal(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MissionControl;
