import React, { useState, useEffect } from 'react';
import './MissionSelect.css';
import { logger } from './utils/logger';

function MissionSelect({ onNavigateHome, onMissionSelected }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);

  useEffect(() => {
    loadMissions();
  }, []);

  const loadMissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3001/api/missions');
      
      if (!response.ok) {
        throw new Error(`Failed to load missions: ${response.status}`);
      }
      
      const data = await response.json();
      setMissions(data.missions || []);
    } catch (err) {
      logger.error('Error loading missions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMissionClick = (mission) => {
    setSelectedMission(mission);
  };

  const handleStartMission = async () => {
    if (!selectedMission) return;

    try {
      // Load the full mission data
      const response = await fetch(`http://localhost:3001/api/missions/${selectedMission.id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load mission: ${response.status}`);
      }
      
      const missionData = await response.json();
      logger.info('Starting mission:', missionData);
      
      // Pass mission data to parent and navigate to control
      onMissionSelected(missionData);
    } catch (err) {
      logger.error('Error loading mission data:', err);
      setError(err.message);
    }
  };

  const handleDeleteMission = async (missionId, event) => {
    event.stopPropagation(); // Prevent triggering selection
    
    if (!window.confirm('Are you sure you want to delete this mission?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/missions/${missionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete mission: ${response.status}`);
      }
      
      // Refresh missions list
      await loadMissions();
      
      // Clear selection if deleted mission was selected
      if (selectedMission?.id === missionId) {
        setSelectedMission(null);
      }
    } catch (err) {
      logger.error('Error deleting mission:', err);
      setError(err.message);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="mission-select-container">
      <div className="mission-select-header">
        <button className="back-button" onClick={onNavigateHome}>
          ← Back to Home
        </button>
        <h1>Select Mission</h1>
      </div>

      <div className="mission-select-content">
        {loading && (
          <div className="loading-message">
            <div className="spinner"></div>
            <p>Loading missions...</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            <p>Error: {error}</p>
            <button onClick={loadMissions}>Retry</button>
          </div>
        )}

        {!loading && !error && missions.length === 0 && (
          <div className="no-missions-message">
            <p>No saved missions found.</p>
            <p>Create a mission in Mission Planning first.</p>
            <button onClick={() => onNavigateHome()}>Go to Mission Planning</button>
          </div>
        )}

        {!loading && !error && missions.length > 0 && (
          <>
            <div className="missions-list">
              {missions.map((mission) => (
                <div
                  key={mission.id}
                  className={`mission-card ${selectedMission?.id === mission.id ? 'selected' : ''}`}
                  onClick={() => handleMissionClick(mission)}
                >
                  <div className="mission-card-header">
                    <h3>{mission.name}</h3>
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDeleteMission(mission.id, e)}
                      title="Delete mission"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  <div className="mission-card-info">
                    <div className="mission-stat">
                      <span className="stat-label">Created:</span>
                      <span className="stat-value">{formatDate(mission.timestamp)}</span>
                    </div>
                    <div className="mission-stat">
                      <span className="stat-label">Origins:</span>
                      <span className="stat-value">{mission.stats?.origins || 0}</span>
                    </div>
                    <div className="mission-stat">
                      <span className="stat-label">Targets:</span>
                      <span className="stat-value">{mission.stats?.targets || 0}</span>
                    </div>
                    <div className="mission-stat">
                      <span className="stat-label">Jammers:</span>
                      <span className="stat-value">{mission.stats?.jammers || 0}</span>
                    </div>
                    <div className="mission-stat">
                      <span className="stat-label">Trajectories:</span>
                      <span className="stat-value">{mission.stats?.trajectories || 0}</span>
                    </div>
                  </div>

                  {mission.description && (
                    <div className="mission-description">
                      {mission.description}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mission-select-actions">
              <button
                className="start-mission-btn"
                onClick={handleStartMission}
                disabled={!selectedMission}
              >
                {selectedMission ? `Start ${selectedMission.name}` : 'Select a Mission'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MissionSelect;
