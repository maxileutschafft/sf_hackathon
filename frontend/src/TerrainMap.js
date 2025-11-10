import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './TerrainMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

function TerrainMap({ uavs, selectedUavId, onSelectUav }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
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

  // Update UAV visualization (lines + points)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const metersToLng = 0.00001;
    const metersToLat = 0.00001;

    Object.entries(uavs).forEach(([uavId, uav]) => {
      const newLng = lng + (uav.position.y * metersToLng);
      const newLat = lat + (uav.position.x * metersToLat);
      const altitude = uav.position.z;

      console.log(`Updating ${uavId}:`, { position: uav.position, mapCoords: [newLng, newLat], altitude });

      // Vertical line from ground to UAV
      const lineSourceId = `uav-line-${uavId}`;
      if (!map.current.getSource(lineSourceId)) {
        map.current.addSource(lineSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[newLng, newLat, 0], [newLng, newLat, altitude]]
            }
          }
        });

        map.current.addLayer({
          id: lineSourceId,
          type: 'line',
          source: lineSourceId,
          paint: {
            'line-color': uav.color,
            'line-width': 2,
            'line-opacity': 0.7
          }
        });
      } else {
        map.current.getSource(lineSourceId).setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[newLng, newLat, 0], [newLng, newLat, altitude]]
          }
        });
      }

      // UAV point at altitude
      const pointSourceId = `uav-point-${uavId}`;
      if (!map.current.getSource(pointSourceId)) {
        map.current.addSource(pointSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [newLng, newLat, altitude]
            }
          }
        });

        map.current.addLayer({
          id: pointSourceId,
          type: 'circle',
          source: pointSourceId,
          paint: {
            'circle-radius': selectedUavId === uavId ? 10 : 8,
            'circle-color': uav.color,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
          }
        });

        // Click to select
        map.current.on('click', pointSourceId, () => {
          onSelectUav(uavId);
        });

        map.current.on('mouseenter', pointSourceId, () => {
          map.current.getCanvas().style.cursor = 'pointer';
        });

        map.current.on('mouseleave', pointSourceId, () => {
          map.current.getCanvas().style.cursor = '';
        });
      } else {
        map.current.getSource(pointSourceId).setData({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [newLng, newLat, altitude]
          }
        });

        // Update circle size based on selection
        map.current.setPaintProperty(pointSourceId, 'circle-radius', selectedUavId === uavId ? 10 : 8);
      }
    });

    // Clean up removed UAVs
    const currentUavIds = Object.keys(uavs);
    if (map.current.getStyle()) {
      map.current.getStyle().layers.forEach(layer => {
        if (layer.id.startsWith('uav-line-') || layer.id.startsWith('uav-point-')) {
          const uavId = layer.id.replace('uav-line-', '').replace('uav-point-', '');
          if (!currentUavIds.includes(uavId)) {
            if (map.current.getLayer(layer.id)) {
              map.current.removeLayer(layer.id);
            }
            if (map.current.getSource(layer.id)) {
              map.current.removeSource(layer.id);
            }
          }
        }
      });
    }
  }, [uavs, selectedUavId, lng, lat, onSelectUav]);

  // Handle terrain style toggle
  const toggleStyle = () => {
    if (!map.current) return;

    const newStyle = !showSatellite;
    setShowSatellite(newStyle);

    const styleUrl = newStyle
      ? 'mapbox://styles/mapbox/satellite-v9'
      : {
          version: 8,
          sources: {
            'mapbox-dem': {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: {
                'background-color': '#0a0e1a'
              }
            },
            {
              id: 'hillshade',
              type: 'hillshade',
              source: 'mapbox-dem',
              paint: {
                'hillshade-exaggeration': 1.5,
                'hillshade-shadow-color': '#050810',
                'hillshade-highlight-color': '#00bfff',
                'hillshade-accent-color': '#0af',
                'hillshade-illumination-direction': 315,
                'hillshade-illumination-anchor': 'viewport'
              }
            }
          ]
        };

    map.current.setStyle(styleUrl);

    // Re-add terrain and UAV layers after style change
    map.current.once('style.load', () => {
      // Add DEM source if needed (satellite view)
      if (newStyle && !map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }

      // Set terrain
      map.current.setTerrain({
        source: 'mapbox-dem',
        exaggeration: 1.5
      });

      // Re-add all UAV layers
      const metersToLng = 0.00001;
      const metersToLat = 0.00001;

      Object.entries(uavs).forEach(([uavId, uav]) => {
        const newLng = lng + (uav.position.y * metersToLng);
        const newLat = lat + (uav.position.x * metersToLat);
        const altitude = uav.position.z;

        // Re-add vertical line
        const lineSourceId = `uav-line-${uavId}`;
        if (!map.current.getSource(lineSourceId)) {
          map.current.addSource(lineSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [[newLng, newLat, 0], [newLng, newLat, altitude]]
              }
            }
          });

          map.current.addLayer({
            id: lineSourceId,
            type: 'line',
            source: lineSourceId,
            paint: {
              'line-color': uav.color,
              'line-width': 2,
              'line-opacity': 0.7
            }
          });
        }

        // Re-add UAV point
        const pointSourceId = `uav-point-${uavId}`;
        if (!map.current.getSource(pointSourceId)) {
          map.current.addSource(pointSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [newLng, newLat, altitude]
              }
            }
          });

          map.current.addLayer({
            id: pointSourceId,
            type: 'circle',
            source: pointSourceId,
            paint: {
              'circle-radius': selectedUavId === uavId ? 10 : 8,
              'circle-color': uav.color,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 1
            }
          });

          // Re-attach click handlers
          map.current.on('click', pointSourceId, () => {
            onSelectUav(uavId);
          });

          map.current.on('mouseenter', pointSourceId, () => {
            map.current.getCanvas().style.cursor = 'pointer';
          });

          map.current.on('mouseleave', pointSourceId, () => {
            map.current.getCanvas().style.cursor = '';
          });
        }
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
