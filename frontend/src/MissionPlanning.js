import React, { useState, useEffect } from 'react';
import './MissionPlanning.css';
import TerrainMap from './TerrainMap';
import { mapToSimulatorCoords } from './utils/coordinateUtils';
import { logger } from './utils/logger';

function MissionPlanning({ onNavigateHome }) {
  const [onToggleStyle, setOnToggleStyle] = useState(null);
  const [onToggle2DView, setOnToggle2DView] = useState(null);
  const [is2DView, setIs2DView] = useState(true); // Track current view mode
  const [isSelectingTarget, setIsSelectingTarget] = useState(false);
  const [isSelectingOrigin, setIsSelectingOrigin] = useState(false);
  const [isSelectingJammer, setIsSelectingJammer] = useState(false);
  const [targets, setTargets] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [jammers, setJammers] = useState([]);
  const [trajectories, setTrajectories] = useState([]);
  const [targetCounter, setTargetCounter] = useState(1);
  const [originCounter, setOriginCounter] = useState(1);
  const [jammerCounter, setJammerCounter] = useState(1);
  const [isPlanning, setIsPlanning] = useState(false);
  const [waypointPayload, setWaypointPayload] = useState(null);
  const [isFetchingWaypoints, setIsFetchingWaypoints] = useState(false);
  const [waypointError, setWaypointError] = useState(null);
  const [showTrajectoryPanel, setShowTrajectoryPanel] = useState(false);

  // Empty UAVs object for map initialization
  const emptyUavs = {};

  // Load targets from backend on mount
  useEffect(() => {
    loadMissionParams();
    fetchLatestWaypoints();
  }, []);

  // ESC key handler to exit selection modes
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        setIsSelectingTarget(false);
        setIsSelectingOrigin(false);
        setIsSelectingJammer(false);
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, []);

  const loadMissionParams = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/mission-params');
      if (response.ok) {
        const data = await response.json();
        
        // Load targets
        const targetList = data.targets || [];
        setTargets(targetList);
        if (targetList.length > 0) {
          const maxId = Math.max(...targetList.map(t => parseInt(t.id.replace('TARGET-', '')) || 0));
          setTargetCounter(maxId + 1);
        }
        
        // Load origins
        const originList = data.origins || [];
        setOrigins(originList);
        if (originList.length > 0) {
          const maxId = Math.max(...originList.map(o => parseInt(o.id.replace('ORIGIN-', '')) || 0));
          setOriginCounter(maxId + 1);
        }
        
        // Load jammers
        const jammerList = data.jammers || [];
        setJammers(jammerList);
        if (jammerList.length > 0) {
          const maxId = Math.max(...jammerList.map(j => parseInt(j.id.replace('JAMMER-', '')) || 0));
          setJammerCounter(maxId + 1);
        }
      }
    } catch (error) {
      logger.error('Error loading mission params:', error);
    }
  };

  const fetchLatestWaypoints = async () => {
    try {
      setWaypointError(null);
      setIsFetchingWaypoints(true);
      const response = await fetch('http://localhost:3001/api/waypoints');

      if (response.status === 404) {
        setWaypointPayload(null);
        setTrajectories([]);
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to load waypoints: HTTP ${response.status}`);
      }

      const data = await response.json();
      setWaypointPayload(data);
      setTrajectories(data.trajectories || []);
      return data;
    } catch (error) {
      console.error('Error fetching persisted waypoints:', error);
      setWaypointError(error.message);
      return null;
    } finally {
      setIsFetchingWaypoints(false);
    }
  };

  const saveMissionParams = async (newTargets, newOrigins, newJammers) => {
    try {
      const response = await fetch('http://localhost:3001/api/mission-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          targets: newTargets,
          origins: newOrigins,
          jammers: newJammers || jammers
        })
      });
      if (response.ok) {
        logger.debug('Mission params saved successfully');
        // Reload data from backend to ensure consistency
        await loadMissionParams();
      }
    } catch (error) {
      logger.error('Error saving mission params:', error);
    }
  };

  const handleSelectTargetClick = () => {
    setIsSelectingTarget(!isSelectingTarget);
    setIsSelectingOrigin(false);
    setIsSelectingJammer(false);
  };

  const handleSelectOriginClick = () => {
    setIsSelectingOrigin(!isSelectingOrigin);
    setIsSelectingTarget(false);
    setIsSelectingJammer(false);
  };

  const handleSelectJammerClick = () => {
    setIsSelectingJammer(!isSelectingJammer);
    setIsSelectingTarget(false);
    setIsSelectingOrigin(false);
  };

  const handleMapClick = (lng, lat) => {
    if (isSelectingTarget) {
      // Convert lng/lat to x/y coordinates
      const { x, y } = mapToSimulatorCoords(lng, lat);

      const newTarget = {
        id: `TARGET-${targetCounter}`,
        name: `Target ${targetCounter}`,
        lng: lng,
        lat: lat,
        x: x,
        y: y,
        createdAt: new Date().toISOString()
      };

      const updatedTargets = [...targets, newTarget];
      setTargets(updatedTargets);
      setTargetCounter(targetCounter + 1);
      saveMissionParams(updatedTargets, origins, jammers);
      // Keep selection mode active - removed setIsSelectingTarget(false);
    }
    
    if (isSelectingOrigin) {
      // Convert lng/lat to x/y coordinates
      const { x, y } = mapToSimulatorCoords(lng, lat);

      const newOrigin = {
        id: `ORIGIN-${originCounter}`,
        name: `Origin ${originCounter}`,
        lng: lng,
        lat: lat,
        x: x,
        y: y,
        createdAt: new Date().toISOString()
      };

      const updatedOrigins = [...origins, newOrigin];
      setOrigins(updatedOrigins);
      setOriginCounter(originCounter + 1);
      saveMissionParams(targets, updatedOrigins, jammers);
      // Keep selection mode active - removed setIsSelectingOrigin(false);
    }

    if (isSelectingJammer) {
      // Convert lng/lat to x/y coordinates
      const { x, y } = mapToSimulatorCoords(lng, lat);

      const newJammer = {
        id: `JAMMER-${jammerCounter}`,
        name: `Jammer ${jammerCounter}`,
        lng: lng,
        lat: lat,
        x: x,
        y: y,
        radius: 50, // Default radius in meters
        createdAt: new Date().toISOString()
      };

      const updatedJammers = [...jammers, newJammer];
      setJammers(updatedJammers);
      setJammerCounter(jammerCounter + 1);
      saveMissionParams(targets, origins, updatedJammers);
      // Keep selection mode active
    }
  };

  const handleDeleteTarget = (targetId) => {
    const updatedTargets = targets.filter(t => t.id !== targetId);
    setTargets(updatedTargets);
    saveMissionParams(updatedTargets, origins, jammers);
  };

  const handleRenameTarget = (targetId, newName) => {
    const updatedTargets = targets.map(t => 
      t.id === targetId ? { ...t, name: newName } : t
    );
    setTargets(updatedTargets);
    saveMissionParams(updatedTargets, origins, jammers);
  };

  const handleDeleteOrigin = (originId) => {
    const updatedOrigins = origins.filter(o => o.id !== originId);
    setOrigins(updatedOrigins);
    saveMissionParams(targets, updatedOrigins, jammers);
  };

  const handleRenameOrigin = (originId, newName) => {
    const updatedOrigins = origins.map(o => 
      o.id === originId ? { ...o, name: newName } : o
    );
    setOrigins(updatedOrigins);
    saveMissionParams(targets, updatedOrigins, jammers);
  };

  const handleJammerCreated = (jammerData) => {
    const newJammer = {
      id: `JAMMER-${jammerCounter}`,
      name: `Jammer ${jammerCounter}`,
      ...jammerData,
      createdAt: new Date().toISOString()
    };

    const updatedJammers = [...jammers, newJammer];
    setJammers(updatedJammers);
    setJammerCounter(jammerCounter + 1);
    saveMissionParams(targets, origins, updatedJammers);
  };

  const handleDeleteJammer = (jammerId) => {
    const updatedJammers = jammers.filter(j => j.id !== jammerId);
    setJammers(updatedJammers);
    saveMissionParams(targets, origins, updatedJammers);
  };

  const handleRenameJammer = (jammerId, newName) => {
    const updatedJammers = jammers.map(j => 
      j.id === jammerId ? { ...j, name: newName } : j
    );
    setJammers(updatedJammers);
    saveMissionParams(targets, origins, updatedJammers);
  };

  const handleUpdateJammerRadius = (jammerId, newRadius) => {
    const radius = parseFloat(newRadius);
    if (isNaN(radius) || radius < 10) return; // Minimum 10m radius
    
    const updatedJammers = jammers.map(j => 
      j.id === jammerId ? { ...j, radius: radius } : j
    );
    setJammers(updatedJammers);
    saveMissionParams(targets, origins, updatedJammers);
  };

  const handlePlanMission = async () => {
    if (origins.length === 0 || targets.length === 0) {
      alert('Please add at least one origin and one target before planning.');
      return;
    }

    setIsPlanning(true);
    console.log('=== STARTING MISSION PLANNING ===');
    console.log('Origins:', origins);
    console.log('Targets:', targets);
    console.log('Jammers:', jammers);
    
    try {
      const requestData = { 
        origins: origins,
        targets: targets,
        jammers: jammers
      };
      console.log('Sending request to backend:', requestData);
      
      const response = await fetch('http://localhost:3001/api/plan-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('=== RECEIVED TRAJECTORIES ===');
        console.log('Full result:', JSON.stringify(result, null, 2));
        console.log('Number of trajectories:', result.trajectories?.length || 0);
        console.log('Setting trajectories state to:', result.trajectories);
        setTrajectories(result.trajectories ? [...result.trajectories] : []);
        setWaypointPayload(result);
        await fetchLatestWaypoints();
        console.log('Trajectories state set!');
      } else {
        const error = await response.json();
        console.error('Planning failed:', error);
        alert(`Mission planning failed: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error planning mission:', error);
      alert(`Failed to plan mission: ${error.message}`);
    } finally {
      setIsPlanning(false);
      console.log('=== PLANNING COMPLETE ===');
    }
  };

  const displayedTrajectories = waypointPayload?.trajectories || trajectories;
  const hasWaypoints = displayedTrajectories.length > 0;

  const handleClearWaypoints = () => {
    setWaypointPayload(null);
    setTrajectories([]);
    setShowTrajectoryPanel(false);
  };

  const handleShowTrajectory = async () => {
    await fetchLatestWaypoints();
    setShowTrajectoryPanel(true);
  };

  return (
    <div className="mission-planning">
      <TerrainMap
        uavs={emptyUavs}
        selectedUavId={null}
        selectedSwarm={null}
        onSelectUav={() => {}}
        onMapClick={handleMapClick}
        onRefreshData={loadMissionParams}
        isSelectingTarget={isSelectingTarget}
        isSelectingOrigin={isSelectingOrigin}
        isSelectingJammer={isSelectingJammer}
        onJammerCreated={handleJammerCreated}
        trajectories={trajectories}
        rois={[]}
        targets={targets.map(t => ({
          id: t.id,
          x: t.x,
          y: t.y,
          lat: t.lat,
          lng: t.lng,
          z: 0
        }))}
        origins={origins.map(o => ({
          id: o.id,
          x: o.x,
          y: o.y,
          lat: o.lat,
          lng: o.lng,
          z: 0
        }))}
        jammers={jammers.map(j => ({
          id: j.id,
          x: j.x,
          y: j.y,
          lat: j.lat,
          lng: j.lng,
          radius: j.radius
        }))}
        onToggleStyleReady={setOnToggleStyle}
        onToggle2DViewReady={setOnToggle2DView}
        assemblyMode={null}
        initialViewMode="2d"
      />

      <div className="planning-top-bar">
        <button className="home-nav-btn" onClick={onNavigateHome}>
          ← HOME
        </button>
        <h1>
          <div className="hive-title">
            <span className="hive-letter">S</span>
            <span className="hive-word">warm</span>
            <span className="hive-letter">T</span>
            <span className="hive-word">actical</span>
            <span className="hive-letter">I</span>
            <span className="hive-word">ntelligence &</span>
            <span className="hive-letter">N</span>
            <span className="hive-word">avigation</span>
            <span className="hive-letter">G</span>
            <span className="hive-word">rid</span>
          </div>
        </h1>
      </div>

      <div className="planning-sidebar">
        <div className="sidebar-header">
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
          <button
            className={`topology-toggle-btn ${isSelectingTarget ? 'active-selection' : ''}`}
            onClick={handleSelectTargetClick}
          >
            {isSelectingTarget ? '✓ SELECT TARGET' : 'SELECT TARGET'}
          </button>
          <button
            className={`topology-toggle-btn ${isSelectingOrigin ? 'active-selection' : ''}`}
            onClick={handleSelectOriginClick}
          >
            {isSelectingOrigin ? '✓ SELECT ORIGIN' : 'SELECT ORIGIN'}
          </button>
          <button
            className={`topology-toggle-btn ${isSelectingJammer ? 'active-selection' : ''}`}
            onClick={handleSelectJammerClick}
          >
            {isSelectingJammer ? '✓ SELECT JAMMER' : 'SELECT JAMMER'}
          </button>
          <button
            className="topology-toggle-btn plan-mission-btn"
            onClick={handlePlanMission}
            disabled={isPlanning || origins.length === 0 || targets.length === 0}
          >
            {isPlanning ? 'PLANNING...' : 'PLAN MISSION'}
          </button>
          <button
            className="topology-toggle-btn show-trajectory-btn"
            onClick={handleShowTrajectory}
            disabled={isFetchingWaypoints}
          >
            {isFetchingWaypoints ? 'LOADING...' : 'SHOW TRAJECTORY'}
          </button>
        </div>

        <div className="planning-section">
          <h3 className="section-title">MISSION TOOLS</h3>
          <div className="info-text">
            {isSelectingTarget 
              ? 'Click on the map to place a target marker' 
              : isSelectingOrigin
              ? 'Click on the map to place a drone origin point'
              : isSelectingJammer
              ? 'Click on the map to create a 50m jammer zone'
              : displayedTrajectories.length > 0
              ? `Mission planned: ${displayedTrajectories.length} trajectory path${displayedTrajectories.length !== 1 ? 's' : ''}`
              : 'Use the buttons above to add targets, origins, and jammers'}
          </div>
        </div>
      </div>

      {/* Right side panel for targets list - only show when selecting targets */}
      {isSelectingTarget && !showTrajectoryPanel && (
        <div className="targets-panel">
          <div className="panel-header">
            <h2>TARGET LIST</h2>
            <div className="target-count">{targets.length} Target{targets.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="panel-content">
            {targets.length === 0 ? (
              <div className="empty-message">
                No targets added yet. Click on the map to add a target.
              </div>
            ) : (
              targets.map((target) => (
                <div key={target.id} className="target-item">
                  <div className="target-header">
                    <input
                      type="text"
                      className="target-name-input"
                      value={target.name}
                      onChange={(e) => handleRenameTarget(target.id, e.target.value)}
                    />
                    <button 
                      className="delete-target-btn"
                      onClick={() => handleDeleteTarget(target.id)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="target-details">
                    <div className="target-coord">
                      <span className="coord-label">Lat:</span>
                      <span className="coord-value">{target.lat.toFixed(6)}°</span>
                    </div>
                    <div className="target-coord">
                      <span className="coord-label">Lng:</span>
                      <span className="coord-value">{target.lng.toFixed(6)}°</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Right side panel for origins list - only show when selecting origins */}
      {isSelectingOrigin && !showTrajectoryPanel && (
        <div className="targets-panel">
          <div className="panel-header">
            <h2>ORIGIN LIST</h2>
            <div className="target-count">{origins.length} Origin{origins.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="panel-content">
            {origins.length === 0 ? (
              <div className="empty-message">
                No origins added yet. Click on the map to add a drone origin.
              </div>
            ) : (
              origins.map((origin) => (
                <div key={origin.id} className="target-item">
                  <div className="target-header">
                    <input
                      type="text"
                      className="target-name-input"
                      value={origin.name}
                      onChange={(e) => handleRenameOrigin(origin.id, e.target.value)}
                    />
                    <button 
                      className="delete-target-btn"
                      onClick={() => handleDeleteOrigin(origin.id)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="target-details">
                    <div className="target-coord">
                      <span className="coord-label">Lat:</span>
                      <span className="coord-value">{origin.lat.toFixed(6)}°</span>
                    </div>
                    <div className="target-coord">
                      <span className="coord-label">Lng:</span>
                      <span className="coord-value">{origin.lng.toFixed(6)}°</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Right side panel for jammer list - only show when selecting jammers */}
      {isSelectingJammer && !showTrajectoryPanel && (
        <div className="targets-panel">
          <div className="panel-header">
            <h2>JAMMER LIST</h2>
            <div className="target-count">{jammers.length} Jammer{jammers.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="panel-content">
            {jammers.length === 0 ? (
              <div className="empty-message">
                No jammers added yet. Click on the map to create a jammer zone.
              </div>
            ) : (
              jammers.map((jammer) => (
                <div key={jammer.id} className="target-item">
                  <div className="target-header">
                    <input
                      type="text"
                      className="target-name-input"
                      value={jammer.name}
                      onChange={(e) => handleRenameJammer(jammer.id, e.target.value)}
                    />
                    <button 
                      className="delete-target-btn"
                      onClick={() => handleDeleteJammer(jammer.id)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="target-details">
                    <div className="target-coord">
                      <span className="coord-label">Lat:</span>
                      <span className="coord-value">{jammer.lat.toFixed(6)}°</span>
                    </div>
                    <div className="target-coord">
                      <span className="coord-label">Lng:</span>
                      <span className="coord-value">{jammer.lng.toFixed(6)}°</span>
                    </div>
                    <div className="target-coord">
                      <span className="coord-label">Radius:</span>
                      <input
                        type="number"
                        className="radius-input"
                        value={jammer.radius}
                        min="10"
                        step="5"
                        onChange={(e) => handleUpdateJammerRadius(jammer.id, e.target.value)}
                        style={{ width: '60px', marginLeft: '5px' }}
                      />
                      <span style={{ marginLeft: '3px' }}>m</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Right side panel for trajectory waypoints - show when SHOW TRAJECTORY button clicked */}
      {showTrajectoryPanel && (
        <div className="targets-panel waypoints-panel">
          <div className="panel-header">
            <div>
              <h2>WAYPOINTS</h2>
              <div className="panel-subtitle">Synced from waypoints.json</div>
            </div>
            <div className="panel-actions">
              <div className="target-count">
                {displayedTrajectories.length} Trajectory{displayedTrajectories.length !== 1 ? 'ies' : ''}
              </div>
              <button className="clear-waypoints-btn" onClick={handleClearWaypoints}>
                CLOSE
              </button>
            </div>
          </div>
          <div className="panel-content waypoints-panel-content">
            {isFetchingWaypoints && (
              <div className="waypoints-status">Updating from backend…</div>
            )}
            {waypointError && (
              <div className="waypoints-error">{waypointError}</div>
            )}

            {displayedTrajectories.length === 0 ? (
              <div className="empty-message">
                No trajectories found. Click "PLAN MISSION" first to generate waypoints.
              </div>
            ) : (
              displayedTrajectories.map((traj, index) => (
                <div key={`trajectory-${index}`} className="waypoint-trajectory">
                  <div className="waypoint-trajectory-header">
                    <div>
                      <div className="trajectory-label">Trajectory {index + 1}</div>
                      <div className="trajectory-meta">
                        {traj.origin_id || 'Origin'} → {traj.target_id || 'Target'}
                      </div>
                    </div>
                    <div className="trajectory-count">
                      {traj.waypoints?.length || 0} waypoint{(traj.waypoints?.length || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="waypoint-list">
                    {(traj.waypoints || []).map((wp, waypointIndex) => (
                      <div key={`wp-${index}-${waypointIndex}`} className="waypoint-row">
                        <div className="waypoint-index">#{waypointIndex + 1}</div>
                        <div className="waypoint-coordinates">
                          <div><span>Lat</span><strong>{wp.lat?.toFixed ? wp.lat.toFixed(6) : wp.lat}</strong></div>
                          <div><span>Lng</span><strong>{wp.lng?.toFixed ? wp.lng.toFixed(6) : wp.lng}</strong></div>
                          <div><span>Alt</span><strong>{wp.alt ?? '—'} m</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            <details className="waypoints-json">
              <summary>Raw JSON</summary>
              <pre>{JSON.stringify(waypointPayload || { trajectories }, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

export default MissionPlanning;
