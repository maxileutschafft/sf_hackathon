#!/usr/bin/env python3
"""
Path Planner Service
Receives mission parameters (origins, targets, jammers) and returns waypoint trajectories.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import logging

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def plan_straight_line_path(origin, target, num_waypoints=10):
    """
    Generate a straight line path from origin to target.
    
    Args:
        origin: dict with 'lat', 'lng', 'x', 'y' coordinates
        target: dict with 'lat', 'lng', 'x', 'y' coordinates
        num_waypoints: number of waypoints to generate along the path
    
    Returns:
        list of waypoint dicts with lat, lng, x, y coordinates
    """
    waypoints = []
    
    # Use lat/lng if available, otherwise use x/y
    if 'lat' in origin and 'lng' in origin and 'lat' in target and 'lng' in target:
        origin_lat = origin['lat']
        origin_lng = origin['lng']
        target_lat = target['lat']
        target_lng = target['lng']
        
        for i in range(num_waypoints + 1):
            t = i / num_waypoints
            waypoint_lat = origin_lat + t * (target_lat - origin_lat)
            waypoint_lng = origin_lng + t * (target_lng - origin_lng)
            
            waypoints.append({
                'lat': waypoint_lat,
                'lng': waypoint_lng,
                'alt': 50.0  # Default altitude in meters
            })
    elif 'x' in origin and 'y' in origin and 'x' in target and 'y' in target:
        origin_x = origin['x']
        origin_y = origin['y']
        target_x = target['x']
        target_y = target['y']
        
        for i in range(num_waypoints + 1):
            t = i / num_waypoints
            waypoint_x = origin_x + t * (target_x - origin_x)
            waypoint_y = origin_y + t * (target_y - origin_y)
            
            waypoints.append({
                'x': waypoint_x,
                'y': waypoint_y,
                'alt': 50.0
            })
    else:
        logger.error("Invalid origin or target coordinates")
        return []
    
    return waypoints


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'service': 'pathplanner'}), 200


@app.route('/plan', methods=['POST'])
def plan_mission():
    """
    Plan mission paths based on origins, targets, and jammers.
    
    Expected JSON format:
    {
        "origins": [{"id": "ORIGIN-1", "lat": 37.5, "lng": -122.5, "x": 0, "y": 0, ...}],
        "targets": [{"id": "TARGET-1", "lat": 37.6, "lng": -122.4, "x": 100, "y": 50, ...}],
        "jammers": [{"id": "JAMMER-1", "lat": 37.55, "lng": -122.45, "radius": 50, ...}]
    }
    
    Returns JSON format:
    {
        "trajectories": [
            {
                "origin_id": "ORIGIN-1",
                "target_id": "TARGET-1",
                "waypoints": [
                    {"lat": 37.5, "lng": -122.5, "alt": 50},
                    {"lat": 37.55, "lng": -122.45, "alt": 50},
                    ...
                ]
            }
        ]
    }
    """
    try:
        data = request.json
        logger.info(f"Received mission planning request: {json.dumps(data, indent=2)}")
        
        origins = data.get('origins', [])
        targets = data.get('targets', [])
        jammers = data.get('jammers', [])
        
        if not origins:
            return jsonify({'error': 'No origins provided'}), 400
        
        if not targets:
            return jsonify({'error': 'No targets provided'}), 400
        
        trajectories = []
        
        # For now, create a simple pairing: each origin to each target
        # In a real scenario, you'd implement optimal assignment
        for i, origin in enumerate(origins):
            if i < len(targets):
                target = targets[i]
                
                # Generate straight line path from origin to target
                waypoints = plan_straight_line_path(origin, target, num_waypoints=10)
                
                trajectory = {
                    'origin_id': origin.get('id', f'origin-{i}'),
                    'target_id': target.get('id', f'target-{i}'),
                    'waypoints': waypoints
                }
                
                trajectories.append(trajectory)
                logger.info(f"Generated trajectory from {trajectory['origin_id']} to {trajectory['target_id']} with {len(waypoints)} waypoints")
        
        result = {
            'trajectories': trajectories,
            'num_trajectories': len(trajectories),
            'jammers_considered': len(jammers)
        }
        
        logger.info(f"Returning {len(trajectories)} trajectories")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error planning mission: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Path Planner service on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
