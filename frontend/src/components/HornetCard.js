import React, { memo } from 'react';
import '../App.css';

/**
 * Memoized HORNET card component for left sidebar
 * Only re-renders when its specific props change
 */
const HornetCard = memo(({ 
  uavId, 
  uav, 
  isSelected, 
  onClick 
}) => {
  return (
    <div
      className={`hornet-box ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
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
  );
}, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if these change
  return (
    prevProps.uavId === nextProps.uavId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.uav.position.z === nextProps.uav.position.z &&
    prevProps.uav.status === nextProps.uav.status &&
    prevProps.uav.battery === nextProps.uav.battery &&
    prevProps.uav.color === nextProps.uav.color
  );
});

HornetCard.displayName = 'HornetCard';

export default HornetCard;
