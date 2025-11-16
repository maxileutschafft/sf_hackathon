import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './TerrainMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

const METERS_TO_LNG = 0.0001;
const METERS_TO_LAT = 0.0001;

function TerrainMap({ uavs, selectedUavId, selectedSwarm, onSelectUav, onMapClick, onRefreshData, rois, targets, origins = [], jammers = [], onToggleStyleReady, onToggle2DViewReady, assemblyMode, isSelectingTarget, isSelectingOrigin, isSelectingJammer, onJammerCreated }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  // Base position: lat 37.5139, lng -122.4961
  const [lng] = useState(-122.4961);
  const [lat] = useState(37.5139);
  const [zoom] = useState(13);
  // Terrain style toggle
  const [showSatellite, setShowSatellite] = useState(true);
  const [is2DView, setIs2DView] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [cursorCoords, setCursorCoords] = useState(null);
  const [cursorPixelPos, setCursorPixelPos] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Jammer creation - no longer needed for click-based approach

  const convertPointToLngLat = (point) => {
    if (point && typeof point.lng === 'number' && typeof point.lat === 'number') {
      return [point.lng, point.lat];
    }
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      return [
        lng + (point.y * METERS_TO_LNG),
        lat + (point.x * METERS_TO_LAT)
      ];
    }
    return [lng, lat];
  };

  // Helper function to create a circle polygon from center point and radius in meters
  const createCirclePolygon = (centerLng, centerLat, radiusInMeters, points = 64) => {
    const coords = [];
    const distanceX = radiusInMeters * METERS_TO_LNG;
    const distanceY = radiusInMeters * METERS_TO_LAT;

    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      coords.push([centerLng + x, centerLat + y]);
    }

    return coords;
  };

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    console.log('Initializing map at Half Moon Bay Airport:', lng, lat);

    const handleStyleLoad = () => {
      if (!map.current) return;

      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }

      map.current.setTerrain({
        source: 'mapbox-dem',
        exaggeration: 1.5
      });

      setStyleVersion(prev => prev + 1);
    };

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

    map.current.on('style.load', handleStyleLoad);

    map.current.on('load', () => {
      console.log('Map loaded successfully!');

      // Add 1km boundary box
      const boundarySize = 500; // 500m from center = 1km box
      const boundaryCoords = [
        [lng - boundarySize * 0.0001, lat - boundarySize * 0.0001],
        [lng + boundarySize * 0.0001, lat - boundarySize * 0.0001],
        [lng + boundarySize * 0.0001, lat + boundarySize * 0.0001],
        [lng - boundarySize * 0.0001, lat + boundarySize * 0.0001],
        [lng - boundarySize * 0.0001, lat - boundarySize * 0.0001]
      ];

      map.current.addSource('boundary', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: boundaryCoords.map(c => [...c, 0])
          }
        }
      });

      map.current.addLayer({
        id: 'boundary-wall',
        type: 'line',
        source: 'boundary',
        paint: {
          'line-color': '#ff0000',
          'line-width': 4,
          'line-opacity': 0.8
        }
      });

      // Add vertical walls
      for (let i = 0; i < boundaryCoords.length - 1; i++) {
        map.current.addSource(`boundary-wall-${i}`, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [...boundaryCoords[i], 0],
                [...boundaryCoords[i + 1], 0],
                [...boundaryCoords[i + 1], 100],
                [...boundaryCoords[i], 100],
                [...boundaryCoords[i], 0]
              ]]
            }
          }
        });

        map.current.addLayer({
          id: `boundary-wall-${i}`,
          type: 'fill-extrusion',
          source: `boundary-wall-${i}`,
          paint: {
            'fill-extrusion-color': '#ff0000',
            'fill-extrusion-opacity': 0.3,
            'fill-extrusion-height': 100
          }
        });
      }

      console.log('3D terrain and boundary added');
    });

    // Add map click handler
    map.current.on('click', (e) => {
      // Debug: log click events to help trace selection issues
      console.log('Map clicked at pixel:', e.point, 'lngLat:', e.lngLat);
      
      // Force refresh all markers on every click by reloading data from backend
      if (onRefreshData) {
        console.log('Refreshing mission data from backend...');
        onRefreshData();
      }
      setRefreshCounter(prev => prev + 1);

      // Check if click is on a UAV layer
      const uavLayerList = Object.keys(uavs).map(id => `uav-point-${id}`);
      console.log('Querying layers for click:', uavLayerList);
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: uavLayerList
      });
      console.log('Features under click:', features.length);

      if (features.length === 0 && onMapClick) {
        console.log('Calling onMapClick callback with', e.lngLat.lng, e.lngLat.lat);
        onMapClick(e.lngLat.lng, e.lngLat.lat);
      }
    });

    // Add mousemove handler for cursor coordinates
    map.current.on('mousemove', (e) => {
      setCursorCoords({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat
      });
      setCursorPixelPos({
        x: e.point.x,
        y: e.point.y
      });
    });

    map.current.on('error', (e) => {
      console.error('Mapbox error:', e);
    });

    return () => {
      if (map.current) {
        map.current.off('style.load', handleStyleLoad);
        map.current.remove();
      }
    };
  }, [lng, lat, zoom]);

  // Update UAV visualization (lines + points)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Conversion: 1 degree ≈ 111km at equator
    // So 1m ≈ 0.000009 degrees, but we'll use 0.0001 for more visible movement
    const metersToLng = 0.0001;
    const metersToLat = 0.0001;

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

        // Add click handler only once per layer
        const clickHandler = () => onSelectUav(uavId);
        map.current.on('click', pointSourceId, clickHandler);
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
  }, [uavs, selectedUavId, lng, lat, onSelectUav, styleVersion]);

  // ROI circles visualization
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const metersToLng = 0.0001;
    const metersToLat = 0.0001;

    rois.forEach((roi, index) => {
      const roiLng = lng + (roi.y * metersToLng);
      const roiLat = lat + (roi.x * metersToLat);
      const radiusInDegrees = (roi.radius || 50) * metersToLng;

      const sourceId = `roi-${index}`;
      const layerId = `roi-circle-${index}`;

      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [roiLng, roiLat]
            }
          }
        });

        map.current.addLayer({
          id: layerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': radiusInDegrees * 111000 / Math.cos(roiLat * Math.PI / 180),
            'circle-color': '#ffff00',
            'circle-opacity': 0.3,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffff00',
            'circle-stroke-opacity': 0.8
          }
        });
      } else {
        map.current.getSource(sourceId).setData({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [roiLng, roiLat]
          }
        });
      }
    });
  }, [rois, lng, lat, styleVersion]);

  // UNIFIED MARKER VISUALIZATION - Re-render ALL markers on every update
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    console.log('=== UNIFIED MARKER EFFECT ===');
    console.log('Targets:', targets?.length || 0, targets);
    console.log('Origins:', origins?.length || 0, origins);
    console.log('Jammers:', jammers?.length || 0, jammers);

    // STEP 1: Remove ALL existing marker layers and sources
    const style = map.current.getStyle();
    if (style?.layers) {
      const layersToRemove = [];
      const sourcesToRemove = [];

      style.layers.forEach(layer => {
        if (layer.id.startsWith('target-') || 
            layer.id.startsWith('origin-') || 
            layer.id.startsWith('jammer-')) {
          layersToRemove.push(layer.id);
        }
      });

      // Remove layers first
      layersToRemove.forEach(layerId => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });

      // Then remove sources
      Object.keys(style.sources).forEach(sourceId => {
        if (sourceId.startsWith('target-') || 
            sourceId.startsWith('origin-') || 
            sourceId.startsWith('jammer-')) {
          sourcesToRemove.push(sourceId);
        }
      });

      sourcesToRemove.forEach(sourceId => {
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });

      console.log('Removed', layersToRemove.length, 'layers and', sourcesToRemove.length, 'sources');
    }

    // STEP 2: Add ALL target markers (RED)
    if (targets && targets.length > 0) {
      targets.forEach((target, index) => {
        const markerId = target.id || `target-${index}`;
        const [targetLng, targetLat] = convertPointToLngLat(target);
        const altitude = typeof target.z === 'number' ? target.z : 0;

        const lineSourceId = `target-line-${markerId}`;
        const pointSourceId = `target-point-${markerId}`;

        // Add line
        map.current.addSource(lineSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [targetLng, targetLat, 0],
                [targetLng, targetLat, altitude]
              ]
            }
          }
        });

        map.current.addLayer({
          id: lineSourceId,
          type: 'line',
          source: lineSourceId,
          paint: {
            'line-color': '#ff0000',
            'line-width': 2,
            'line-opacity': 0.7
          }
        });

        // Add point
        map.current.addSource(pointSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [targetLng, targetLat, altitude]
            }
          }
        });

        map.current.addLayer({
          id: pointSourceId,
          type: 'circle',
          source: pointSourceId,
          paint: {
            'circle-radius': 8,
            'circle-color': '#ff0000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
          }
        });

        console.log('Added target:', markerId, 'at', targetLng, targetLat);
      });
    }

    // STEP 3: Add ALL origin markers (GREEN)
    if (origins && origins.length > 0) {
      origins.forEach((origin, index) => {
        const markerId = origin.id || `origin-${index}`;
        const [originLng, originLat] = convertPointToLngLat(origin);
        const altitude = typeof origin.z === 'number' ? origin.z : 0;

        const lineSourceId = `origin-line-${markerId}`;
        const pointSourceId = `origin-point-${markerId}`;

        // Add line
        map.current.addSource(lineSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [originLng, originLat, 0],
                [originLng, originLat, altitude]
              ]
            }
          }
        });

        map.current.addLayer({
          id: lineSourceId,
          type: 'line',
          source: lineSourceId,
          paint: {
            'line-color': '#00ff00',
            'line-width': 2,
            'line-opacity': 0.7
          }
        });

        // Add point
        map.current.addSource(pointSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [originLng, originLat, altitude]
            }
          }
        });

        map.current.addLayer({
          id: pointSourceId,
          type: 'circle',
          source: pointSourceId,
          paint: {
            'circle-radius': 8,
            'circle-color': '#00ff00',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
          }
        });

        console.log('Added origin:', markerId, 'at', originLng, originLat);
      });
    }

    // STEP 4: Add ALL jammer zones (ORANGE CIRCLES)
    if (jammers && jammers.length > 0) {
      jammers.forEach((jammer, index) => {
        const markerId = jammer.id || `jammer-${index}`;
        const [jammerLng, jammerLat] = convertPointToLngLat(jammer);
        const radiusInMeters = jammer.radius || 50;

        const sourceId = `jammer-${markerId}`;
        const layerId = `jammer-circle-${markerId}`;
        const outlineLayerId = `jammer-outline-${markerId}`;

        // Create polygon circle
        const circleCoords = createCirclePolygon(jammerLng, jammerLat, radiusInMeters);

        map.current.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [circleCoords]
            }
          }
        });

        map.current.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#ff8c00',
            'fill-opacity': 0.3
          }
        });

        map.current.addLayer({
          id: outlineLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#ff8c00',
            'line-width': 2,
            'line-opacity': 0.8
          }
        });

        console.log('Added jammer:', markerId, 'at', jammerLng, jammerLat, 'radius:', radiusInMeters);
      });
    }

    console.log('=== MARKER RENDERING COMPLETE ===');
  }, [targets, origins, jammers, lng, lat, styleVersion, refreshCounter]);

  // Formation lines and swarm label
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const metersToLng = 0.0001;
    const metersToLat = 0.0001;

    // Group UAVs by swarm
    const swarmGroups = Object.entries(uavs).reduce((groups, [uavId, uav]) => {
      const swarmName = uav.swarm || 'UNASSIGNED';
      if (!groups[swarmName]) groups[swarmName] = [];
      groups[swarmName].push({ id: uavId, ...uav });
      return groups;
    }, {});

    // Check if swarm is in hexagonal formation and draw lines
    Object.entries(swarmGroups).forEach(([swarmName, hornets]) => {
      if (hornets.length < 2) return;

      // Check if hornets are in hex formation (within 35m of each other)
      const positions = hornets.map(h => ({ x: h.position.x, y: h.position.y }));
      let inFormation = false;

      if (hornets.length === 6) {
        // Check if all are within 35m radius from center
        const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;

        const distances = positions.map(p =>
          Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2))
        );

        inFormation = distances.every(d => d < 35);
      }

      const sourceId = `formation-${swarmName}`;
      const layerId = `formation-lines-${swarmName}`;
      const labelSourceId = `formation-label-${swarmName}`;
      const labelLayerId = `formation-label-layer-${swarmName}`;

      if (inFormation) {
        // Calculate center
        const formationCenterX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        const formationCenterY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
        const formationCenterZ = hornets.reduce((sum, h) => sum + h.position.z, 0) / hornets.length;

        // Sort hornets by angle from center to form hexagon perimeter
        const sortedHornets = hornets.map(h => {
          const angle = Math.atan2(h.position.y - formationCenterY, h.position.x - formationCenterX);
          return { ...h, angle };
        }).sort((a, b) => a.angle - b.angle);

        // Draw lines connecting adjacent drones in hexagon (perimeter only)
        const lines = [];
        for (let i = 0; i < sortedHornets.length; i++) {
          const h1 = sortedHornets[i];
          const h2 = sortedHornets[(i + 1) % sortedHornets.length]; // Connect to next, wrapping around

          const lng1 = lng + (h1.position.y * metersToLng);
          const lat1 = lat + (h1.position.x * metersToLat);
          const lng2 = lng + (h2.position.y * metersToLng);
          const lat2 = lat + (h2.position.x * metersToLat);

          lines.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [lng1, lat1, h1.position.z],
                [lng2, lat2, h2.position.z]
              ]
            }
          });
        }

        if (!map.current.getSource(sourceId)) {
          map.current.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: lines
            }
          });

          // Determine color based on swarm
          const swarmColor = hornets[0]?.color || '#00bfff';

          map.current.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': swarmColor,
              'line-width': 3,
              'line-opacity': 0.8
            }
          });
        } else {
          map.current.getSource(sourceId).setData({
            type: 'FeatureCollection',
            features: lines
          });
        }

        // Add floating swarm label at center
        const centerLng = lng + (formationCenterY * metersToLng);
        const centerLat = lat + (formationCenterX * metersToLat);

        if (!map.current.getSource(labelSourceId)) {
          map.current.addSource(labelSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { name: swarmName },
              geometry: {
                type: 'Point',
                coordinates: [centerLng, centerLat, formationCenterZ + 20]
              }
            }
          });

          map.current.addLayer({
            id: labelLayerId,
            type: 'symbol',
            source: labelSourceId,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 16,
              'text-offset': [0, 0]
            },
            paint: {
              'text-color': '#00bfff',
              'text-halo-color': '#000000',
              'text-halo-width': 2
            }
          });
        } else {
          map.current.getSource(labelSourceId).setData({
            type: 'Feature',
            properties: { name: swarmName },
            geometry: {
              type: 'Point',
              coordinates: [centerLng, centerLat, formationCenterZ + 20]
            }
          });
        }
      } else {
        // Remove formation lines and label if not in formation
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
        if (map.current.getLayer(labelLayerId)) {
          map.current.removeLayer(labelLayerId);
        }
        if (map.current.getSource(labelSourceId)) {
          map.current.removeSource(labelSourceId);
        }
      }
    });
  }, [uavs, lng, lat]);

  // Handle terrain style toggle
  const toggleStyle = () => {
    if (!map.current) return;

    const newStyle = !showSatellite;
    setShowSatellite(newStyle);

    const styleUrl = newStyle
      ? 'mapbox://styles/mapbox/satellite-v9'
      : 'mapbox://styles/mapbox/outdoors-v12';

    map.current.setStyle(styleUrl);
  };

  // Toggle 2D view (top-down bird's eye perspective)
  const toggle2DView = () => {
    if (!map.current) return;

    const new2DView = !is2DView;
    setIs2DView(new2DView);

    if (new2DView) {
      // Switch to 2D top-down view
      map.current.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000
      });
    } else {
      // Switch back to 3D perspective view
      map.current.easeTo({
        pitch: 70,
        bearing: 0,
        duration: 1000
      });
    }
  };

  // Expose toggleStyle function to parent
  useEffect(() => {
    if (onToggleStyleReady) {
      onToggleStyleReady(() => toggleStyle);
    }
  }, [onToggleStyleReady]);

  // Expose toggle2DView function to parent
  useEffect(() => {
    if (onToggle2DViewReady) {
      onToggle2DViewReady(() => toggle2DView);
    }
  }, [onToggle2DViewReady, is2DView]);

  // If parent requests target/origin/jammer selection mode
  useEffect(() => {
    if (!map.current || !mapContainer.current) return;
    const container = mapContainer.current;

    const overlayClickHandler = (ev) => {
      if (!isSelectingTarget && !isSelectingOrigin && !isSelectingJammer) return;
      
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (!map.current) return;
      const lngLat = map.current.unproject([x, y]);
      
      // Handle jammer click (50m fixed radius)
      if (isSelectingJammer && onJammerCreated) {
        const baseCoords = { lng: -122.4961, lat: 37.5139 };
        const x_coord = (lngLat.lat - baseCoords.lat) / METERS_TO_LAT;
        const y_coord = (lngLat.lng - baseCoords.lng) / METERS_TO_LNG;
        
        onJammerCreated({
          lng: lngLat.lng,
          lat: lngLat.lat,
          x: x_coord,
          y: y_coord,
          radius: 50  // Fixed 50m radius
        });
        return;
      }
      
      // Handle target/origin clicks
      if ((isSelectingTarget || isSelectingOrigin) && onMapClick) {
        console.log('Overlay click detected:', lngLat);
        onMapClick(lngLat.lng, lngLat.lat);
      }
    };

    if (isSelectingTarget || isSelectingOrigin || isSelectingJammer) {
      container.style.cursor = 'crosshair';
      container.addEventListener('click', overlayClickHandler);
    } else {
      container.style.cursor = '';
    }

    return () => {
      container.removeEventListener('click', overlayClickHandler);
      if (container) container.style.cursor = '';
    };
  }, [isSelectingTarget, isSelectingOrigin, isSelectingJammer, onMapClick, onJammerCreated]);

  const selectedUav = uavs[selectedUavId];

  return (
    <div className="terrain-map-container">
      <div ref={mapContainer} className="map-container crosshair-cursor" />

      {/* Map overlay with selected UAV info */}
      <div className="map-overlay-top-left">
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

      {/* Cursor coordinates display */}
      {cursorCoords && cursorPixelPos && (
        <div
          className="cursor-coords-overlay"
          style={{
            left: `${cursorPixelPos.x + 15}px`,
            top: `${cursorPixelPos.y - 30}px`
          }}
        >
          <span className="cursor-coords-text">
            {cursorCoords.lat.toFixed(4)}°, {cursorCoords.lng.toFixed(4)}°
          </span>
        </div>
      )}

      {/* Assembly mode indicator */}
      {assemblyMode && (
        <div className="assembly-mode-indicator">
          <div className="assembly-text">
            ASSEMBLY MODE: {assemblyMode}
          </div>
          <div className="assembly-subtext">
            Click on map to set formation center
          </div>
        </div>
      )}
    </div>
  );
}

export default TerrainMap;
