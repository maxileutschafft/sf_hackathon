import React, { useState, useEffect } from 'react';
import './MissionPlanning.css';
import TerrainMap from './TerrainMap';

function MissionPlanning({ onNavigateHome }) {
  const [onToggleStyle, setOnToggleStyle] = useState(null);
  const [onToggle2DView, setOnToggle2DView] = useState(null);
  const [isSelectingTarget, setIsSelectingTarget] = useState(false);
  const [isSelectingOrigin, setIsSelectingOrigin] = useState(false);
  const [targets, setTargets] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [targetCounter, setTargetCounter] = useState(1);
  const [originCounter, setOriginCounter] = useState(1);

  // Empty UAVs object for map initialization
  const emptyUavs = {};

  // Load targets from backend on mount
  useEffect(() => {
    loadMissionParams();
  }, []);

  // ESC key handler to exit selection modes
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        setIsSelectingTarget(false);
        setIsSelectingOrigin(false);
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
      }
    } catch (error) {
      console.error('Error loading mission params:', error);
    }
  };

  const saveMissionParams = async (newTargets, newOrigins) => {
    try {
      const response = await fetch('http://localhost:3001/api/mission-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          targets: newTargets,
          origins: newOrigins 
        })
      });
      if (response.ok) {
        console.log('Mission params saved successfully');
      }
    } catch (error) {
      console.error('Error saving mission params:', error);
    }
  };

  const handleSelectTargetClick = () => {
    setIsSelectingTarget(!isSelectingTarget);
    setIsSelectingOrigin(false);
  };

  const handleSelectOriginClick = () => {
    setIsSelectingOrigin(!isSelectingOrigin);
    setIsSelectingTarget(false);
  };

  const handleMapClick = (lng, lat) => {
    console.log('MissionPlanning handleMapClick called with', lng, lat, 'isSelectingTarget=', isSelectingTarget, 'isSelectingOrigin=', isSelectingOrigin);
    
    if (isSelectingTarget) {
      // Convert lng/lat to x/y coordinates (same as in MissionControl)
      const baseCoords = { lng: -122.4961, lat: 37.5139 };
      const metersToLng = 0.0001;
      const metersToLat = 0.0001;

      const x = (lat - baseCoords.lat) / metersToLat;
      const y = (lng - baseCoords.lng) / metersToLng;

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
      saveMissionParams(updatedTargets, origins);
      // Keep selection mode active - removed setIsSelectingTarget(false);
    }
    
    if (isSelectingOrigin) {
      // Convert lng/lat to x/y coordinates
      const baseCoords = { lng: -122.4961, lat: 37.5139 };
      const metersToLng = 0.0001;
      const metersToLat = 0.0001;

      const x = (lat - baseCoords.lat) / metersToLat;
      const y = (lng - baseCoords.lng) / metersToLng;

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
      saveMissionParams(targets, updatedOrigins);
      // Keep selection mode active - removed setIsSelectingOrigin(false);
    }
  };

  const handleDeleteTarget = (targetId) => {
    const updatedTargets = targets.filter(t => t.id !== targetId);
    setTargets(updatedTargets);
    saveMissionParams(updatedTargets, origins);
  };

  const handleRenameTarget = (targetId, newName) => {
    const updatedTargets = targets.map(t => 
      t.id === targetId ? { ...t, name: newName } : t
    );
    setTargets(updatedTargets);
    saveMissionParams(updatedTargets, origins);
  };

  const handleDeleteOrigin = (originId) => {
    const updatedOrigins = origins.filter(o => o.id !== originId);
    setOrigins(updatedOrigins);
    saveMissionParams(targets, updatedOrigins);
  };

  const handleRenameOrigin = (originId, newName) => {
    const updatedOrigins = origins.map(o => 
      o.id === originId ? { ...o, name: newName } : o
    );
    setOrigins(updatedOrigins);
    saveMissionParams(targets, updatedOrigins);
  };

  return (
    <div className="mission-planning">
      <TerrainMap
        uavs={emptyUavs}
        selectedUavId={null}
        selectedSwarm={null}
        onSelectUav={() => {}}
        onMapClick={handleMapClick}
        isSelectingTarget={isSelectingTarget}
        isSelectingOrigin={isSelectingOrigin}
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
        onToggleStyleReady={setOnToggleStyle}
        onToggle2DViewReady={setOnToggle2DView}
        assemblyMode={null}
      />

      <div className="planning-top-bar">
        <button className="home-nav-btn" onClick={onNavigateHome}>
          ← HOME
        </button>
        <h1>HIVE - MISSION PLANNING</h1>
        <div className="subtitle">Design and Plan Mission Routes</div>
      </div>

      <div className="planning-sidebar">
        <div className="sidebar-header">
          <button
            className="topology-toggle-btn"
            onClick={() => onToggleStyle && onToggleStyle()}
          >
            TOPOLOGY
          </button>
          <button
            className="topology-toggle-btn"
            onClick={() => onToggle2DView && onToggle2DView()}
          >
            2D VIEW
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
        </div>

        <div className="planning-section">
          <h3 className="section-title">MISSION TOOLS</h3>
          <div className="info-text">
            {isSelectingTarget 
              ? 'Click on the map to place a target marker' 
              : isSelectingOrigin
              ? 'Click on the map to place a drone origin point'
              : 'Use the buttons above to add targets and drone origins'}
          </div>
        </div>
      </div>

      {/* Right side panel for targets list - only show when selecting targets */}
      {isSelectingTarget && (
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
      {isSelectingOrigin && (
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
    </div>
  );
}

export default MissionPlanning;
