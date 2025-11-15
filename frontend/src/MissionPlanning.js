import React, { useState } from 'react';
import './MissionPlanning.css';
import TerrainMap from './TerrainMap';

function MissionPlanning({ onNavigateHome }) {
  const [onToggleStyle, setOnToggleStyle] = useState(null);

  // Empty UAVs object for map initialization
  const emptyUavs = {};

  const handleMapClick = (lng, lat) => {
    console.log('Map clicked at:', lng, lat);
    // Future: Add waypoints or mission planning logic here
  };

  return (
    <div className="mission-planning">
      <TerrainMap
        uavs={emptyUavs}
        selectedUavId={null}
        selectedSwarm={null}
        onSelectUav={() => {}}
        onMapClick={handleMapClick}
        rois={[]}
        targets={[]}
        onToggleStyleReady={setOnToggleStyle}
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
        </div>

        <div className="planning-section">
          <h3 className="section-title">MISSION PLANNER</h3>
          <div className="info-text">
            Mission planning tools coming soon...
          </div>
        </div>
      </div>
    </div>
  );
}

export default MissionPlanning;
