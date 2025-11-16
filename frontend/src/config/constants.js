// Application-wide constants

// Map configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER_LNG: -122.4961,
  DEFAULT_CENTER_LAT: 37.5139,
  DEFAULT_ZOOM: 13,
  BOUNDARY_SIZE_METERS: 500,
  MAPBOX_DEFAULT_TOKEN: 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA'
};

// Physics constants
export const PHYSICS = {
  FORMATION_RADIUS: 30, // meters
  DEFAULT_FLIGHT_ALTITUDE: 150, // meters
  HOVER_ALTITUDE: 100, // meters
  RECON_ALTITUDE: 500, // meters
  TAKEOFF_ALTITUDE: 20 // meters
};

// UI constants
export const UI = {
  CURSOR_UPDATE_THROTTLE: 16, // ms (60 FPS)
  CLICK_MARKER_DURATION: 5000, // ms
  COMMAND_STAGGER_DELAY: 100, // ms between commands to multiple drones
  TELEMETRY_UPDATE_RATE: 50 // ms (20 Hz)
};

// Map visualization
export const MAP_VIS = {
  PYRAMID_BASE_SIZE: 0.00016,
  PYRAMID_HEIGHT: 30, // meters
  CYLINDER_RADIUS: 0.00001, // ~1m radius = 2m diameter
  CYLINDER_SEGMENTS: 16,
  ZOOM_SCALE_MIN: 0.5,
  ZOOM_SCALE_MAX: 2.5,
  ZOOM_REFERENCE: 16
};

// Colors
export const COLORS = {
  BOUNDARY: '#ff0000',
  ROI: '#ffff00',
  TARGET: '#ff0000',
  CLICK_MARKER: '#00ff00',
  SWARM1_BASE: '#00bfff',
  SWARM2_BASE: '#ff0000'
};

// Logging
export const LOGGING = {
  MAX_LOG_ENTRIES: 50,
  DEBUG_MODE: process.env.NODE_ENV !== 'production' && process.env.REACT_APP_DEBUG !== 'false'
};
