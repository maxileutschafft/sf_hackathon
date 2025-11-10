import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './TerrainMap.css';

// Access token from environment variable
// Get your free token from https://account.mapbox.com/
// Add it to frontend/.env file: REACT_APP_MAPBOX_TOKEN=your_token_here
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

function TerrainMap({ uavState }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const uavMarker = useRef(null);
  const lineLayer = useRef(null);
  // Grand Canyon coordinates (base position)
  const [lng] = useState(-112.1);
  const [lat] = useState(36.1);
  const [zoom] = useState(11);
  // UAV position offsets (in meters)
  const [uavOffset, setUavOffset] = useState({ x: 0, y: 0, z: 100 });
  // Terrain style toggle
  const [showSatellite, setShowSatellite] = useState(true);

  useEffect(() => {
    if (map.current) return; // Initialize map only once

    console.log('Mapbox token:', mapboxgl.accessToken);
    console.log('Token from env:', process.env.REACT_APP_MAPBOX_TOKEN);
    console.log('Initializing map at Grand Canyon:', lng, lat);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: showSatellite ? 'mapbox://styles/mapbox/satellite-v9' : 'mapbox://styles/mapbox/outdoors-v12',
      center: [lng, lat],
      zoom: zoom,
      pitch: 70, // Tilted for 3D effect
      bearing: 0,
      antialias: true,
      attributionControl: false // Remove Mapbox logo and attribution
    });

    map.current.on('load', () => {
      console.log('Map loaded successfully!');

      // Add real 3D terrain
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });

      map.current.setTerrain({
        source: 'mapbox-dem',
        exaggeration: 1.5
      });

      console.log('3D terrain added');

      // Add vertical line source (from UAV to ground)
      map.current.addSource('uav-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[lng, lat], [lng, lat]]
          }
        }
      });

      // Add vertical line layer
      map.current.addLayer({
        id: 'uav-line-layer',
        type: 'line',
        source: 'uav-line',
        paint: {
          'line-color': '#00bfff',
          'line-width': 2,
          'line-opacity': 0.6
        }
      });

      lineLayer.current = 'uav-line-layer';

      // Create custom UAV marker (simple dot)
      const el = document.createElement('div');
      el.className = 'uav-marker';
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#00bfff';
      el.style.border = '2px solid #fff';

      uavMarker.current = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(map.current);

      console.log('UAV marker added at:', lng, lat);
    });

    map.current.on('error', (e) => {
      console.error('Mapbox error:', e);
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, [lng, lat, zoom, showSatellite]);

  // Keyboard controls for UAV movement
  useEffect(() => {
    const handleKeyDown = (e) => {
      const step = 10; // meters per keypress
      const altitudeStep = 5; // altitude change per keypress

      switch(e.key) {
        case 'w':
        case 'ArrowUp':
          setUavOffset(prev => ({ ...prev, x: prev.x + step }));
          e.preventDefault();
          break;
        case 's':
        case 'ArrowDown':
          setUavOffset(prev => ({ ...prev, x: prev.x - step }));
          e.preventDefault();
          break;
        case 'a':
        case 'ArrowLeft':
          setUavOffset(prev => ({ ...prev, y: prev.y - step }));
          e.preventDefault();
          break;
        case 'd':
        case 'ArrowRight':
          setUavOffset(prev => ({ ...prev, y: prev.y + step }));
          e.preventDefault();
          break;
        case 'q':
          setUavOffset(prev => ({ ...prev, z: Math.max(0, prev.z - altitudeStep) }));
          e.preventDefault();
          break;
        case 'e':
          setUavOffset(prev => ({ ...prev, z: prev.z + altitudeStep }));
          e.preventDefault();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update UAV position on the map (using manual controls + simulator state)
  useEffect(() => {
    if (!uavMarker.current || !map.current) return;

    // Convert UAV position (meters) to approximate lng/lat offset
    const metersToLng = 0.00001; // Rough conversion
    const metersToLat = 0.00001;

    // Combine manual offset with simulator position
    const totalX = uavState.position.x + uavOffset.x;
    const totalY = uavState.position.y + uavOffset.y;
    const totalZ = uavState.position.z + uavOffset.z;

    const newLng = lng + (totalY * metersToLng);
    const newLat = lat + (totalX * metersToLat);

    // Update marker position
    uavMarker.current.setLngLat([newLng, newLat]);

    // Update vertical line from UAV to ground
    if (map.current.getSource('uav-line')) {
      map.current.getSource('uav-line').setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [newLng, newLat, totalZ],  // UAV position at altitude
            [newLng, newLat, 0]         // Ground position
          ]
        }
      });
    }
  }, [uavState.position, uavOffset, lng, lat]);

  // Handle terrain style toggle
  const toggleStyle = () => {
    if (!map.current) return;

    const newStyle = !showSatellite;
    setShowSatellite(newStyle);

    const styleUrl = newStyle
      ? 'mapbox://styles/mapbox/satellite-v9'
      : 'mapbox://styles/mapbox/outdoors-v12';

    map.current.setStyle(styleUrl);

    // Re-add terrain and layers after style change
    map.current.once('style.load', () => {
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });

      map.current.setTerrain({
        source: 'mapbox-dem',
        exaggeration: 1.5
      });

      // Re-add vertical line
      map.current.addSource('uav-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[lng, lat], [lng, lat]]
          }
        }
      });

      map.current.addLayer({
        id: 'uav-line-layer',
        type: 'line',
        source: 'uav-line',
        paint: {
          'line-color': '#00bfff',
          'line-width': 2,
          'line-opacity': 0.6
        }
      });
    });
  };

  return (
    <div className="terrain-map-container">
      <div ref={mapContainer} className="map-container" style={{ width: '100%', height: '500px' }} />
      <div className="map-overlay">
        <div className="map-info">
          <h3>3D Terrain View</h3>
          <div className="map-stats">
            <div>Altitude: {(uavState.position.z + uavOffset.z).toFixed(1)}m</div>
            <div>Status: <span className={`status-${uavState.status}`}>{uavState.status}</span></div>
            <div>Offset: X:{uavOffset.x}m Y:{uavOffset.y}m Z:{uavOffset.z}m</div>
          </div>
          <button onClick={toggleStyle} className="style-toggle">
            {showSatellite ? 'Switch to Topology' : 'Switch to Satellite'}
          </button>
          <div className="controls-info">
            <small>Controls: WASD/Arrows = Move | Q/E = Altitude</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TerrainMap;
