// Coordinate conversion utilities
// Base position: Half Moon Bay Airport
export const BASE_COORDS = {
  lng: -122.4961,
  lat: 37.5139
};

// Conversion constants
export const METERS_TO_LNG = 0.0001;
export const METERS_TO_LAT = 0.0001;

/**
 * Convert simulator XY coordinates to map lng/lat
 */
export function simulatorToMapCoords(x, y) {
  return {
    lng: BASE_COORDS.lng + (y * METERS_TO_LNG),
    lat: BASE_COORDS.lat + (x * METERS_TO_LAT)
  };
}

/**
 * Convert map lng/lat to simulator XY coordinates
 */
export function mapToSimulatorCoords(lng, lat) {
  return {
    x: (lat - BASE_COORDS.lat) / METERS_TO_LAT,
    y: (lng - BASE_COORDS.lng) / METERS_TO_LNG
  };
}

/**
 * Calculate hexagonal formation positions around a center point
 */
export function getHexagonalFormation(centerX, centerY, centerZ, radius = 30) {
  const positions = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * (Math.PI / 180);
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      z: centerZ
    });
  }
  return positions;
}

/**
 * Calculate distance between two 3D points
 */
export function distance3D(p1, p2) {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );
}
