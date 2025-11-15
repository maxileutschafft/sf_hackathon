import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import TerrainMap from './TerrainMap';

function App() {
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
  const [selectedUavId, setSelectedUavId] = useState('HORNET-1');
  const [expandedSwarms, setExpandedSwarms] = useState({ 'SWARM-1': true, 'SWARM-2': true });
  const [logs, setLogs] = useState([]);
  const [showControls, setShowControls] = useState(false);
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
          // Initial state with all UAVs
          setUavs(data.data);
        } else if (data.type === 'state_update') {
          // Update specific UAV state
          const uavId = data.uavId || 'UAV-1';
          setUavs(prev => ({
            ...prev,
            [uavId]: {
              ...prev[uavId],
              ...data.data
            }
          }));
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

      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-49), { timestamp, message, type }]);
  };

  const sendCommand = (command, params = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        command,
        params,
        uavId: selectedUavId,
        timestamp: Date.now()
      }));
      addLog(`[${selectedUavId}] Sent command: ${command}`);
    } else {
      addLog('Not connected to server', 'error');
    }
  };

  const selectedUav = uavs[selectedUavId];

  const handleArm = () => sendCommand('arm');
  const handleDisarm = () => sendCommand('disarm');
  const handleTakeoff = () => sendCommand('takeoff', { altitude: 10 });
  const handleLand = () => sendCommand('land');

  const handleMove = (direction) => {
    const moveParams = {
      up: { dx: 0, dy: 0, dz: 5 },
      down: { dx: 0, dy: 0, dz: -5 },
      forward: { dx: 5, dy: 0, dz: 0 },
      backward: { dx: -5, dy: 0, dz: 0 },
      left: { dx: 0, dy: -5, dz: 0 },
      right: { dx: 0, dy: 5, dz: 0 }
    };
    sendCommand('move', moveParams[direction]);
  };

  const handleRotate = (direction) => {
    const angle = direction === 'cw' ? 45 : -45;
    sendCommand('rotate', { yaw: angle });
  };

  return (
    <div className="App">
      <TerrainMap
        uavs={uavs}
        selectedUavId={selectedUavId}
        onSelectUav={setSelectedUavId}
      />

      {/* Top bar */}
      <div className="top-bar">
        <h1>HIVE</h1>
        <div className="subtitle">High-altitude Intelligence & Vigilance Ecosystem</div>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● CONNECTED' : '○ DISCONNECTED'}
        </div>
      </div>

      {/* Left Sidebar with SWARM Groups */}
      <div className="left-sidebar">
        <div className="sidebar-header">
          <button
            className="topology-toggle-btn"
            onClick={() => document.querySelector('.terrain-map-container button')?.click()}
          >
            TOPOLOGY
          </button>
        </div>

        {/* Group HORNETs by SWARM */}
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
              className="swarm-header"
              onClick={() => setExpandedSwarms(prev => ({ ...prev, [swarmName]: !prev[swarmName] }))}
            >
              <span className="swarm-toggle">{expandedSwarms[swarmName] ? '▼' : '▶'}</span>
              <span className="swarm-name">{swarmName}</span>
              <span className="swarm-count">{hornets.length}</span>
            </div>

            {expandedSwarms[swarmName] && hornets.map(([uavId, uav]) => (
              <div
                key={uavId}
                className={`hornet-box ${selectedUavId === uavId ? 'selected' : ''}`}
                onClick={() => setSelectedUavId(uavId)}
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

      {/* Controls toggle button */}
      <div className="floating-controls-btn">
        <button
          className={`toggle-btn ${showControls ? 'active' : ''}`}
          onClick={() => setShowControls(!showControls)}
        >
          {showControls ? '✕' : '⚙'} CONTROLS
        </button>
      </div>

      {/* Collapsible Controls Panel */}
      {showControls && (
        <div className="controls-panel">
          <div className="panel-header">
            <h2>Flight Controls - {selectedUav.id}</h2>
            <button className="close-btn" onClick={() => setShowControls(false)}>✕</button>
          </div>

          <div className="panel-content">
            {/* System Controls */}
            <div className="control-group">
              <h3>System</h3>
              <div className="button-row">
                <button
                  onClick={handleArm}
                  disabled={!connected || selectedUav.armed}
                  className="btn btn-warning"
                >
                  ARM
                </button>
                <button
                  onClick={handleDisarm}
                  disabled={!connected || !selectedUav.armed}
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
                  disabled={!connected || !selectedUav.armed || selectedUav.status === 'flying'}
                  className="btn btn-success"
                >
                  TAKEOFF
                </button>
                <button
                  onClick={handleLand}
                  disabled={!connected || selectedUav.status !== 'flying'}
                  className="btn btn-primary"
                >
                  LAND
                </button>
              </div>
            </div>

            <div className="control-group">
              <h3>Movement</h3>
              <div className="movement-grid">
                <div className="movement-row">
                  <button
                    onClick={() => handleMove('up')}
                    disabled={!connected || selectedUav.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬆ UP
                  </button>
                </div>
                <div className="movement-row">
                  <button
                    onClick={() => handleMove('forward')}
                    disabled={!connected || selectedUav.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬆ FWD
                  </button>
                </div>
                <div className="movement-row">
                  <button
                    onClick={() => handleMove('left')}
                    disabled={!connected || selectedUav.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬅ LEFT
                  </button>
                  <button
                    onClick={() => handleMove('down')}
                    disabled={!connected || selectedUav.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬇ DOWN
                  </button>
                  <button
                    onClick={() => handleMove('right')}
                    disabled={!connected || selectedUav.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ➡ RIGHT
                  </button>
                </div>
                <div className="movement-row">
                  <button
                    onClick={() => handleMove('backward')}
                    disabled={!connected || selectedUav.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬇ BACK
                  </button>
                </div>
              </div>
            </div>

            <div className="control-group">
              <h3>Rotation</h3>
              <div className="button-row">
                <button
                  onClick={() => handleRotate('ccw')}
                  disabled={!connected || selectedUav.status !== 'flying'}
                  className="btn btn-control"
                >
                  ↺ CCW
                </button>
                <button
                  onClick={() => handleRotate('cw')}
                  disabled={!connected || selectedUav.status !== 'flying'}
                  className="btn btn-control"
                >
                  ↻ CW
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
