import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import TerrainMap from './TerrainMap';

function MissionControl({ onNavigateHome }) {
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

  // Debug: Log whenever selections change
  useEffect(() => {
    console.log('🔴 SELECTION STATE CHANGED:', { selectedUavId, selectedSwarm });
  }, [selectedUavId, selectedSwarm]);
  const [expandedSwarms, setExpandedSwarms] = useState({ 'SWARM-1': true, 'SWARM-2': true });
  const [logs, setLogs] = useState([]);
  const [showControls, setShowControls] = useState(false);
  const [rois, setRois] = useState([]);
  const [targets, setTargets] = useState([]);
  const [assemblyMode, setAssemblyMode] = useState(null);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState({});
  const wsRef = useRef(null);

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
      console.log('Connected to backend');
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
        console.error('Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      addLog('WebSocket error occurred', 'error');
    };

    ws.onclose = () => {
      console.log('Disconnected from backend');
      setConnected(false);
      addLog('Disconnected from backend server');
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-49), { timestamp, message, type }]);
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
    const metersToLng = 0.0001;
    const metersToLat = 0.0001;
    const baseCoords = { lng: -122.4961, lat: 37.5139 };

    // Convert map coordinates to simulator coordinates
    const x = (lat - baseCoords.lat) / metersToLat;
    const y = (lng - baseCoords.lng) / metersToLng;

    console.log('=== MAP CLICK DEBUG ===');
    console.log('selectedUavId:', selectedUavId);
    console.log('selectedSwarm:', selectedSwarm);
    console.log('Target coords:', { x, y });
    console.log('All UAVs:', Object.keys(uavs));
    console.log('WARNING: If both selections are null, click handler was not called or state did not update!');

    // If individual UAV selected, move just that UAV
    if (selectedUavId) {
      console.log('BRANCH: Moving individual UAV:', selectedUavId);
      moveSelectedUav(x, y);
      return;
    }

    // If swarm selected, move entire swarm in hexagonal formation
    if (selectedSwarm) {
      console.log('BRANCH: Moving swarm:', selectedSwarm);
      const swarmDrones = Object.entries(uavs).filter(([_, uav]) => {
        console.log(`Checking ${_}: swarm=${uav.swarm}, match=${uav.swarm === selectedSwarm}`);
        return uav.swarm === selectedSwarm;
      });
      console.log('Filtered swarm drones:', swarmDrones.map(([id]) => id));
      const targetZ = 150; // Standard flight altitude

      if (swarmDrones.length === 0) {
        console.error('NO DRONES FOUND FOR SWARM:', selectedSwarm);
        addLog(`Error: No drones found for ${selectedSwarm}`, 'error');
        return;
      }

      // Calculate hexagonal formation positions around the clicked center point
      const FORMATION_RADIUS = 30; // meters, same as backend
      const hexPositions = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60) * (Math.PI / 180); // 60 degrees between each
        hexPositions.push({
          x: x + FORMATION_RADIUS * Math.cos(angle),
          y: y + FORMATION_RADIUS * Math.sin(angle)
        });
      }

      console.log(`Sending commands to ${swarmDrones.length} drones in hexagonal formation`);
      swarmDrones.forEach(([uavId, uav], index) => {
        const currentZ = typeof uav?.position?.z === 'number' ? uav.position.z : 0;
        const flightZ = currentZ > 1 ? currentZ : targetZ;

        // Get position from hexagonal formation (use index to match formation)
        const targetPos = hexPositions[index % hexPositions.length];
        const targetX = targetPos.x;
        const targetY = targetPos.y;

        console.log(`[${index}] Processing ${uavId}: status=${uav.status}, z=${currentZ}, hex position=${index}`);

        if (uav.status !== 'flying') {
          // Arm and takeoff sequence
          console.log(`  -> Arming and taking off ${uavId}`);
          sendCommand('arm', {}, uavId);
          setTimeout(() => {
            console.log(`  -> Takeoff command for ${uavId}`);
            sendCommand('takeoff', { altitude: flightZ }, uavId);
          }, 200 + (index * 100)); // Stagger commands
          setTimeout(() => {
            console.log(`  -> Goto command for ${uavId} to hex position`);
            sendCommand('goto', { x: targetX, y: targetY, z: flightZ }, uavId);
          }, 800 + (index * 100));
        } else {
          // Already flying, just move to hex position
          console.log(`  -> Moving ${uavId} directly to hex position`);
          sendCommand('goto', { x: targetX, y: targetY, z: flightZ }, uavId);
        }
      });

      addLog(`${selectedSwarm} moving ${swarmDrones.length} drones in formation to (${x.toFixed(1)}, ${y.toFixed(1)})`);
      return;
    }

    console.log('BRANCH: No selection');
    addLog('Select a UAV or swarm first', 'warning');
  }, [selectedUavId, selectedSwarm, uavs, moveSelectedUav, sendCommand, addLog]);

  const handleAssemble = useCallback((swarmName) => {
    setAssemblyMode(swarmName);
    addLog(`Click on map to set assembly center for ${swarmName}`);
  }, [addLog]);

  const handleSwarmClick = useCallback((swarmName) => {
    console.log('=== SWARM CLICK ===');
    console.log('Clicking swarm:', swarmName);
    console.log('Before - selectedSwarm:', selectedSwarm, 'selectedUavId:', selectedUavId);

    // If the same swarm is clicked again, just toggle expansion
    if (selectedSwarm === swarmName) {
      console.log('Same swarm clicked - toggling expansion only');
      setExpandedSwarms(prev => {
        const newExpanded = { ...prev, [swarmName]: !prev[swarmName] };
        console.log('New expanded state:', newExpanded);
        return newExpanded;
      });
      return;
    }

    // Otherwise, clear UAV selection and set swarm
    setSelectedUavId(null);
    setSelectedSwarm(swarmName);
    setExpandedSwarms(prev => {
      const newExpanded = { ...prev, [swarmName]: true }; // Always expand when selecting new swarm
      console.log('New expanded state:', newExpanded);
      return newExpanded;
    });

    addLog(`Selected ${swarmName}`);
    console.log('Called setSelectedSwarm with:', swarmName);
  }, [selectedSwarm, selectedUavId, addLog]);

  const handleHornetClick = useCallback((uavId) => {
    console.log('=== HORNET CLICK ===');
    console.log('Clicked UAV:', uavId);
    console.log('Current selectedUavId:', selectedUavId);
    console.log('Current selectedSwarm:', selectedSwarm);

    // If the same UAV is clicked again, ignore
    if (selectedUavId === uavId) {
      console.log('Same UAV already selected');
      return;
    }

    console.log('Setting selectedUavId to:', uavId);
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
      console.error('Error adding ROI:', error);
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
      console.error('Error adding target:', error);
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

        // Reset waypoint index
        if (target === 'swarm' && selectedSwarm) {
          setCurrentWaypointIndex(prev => ({ ...prev, [selectedSwarm]: 0 }));
        }
      }
    } catch (error) {
      console.error('Error resetting positions:', error);
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
      console.error('Error navigating to waypoint:', error);
      addLog('Failed to navigate to waypoint', 'error');
    }
  };

  // Fetch swarm waypoints from backend
  const [swarmWaypoints, setSwarmWaypoints] = useState({});

  useEffect(() => {
    // Fetch waypoints for both swarms
    const fetchWaypoints = async () => {
      try {
        const [swarm1Res, swarm2Res] = await Promise.all([
          fetch('http://localhost:3001/api/waypoints/SWARM-1'),
          fetch('http://localhost:3001/api/waypoints/SWARM-2')
        ]);

        const swarm1Data = await swarm1Res.json();
        const swarm2Data = await swarm2Res.json();

        setSwarmWaypoints({
          'SWARM-1': swarm1Data.waypoints || [],
          'SWARM-2': swarm2Data.waypoints || []
        });
      } catch (error) {
        console.error('Error fetching waypoints:', error);
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
                console.log('SWARM HEADER CLICKED:', swarmName);
                handleSwarmClick(swarmName);
              }}
            >
              <span className="swarm-toggle">{expandedSwarms[swarmName] ? '▼' : '▶'}</span>
              <span className="swarm-name">{swarmName}</span>
              <span className="swarm-count">{hornets.length}</span>
            </div>

            {expandedSwarms[swarmName] && hornets.map(([uavId, uav]) => (
              <div
                key={uavId}
                className={`hornet-box ${selectedUavId === uavId ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('HORNET BOX CLICKED:', uavId);
                  handleHornetClick(uavId);
                }}
                style={{ borderLeftColor: uav.color }}
              >
                <div className="hornet-header">
                  <div className="hornet-indicator" style={{ backgroundColor: uav.color }}></div>
                  <h3>{uavId}</h3>
                </div>
                <div className="hornet-stats">
                  <div className="stat-row">
                    <span className="stat-label">Alt:</span>
                    <span className="stat-value">{uav.position.z.toFixed(1)}m</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Status:</span>
                    <span className={`stat-value status-${uav.status}`}>{uav.status}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Battery:</span>
                    <span className="stat-value">{uav.battery.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
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
    </div>
  );
}

export default MissionControl;
