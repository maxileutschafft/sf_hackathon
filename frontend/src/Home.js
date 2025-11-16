import React from 'react';
import './Home.css';

function Home({ onNavigate }) {
  return (
    <div className="home-container">
      <div className="home-content">
        <div className="home-header">
          <h1 className="home-title">HIVE</h1>
          <div className="home-subtitle">High-altitude Intelligence & Vigilance Ecosystem</div>
        </div>

        <div className="home-buttons">
          <button 
            className="home-btn mission-planning-btn"
            onClick={() => onNavigate('planning')}
          >
            <div className="btn-icon">📋</div>
            <div className="btn-label">MISSION PLANNING</div>
            <div className="btn-description">Plan and design mission routes</div>
          </button>

          <button 
            className="home-btn mission-control-btn"
            onClick={() => onNavigate('select')}
          >
            <div className="btn-icon">🎮</div>
            <div className="btn-label">MISSION CONTROL</div>
            <div className="btn-description">Select and execute missions</div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;
