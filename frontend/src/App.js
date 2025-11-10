import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [connected, setConnected] = useState(false);
  const [uavState, setUavState] = useState({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    orientation: { pitch: 0, roll: 0, yaw: 0 },
    battery: 100,
    status: 'idle',
    armed: false
  });
  const [logs, setLogs] = useState([]);
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
          setUavState(data.data);
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

  const handleArm = () => {
    sendCommand('arm');
  };

  const handleDisarm = () => {
    sendCommand('disarm');
  };

  const handleTakeoff = () => {
    sendCommand('takeoff', { altitude: 10 });
  };

  const handleLand = () => {
    sendCommand('land');
  };

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
      <header className="App-header">
        <h1>🚁 UAV Control System</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </div>
      </header>

      <div className="main-container">
        <div className="left-panel">
          <div className="telemetry-section">
            <h2>Telemetry Data</h2>
            <div className="telemetry-grid">
              <div className="telemetry-item">
                <label>Status:</label>
                <span className={`status-${uavState.status}`}>{uavState.status}</span>
              </div>
              <div className="telemetry-item">
                <label>Armed:</label>
                <span>{uavState.armed ? 'YES' : 'NO'}</span>
              </div>
              <div className="telemetry-item">
                <label>Battery:</label>
                <span>{uavState.battery}%</span>
              </div>
              <div className="telemetry-item">
                <label>Altitude:</label>
                <span>{uavState.position.z.toFixed(2)} m</span>
              </div>
              <div className="telemetry-item">
                <label>Position X:</label>
                <span>{uavState.position.x.toFixed(2)} m</span>
              </div>
              <div className="telemetry-item">
                <label>Position Y:</label>
                <span>{uavState.position.y.toFixed(2)} m</span>
              </div>
              <div className="telemetry-item">
                <label>Velocity:</label>
                <span>{Math.sqrt(
                  uavState.velocity.x ** 2 + 
                  uavState.velocity.y ** 2 + 
                  uavState.velocity.z ** 2
                ).toFixed(2)} m/s</span>
              </div>
              <div className="telemetry-item">
                <label>Yaw:</label>
                <span>{uavState.orientation.yaw.toFixed(1)}°</span>
              </div>
            </div>
          </div>

          <div className="logs-section">
            <h2>System Logs</h2>
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

        <div className="right-panel">
          <div className="control-section">
            <h2>Flight Controls</h2>
            
            <div className="control-group">
              <h3>System</h3>
              <div className="button-row">
                <button 
                  onClick={handleArm} 
                  disabled={!connected || uavState.armed}
                  className="btn btn-warning"
                >
                  ARM
                </button>
                <button 
                  onClick={handleDisarm} 
                  disabled={!connected || !uavState.armed}
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
                  disabled={!connected || !uavState.armed || uavState.status === 'flying'}
                  className="btn btn-success"
                >
                  TAKEOFF
                </button>
                <button 
                  onClick={handleLand} 
                  disabled={!connected || uavState.status !== 'flying'}
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
                    disabled={!connected || uavState.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬆️ UP
                  </button>
                </div>
                <div className="movement-row">
                  <button 
                    onClick={() => handleMove('forward')} 
                    disabled={!connected || uavState.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬆️ FWD
                  </button>
                </div>
                <div className="movement-row">
                  <button 
                    onClick={() => handleMove('left')} 
                    disabled={!connected || uavState.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬅️ LEFT
                  </button>
                  <button 
                    onClick={() => handleMove('down')} 
                    disabled={!connected || uavState.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬇️ DOWN
                  </button>
                  <button 
                    onClick={() => handleMove('right')} 
                    disabled={!connected || uavState.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ➡️ RIGHT
                  </button>
                </div>
                <div className="movement-row">
                  <button 
                    onClick={() => handleMove('backward')} 
                    disabled={!connected || uavState.status !== 'flying'}
                    className="btn btn-control"
                  >
                    ⬇️ BACK
                  </button>
                </div>
              </div>
            </div>

            <div className="control-group">
              <h3>Rotation</h3>
              <div className="button-row">
                <button 
                  onClick={() => handleRotate('ccw')} 
                  disabled={!connected || uavState.status !== 'flying'}
                  className="btn btn-control"
                >
                  ↺ CCW
                </button>
                <button 
                  onClick={() => handleRotate('cw')} 
                  disabled={!connected || uavState.status !== 'flying'}
                  className="btn btn-control"
                >
                  ↻ CW
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
