import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './TerrainMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

function TerrainMap({ uavs, selectedUavId, onSelectUav }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const uavMarkers = useRef({});
  // Grand Canyon coordinates (base position)
  const [lng] = useState(-112.1);
  const [lat] = useState(36.1);
  const [zoom] = useState(11);
  // Terrain style toggle
  const [showSatellite, setShowSatellite] = useState(true);

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    console.log('Initializing map at Grand Canyon:', lng, lat);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [lng, lat],
      zoom: zoom,
      pitch: 70,
      bearing: 0,
      antialias: true,
      attributionControl: false
    });

    map.current.on('load', () => {
      console.log('Map loaded successfully!');

      // Add 3D terrain
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
    });

    map.current.on('error', (e) => {
      console.error('Mapbox error:', e);
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, [lng, lat, zoom]);

  // Update UAV markers
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const metersToLng = 0.00001;
    const metersToLat = 0.00001;

    Object.entries(uavs).forEach(([uavId, uav]) => {
      const newLng = lng + (uav.position.y * metersToLng);
      const newLat = lat + (uav.position.x * metersToLat);
      const altitude = uav.position.z;

      // Create or update marker
      if (!uavMarkers.current[uavId]) {
        // Create marker element
        const el = document.createElement('div');
        el.className = 'uav-marker';
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = uav.color;
        el.style.border = '2px solid #fff';
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s';

        // Add click handler
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectUav(uavId);
        });

        // Create marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([newLng, newLat])
          .addTo(map.current);

        uavMarkers.current[uavId] = { marker, element: el };

        // Add vertical line source
        const lineSourceId = `uav-line-${uavId}`;
        map.current.addSource(lineSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[newLng, newLat, altitude], [newLng, newLat, 0]]
            }
          }
        });

        // Add vertical line layer
        map.current.addLayer({
          id: `uav-line-layer-${uavId}`,
          type: 'line',
          source: lineSourceId,
          paint: {
            'line-color': uav.color,
            'line-width': 2,
            'line-opacity': 0.6
          }
        });
      } else {
        // Update existing marker
        uavMarkers.current[uavId].marker.setLngLat([newLng, newLat]);

        // Update vertical line
        const lineSourceId = `uav-line-${uavId}`;
        const source = map.current.getSource(lineSourceId);
        if (source) {
          source.setData({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[newLng, newLat, altitude], [newLng, newLat, 0]]
            }
          });
        }
      }

      // Update marker appearance based on selection
      const markerEl = uavMarkers.current[uavId].element;
      if (uavId === selectedUavId) {
        markerEl.style.width = '20px';
        markerEl.style.height = '20px';
        markerEl.style.boxShadow = `0 0 15px ${uav.color}`;
        markerEl.style.zIndex = '1000';
      } else {
        markerEl.style.width = '16px';
        markerEl.style.height = '16px';
        markerEl.style.boxShadow = `0 0 4px ${uav.color}`;
        markerEl.style.zIndex = '1';
      }
    });

    // Remove markers for UAVs that no longer exist
    Object.keys(uavMarkers.current).forEach(uavId => {
      if (!uavs[uavId]) {
        uavMarkers.current[uavId].marker.remove();
        const lineSourceId = `uav-line-${uavId}`;
        if (map.current.getLayer(`uav-line-layer-${uavId}`)) {
          map.current.removeLayer(`uav-line-layer-${uavId}`);
        }
        if (map.current.getSource(lineSourceId)) {
          map.current.removeSource(lineSourceId);
        }
        delete uavMarkers.current[uavId];
      }
    });
  }, [uavs, selectedUavId, lng, lat, onSelectUav]);

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

      // Re-add all UAV lines
      Object.entries(uavs).forEach(([uavId, uav]) => {
        const metersToLng = 0.00001;
        const metersToLat = 0.00001;
        const newLng = lng + (uav.position.y * metersToLng);
        const newLat = lat + (uav.position.x * metersToLat);
        const altitude = uav.position.z;

        const lineSourceId = `uav-line-${uavId}`;
        map.current.addSource(lineSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[newLng, newLat, altitude], [newLng, newLat, 0]]
            }
          }
        });

        map.current.addLayer({
          id: `uav-line-layer-${uavId}`,
          type: 'line',
          source: lineSourceId,
          paint: {
            'line-color': uav.color,
            'line-width': 2,
            'line-opacity': 0.6
          }
        });
      });
    });
  };

  const selectedUav = uavs[selectedUavId];

  return (
    <div className="terrain-map-container">
      <div ref={mapContainer} className="map-container" />

      {/* Map overlay with selected UAV info and style toggle */}
      <div className="map-overlay-top-left">
        <div className="style-toggle-container">
          <button onClick={toggleStyle} className="style-toggle">
            {showSatellite ? 'Topology' : 'Satellite'}
          </button>
        </div>
        {selectedUav && (
          <div className="selected-uav-info">
            <div className="uav-name" style={{ color: selectedUav.color }}>
              {selectedUav.id}
            </div>
            <div className="uav-stat">Alt: {selectedUav.position.z.toFixed(1)}m</div>
            <div className="uav-stat">
              Status: <span className={`status-${selectedUav.status}`}>{selectedUav.status}</span>
            </div>
            <div className="uav-stat">Battery: {selectedUav.battery}%</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TerrainMap;
