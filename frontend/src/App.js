import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import TerrainMap from './TerrainMap';

function App() {
  const [connected, setConnected] = useState(false);
  const [uavs, setUavs] = useState({
    'UAV-1': {
      id: 'UAV-1',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      orientation: { pitch: 0, roll: 0, yaw: 0 },
      battery: 100,
      status: 'idle',
      armed: false,
      color: '#00bfff'
    }
  });
  const [selectedUavId, setSelectedUavId] = useState('UAV-1');
  const [logs, setLogs] = useState([]);
  const [showControls, setShowControls] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
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

        if (data.type === 'state_update') {
          // Update the simulator UAV state
          setUavs(prev => ({
            ...prev,
            'UAV-1': {
              ...prev['UAV-1'],
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
        timestamp: Date.now()
      }));
      addLog(`Sent command: ${command}`);
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

      {/* Top bar with connection status */}
      <div className="top-bar">
        <h1>UAV Control System</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </div>
      </div>

      {/* Floating control buttons */}
      <div className="floating-buttons">
        <button
          className={`toggle-btn ${showControls ? 'active' : ''}`}
          onClick={() => setShowControls(!showControls)}
        >
          Controls
        </button>
        <button
          className={`toggle-btn ${showLogs ? 'active' : ''}`}
          onClick={() => setShowLogs(!showLogs)}
        >
          Logs
        </button>
      </div>

      {/* Collapsible Controls Panel */}
      {showControls && (
        <div className="overlay-panel controls-panel">
          <div className="panel-header">
            <h2>Flight Controls - {selectedUav.id}</h2>
            <button className="close-btn" onClick={() => setShowControls(false)}>✕</button>
          </div>

          <div className="panel-content">
            {/* Telemetry */}
            <div className="telemetry-compact">
              <div className="telemetry-row">
                <span className="label">Status:</span>
                <span className={`value status-${selectedUav.status}`}>{selectedUav.status}</span>
              </div>
              <div className="telemetry-row">
                <span className="label">Battery:</span>
                <span className="value">{selectedUav.battery}%</span>
              </div>
              <div className="telemetry-row">
                <span className="label">Altitude:</span>
                <span className="value">{selectedUav.position.z.toFixed(1)}m</span>
              </div>
              <div className="telemetry-row">
                <span className="label">Armed:</span>
                <span className="value">{selectedUav.armed ? 'YES' : 'NO'}</span>
              </div>
            </div>

            {/* Control Groups */}
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

      {/* Collapsible Logs Panel */}
      {showLogs && (
        <div className="overlay-panel logs-panel">
          <div className="panel-header">
            <h2>System Logs</h2>
            <button className="close-btn" onClick={() => setShowLogs(false)}>✕</button>
          </div>
          <div className="panel-content">
            <div className="logs-container">
              {logs.map((log, index) => (
                <div key={index} className={`log-entry log-${log.type}`}>
                  <span className="log-timestamp">{log.timestamp}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
