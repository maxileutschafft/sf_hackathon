import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './TerrainMap.css';
import { simulatorToMapCoords, METERS_TO_LNG, METERS_TO_LAT } from './utils/coordinateUtils';
import { logger } from './utils/logger';
import { throttle } from './utils/debounce';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

function TerrainMap({ uavs, selectedUavId, selectedSwarm, onSelectUav, onMapClick, onRefreshData, rois, targets, origins = [], jammers = [], trajectories = [], onToggleStyleReady, onToggle2DViewReady, assemblyMode, initialViewMode = '3d', isSelectingTarget, isSelectingOrigin, isSelectingJammer, onJammerCreated }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const pyramidHandlers = useRef(new Map()); // Track attached handlers
  const onMapClickRef = useRef(onMapClick); // Store latest callback
  // Base position: lat 37.5139, lng -122.4961
  const [lng] = useState(-122.4961);
  const [lat] = useState(37.5139);
  const [zoom] = useState(13);
  // Terrain style toggle
  const [showSatellite, setShowSatellite] = useState(true);
  const [is2DView, setIs2DView] = useState(initialViewMode === '2d');
  const [clickTarget, setClickTarget] = useState(null);
  const [cursorCoords, setCursorCoords] = useState(null);
  const [cursorPixelPos, setCursorPixelPos] = useState(null);

  // Keep the ref updated with latest callback
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    logger.info('Initializing map at Half Moon Bay Airport:', lng, lat);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [lng, lat],
      zoom: zoom,
      pitch: initialViewMode === '2d' ? 0 : 70,
      bearing: 0,
      antialias: true,
      attributionControl: false
    });

    map.current.on('load', () => {
      logger.info('Map loaded successfully');

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

        // Add thin vertical red line along this edge
        map.current.addSource(`boundary-line-${i}`, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [...boundaryCoords[i], 0],
                [...boundaryCoords[i], 100]
              ]
            }
          }
        });

        map.current.addLayer({
          id: `boundary-line-${i}`,
          type: 'line',
          source: `boundary-line-${i}`,
          paint: {
            'line-color': '#ff0000',
            'line-width': 2,
            'line-opacity': 0.4
          }
        });
      }

      logger.debug('3D terrain and boundary added');
    });

    // Add map click handler
    map.current.on('click', (e) => {
      // Check if click is on a UAV pyramid layer
      const pyramidLayers = Object.keys(uavs).map(id => `uav-pyramid-${id}`).filter(layerId => {
        return map.current.getLayer(layerId);
      });

      const features = map.current.queryRenderedFeatures(e.point, {
        layers: pyramidLayers
      });

      if (features.length === 0 && onMapClickRef.current) {
        logger.debug('Map clicked at:', e.lngLat.lng, e.lngLat.lat);
        onMapClickRef.current(e.lngLat.lng, e.lngLat.lat);
        setClickTarget({ lng: e.lngLat.lng, lat: e.lngLat.lat, timestamp: Date.now() });
      }
    });

    // Add mousemove handler for cursor coordinates (throttled)
    const handleMouseMove = throttle((e) => {
      setCursorCoords({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat
      });
      setCursorPixelPos({
        x: e.point.x,
        y: e.point.y
      });
    }, 16); // Update at most every 16ms (60 FPS)
    
    map.current.on('mousemove', handleMouseMove);

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

    Object.entries(uavs).forEach(([uavId, uav]) => {
      const { lng: newLng, lat: newLat } = simulatorToMapCoords(uav.position.x, uav.position.y);
      const altitude = uav.position.z;

      // Vertical cylinder from ground to UAV (2m diameter)
      const lineSourceId = `uav-line-${uavId}`;
      const cylinderRadius = 0.00001; // ~1m radius = 2m diameter
      const cylinderSegments = 16;
      const cylinderCoords = [];
      for (let i = 0; i <= cylinderSegments; i++) {
        const angle = (i / cylinderSegments) * Math.PI * 2;
        const dx = Math.cos(angle) * cylinderRadius;
        const dy = Math.sin(angle) * cylinderRadius;
        cylinderCoords.push([newLng + dx, newLat + dy, altitude]);
      }

      if (!map.current.getSource(lineSourceId)) {
        map.current.addSource(lineSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [cylinderCoords]
            }
          }
        });

        map.current.addLayer({
          id: lineSourceId,
          type: 'fill-extrusion',
          source: lineSourceId,
          paint: {
            'fill-extrusion-color': uav.color,
            'fill-extrusion-height': altitude,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.7
          }
        });
      } else {
        map.current.getSource(lineSourceId).setData({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [cylinderCoords]
          }
        });
        map.current.setPaintProperty(lineSourceId, 'fill-extrusion-height', altitude);
      }

      // Glowing pyramid at altitude with zoom-based scaling
      const pyramidSourceId = `uav-pyramid-${uavId}`;
      const currentZoom = map.current.getZoom();
      // Scale size based on zoom: larger at lower zoom levels, cap at zoom 16
      const zoomScale = Math.max(0.5, Math.min(2.5, 16 / Math.max(currentZoom, 10)));
      const pyramidSize = 0.00016 * zoomScale; // Doubled size (~16-20 meters base)
      const pyramidHeight = 30; // Doubled height of pyramid in meters
      
      // Create triangle/pyramid shape (3-sided polygon pointing north)
      const pyramidPolygon = {
        type: 'Feature',
        properties: {
          uavId: uavId,
          color: uav.color
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [newLng, newLat + pyramidSize, altitude],              // North point (front)
            [newLng - pyramidSize * 0.8, newLat - pyramidSize * 0.5, altitude],  // Southwest point
            [newLng + pyramidSize * 0.8, newLat - pyramidSize * 0.5, altitude],  // Southeast point
            [newLng, newLat + pyramidSize, altitude]               // Close the polygon
          ]]
        }
      };

      if (!map.current.getSource(pyramidSourceId)) {
        map.current.addSource(pyramidSourceId, {
          type: 'geojson',
          data: pyramidPolygon
        });

        map.current.addLayer({
          id: pyramidSourceId,
          type: 'fill-extrusion',
          source: pyramidSourceId,
          paint: {
            'fill-extrusion-color': uav.color,
            'fill-extrusion-height': altitude + pyramidHeight,
            'fill-extrusion-base': altitude,
            'fill-extrusion-opacity': selectedUavId === uavId ? 0.9 : 0.7,
            'fill-extrusion-vertical-gradient': true
          }
        });

        // Only attach handlers once when layer is created
        if (!pyramidHandlers.current.has(pyramidSourceId)) {
          const clickHandler = (e) => {
            // Prevent map click from firing
            e.originalEvent.stopPropagation();
            onSelectUav(uavId);
          };
          const mouseEnterHandler = () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          };
          const mouseLeaveHandler = () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          };

          map.current.on('click', pyramidSourceId, clickHandler);
          map.current.on('mouseenter', pyramidSourceId, mouseEnterHandler);
          map.current.on('mouseleave', pyramidSourceId, mouseLeaveHandler);

          // Store handlers for cleanup
          pyramidHandlers.current.set(pyramidSourceId, {
            clickHandler,
            mouseEnterHandler,
            mouseLeaveHandler
          });
        }
      } else {
        map.current.getSource(pyramidSourceId).setData(pyramidPolygon);

        // Update opacity based on selection
        map.current.setPaintProperty(pyramidSourceId, 'fill-extrusion-opacity', selectedUavId === uavId ? 0.9 : 0.7);
        map.current.setPaintProperty(pyramidSourceId, 'fill-extrusion-height', altitude + pyramidHeight);
        map.current.setPaintProperty(pyramidSourceId, 'fill-extrusion-base', altitude);
      }
    });

    // Clean up removed UAVs
    const currentUavIds = Object.keys(uavs);
    if (map.current.getStyle()) {
      map.current.getStyle().layers.forEach(layer => {
        if (layer.id.startsWith('uav-line-') || layer.id.startsWith('uav-point-') || layer.id.startsWith('uav-pyramid-')) {
          const uavId = layer.id.replace('uav-line-', '').replace('uav-point-', '').replace('uav-pyramid-', '');
          if (!currentUavIds.includes(uavId)) {
            // Remove event handlers before removing layer
            if (layer.id.startsWith('uav-pyramid-')) {
              const handlers = pyramidHandlers.current.get(layer.id);
              if (handlers && map.current.getLayer(layer.id)) {
                map.current.off('click', layer.id, handlers.clickHandler);
                map.current.off('mouseenter', layer.id, handlers.mouseEnterHandler);
                map.current.off('mouseleave', layer.id, handlers.mouseLeaveHandler);
                pyramidHandlers.current.delete(layer.id);
              }
            }
            
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

  // ROI circles visualization
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    rois.forEach((roi, index) => {
      const { lng: roiLng, lat: roiLat } = simulatorToMapCoords(roi.x, roi.y);
      const radiusInDegrees = (roi.radius || 50) * METERS_TO_LNG;

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
  }, [rois, lng, lat]);

  // Target markers visualization
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    targets.forEach((target, index) => {
      const { lng: targetLng, lat: targetLat } = simulatorToMapCoords(target.x, target.y);

      const sourceId = `target-${index}`;
      const layerId = `target-marker-${index}`;

      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [targetLng, targetLat, 0]
            }
          }
        });

        map.current.addLayer({
          id: layerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': 12,
            'circle-color': '#ff0000',
            'circle-opacity': 1,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff'
          }
        });
      } else {
        map.current.getSource(sourceId).setData({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [targetLng, targetLat, 0]
          }
        });
      }
    });
  }, [targets, lng, lat]);

  // Click target pulsating marker
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !clickTarget) return;

    const sourceId = 'click-target';
    const layerId = 'click-target-marker';

    if (!map.current.getSource(sourceId)) {
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [clickTarget.lng, clickTarget.lat, 0]
          }
        }
      });

      map.current.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 15,
            15, 30
          ],
          'circle-color': '#00ff00',
          'circle-opacity': 0.4,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#00ff00',
          'circle-stroke-opacity': 0.8
        }
      });

      // Pulsate animation
      let radius = 15;
      let growing = true;
      const interval = setInterval(() => {
        if (!map.current.getLayer(layerId)) {
          clearInterval(interval);
          return;
        }
        radius = growing ? radius + 1 : radius - 1;
        if (radius >= 25) growing = false;
        if (radius <= 15) growing = true;

        map.current.setPaintProperty(layerId, 'circle-radius', [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, radius,
          15, radius * 2
        ]);
      }, 50);

      // Remove after 5 seconds
      setTimeout(() => {
        clearInterval(interval);
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      }, 5000);
    } else {
      map.current.getSource(sourceId).setData({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [clickTarget.lng, clickTarget.lat, 0]
        }
      });
    }
  }, [clickTarget]);

  // Trajectory visualization (planned paths)
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) {
      console.log('TRAJECTORY EFFECT: Map not ready', { mapExists: !!map.current, styleLoaded: map.current?.isStyleLoaded() });
      return;
    }

    console.log('=== TRAJECTORY VISUALIZATION ===');
    console.log('Trajectories:', trajectories?.length || 0, trajectories);

    try {
      // Remove existing trajectory layers/sources
      const style = map.current.getStyle();
      if (style?.layers) {
        const layersToRemove = [];
        const sourcesToRemove = [];

        style.layers.forEach(layer => {
          if (layer.id.startsWith('trajectory-')) {
            layersToRemove.push(layer.id);
          }
        });

        layersToRemove.forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId);
            console.log('Removed layer:', layerId);
          }
        });

        Object.keys(style.sources).forEach(sourceId => {
          if (sourceId.startsWith('trajectory-')) {
            sourcesToRemove.push(sourceId);
          }
        });

        sourcesToRemove.forEach(sourceId => {
          if (map.current.getSource(sourceId)) {
            map.current.removeSource(sourceId);
            console.log('Removed source:', sourceId);
          }
        });
      }

      // Add new trajectories
      if (trajectories && trajectories.length > 0) {
        console.log('Processing', trajectories.length, 'trajectories');
        trajectories.forEach((traj, index) => {
          console.log(`Processing trajectory ${index}:`, traj);
          const trajId = `trajectory-${index}`;
          const waypoints = traj.waypoints || [];

          console.log(`Trajectory ${index} has ${waypoints.length} waypoints`);
          
          if (waypoints.length < 2) {
            console.log(`Skipping trajectory ${index}: not enough waypoints`);
            return;
          }

          // Convert waypoints to coordinates (2D only - drapes on terrain surface)
          const coordinates = waypoints
            .map(wp => {
              if (wp.lat !== undefined && wp.lng !== undefined) {
                // Use only lng/lat, no altitude - let it drape on terrain
                return [wp.lng, wp.lat];
              } else if (wp.x !== undefined && wp.y !== undefined) {
                // Convert x/y offsets to lat/lng
                return [
                  lng + (wp.y * METERS_TO_LNG),
                  lat + (wp.x * METERS_TO_LAT)
                ];
              }
              return null;
            })
            .filter(coord => coord !== null);

          console.log(`Trajectory ${index} converted to ${coordinates.length} coordinates (2D):`, coordinates);

          if (coordinates.length < 2) {
            console.log(`Skipping trajectory ${index}: not enough valid coordinates`);
            return;
          }

          // Add source for the line
          console.log(`Adding line source ${trajId}`);
          map.current.addSource(trajId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coordinates
              }
            }
          });

          // Add line layer (using same technique as boundary box)
          console.log(`Adding line layer ${trajId}`);
          map.current.addLayer({
            id: trajId,
            type: 'line',
            source: trajId,
            paint: {
              'line-color': '#00ffff',  // Cyan to distinguish from red boundary
              'line-width': 4,
              'line-opacity': 0.8
            }
          });

          // Add waypoint markers (crosses/circles)
          const waypointSourceId = `${trajId}-waypoints`;
          console.log(`Adding waypoint markers ${waypointSourceId}`);
          
          map.current.addSource(waypointSourceId, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: coordinates.map((coord, wpIndex) => ({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: coord
                },
                properties: {
                  index: wpIndex
                }
              }))
            }
          });

          // Add waypoint circle layer
          map.current.addLayer({
            id: `${trajId}-waypoint-circles`,
            type: 'circle',
            source: waypointSourceId,
            paint: {
              'circle-radius': 6,
              'circle-color': '#00ffff',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.9
            }
          });

          console.log(`✓ Added trajectory ${trajId} with ${coordinates.length} waypoints and markers`);
        });
      } else {
        console.log('No trajectories to render');
      }

      console.log('=== TRAJECTORY RENDERING COMPLETE ===');
    } catch (error) {
      console.error('ERROR in trajectory visualization:', error);
    }
  }, [trajectories, lng, lat]);

  // Formation lines and swarm label
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

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

          const { lng: lng1, lat: lat1 } = simulatorToMapCoords(h1.position.x, h1.position.y);
          const { lng: lng2, lat: lat2 } = simulatorToMapCoords(h2.position.x, h2.position.y);

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
              'line-width': 6,
              'line-opacity': 0.9,
              'line-blur': 2
            }
          });
        } else {
          map.current.getSource(sourceId).setData({
            type: 'FeatureCollection',
            features: lines
          });
        }

        // Add floating swarm label at center
        const { lng: centerLng, lat: centerLat } = simulatorToMapCoords(formationCenterX, formationCenterY);

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

    // Clear all pyramid handlers before style change
    pyramidHandlers.current.clear();

    map.current.setStyle(styleUrl);

    // Re-add UAV layers after style change
    map.current.once('style.load', () => {
      // Add DEM source and terrain for both views
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

      // Re-add all UAV layers
      Object.entries(uavs).forEach(([uavId, uav]) => {
        const { lng: newLng, lat: newLat } = simulatorToMapCoords(uav.position.x, uav.position.y);
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
              'line-width': 4,
              'line-opacity': 0.8
            }
          });
        }

        // Re-add pyramid
        const pyramidSourceId = `uav-pyramid-${uavId}`;
        const pyramidSize = 0.00008;
        const pyramidHeight = 15;
        
        const pyramidPolygon = {
          type: 'Feature',
          properties: {
            uavId: uavId,
            color: uav.color
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [newLng, newLat + pyramidSize, altitude],
              [newLng + pyramidSize, newLat, altitude],
              [newLng, newLat - pyramidSize, altitude],
              [newLng - pyramidSize, newLat, altitude],
              [newLng, newLat + pyramidSize, altitude]
            ]]
          }
        };

        if (!map.current.getSource(pyramidSourceId)) {
          map.current.addSource(pyramidSourceId, {
            type: 'geojson',
            data: pyramidPolygon
          });

          map.current.addLayer({
            id: pyramidSourceId,
            type: 'fill-extrusion',
            source: pyramidSourceId,
            paint: {
              'fill-extrusion-color': uav.color,
              'fill-extrusion-height': altitude + pyramidHeight,
              'fill-extrusion-base': altitude,
              'fill-extrusion-opacity': selectedUavId === uavId ? 0.9 : 0.7,
              'fill-extrusion-vertical-gradient': true
            }
          });

          // Handlers will be attached by the main useEffect on next render
        }
      });
    });
  };

  // Toggle 2D view
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
  }, [onToggle2DViewReady]);

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

      {/* Cursor indicator - smooth red circle */}
      {cursorCoords && cursorPixelPos && (
        <div
          className="cursor-coords-overlay"
          style={{
            left: `${cursorPixelPos.x - 12}px`,
            top: `${cursorPixelPos.y - 12}px`
          }}
        />
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
