#!/usr/bin/env python3
"""
Path Planner Service
Receives mission parameters (origins, targets, jammers) and returns waypoint trajectories.
Uses A* algorithm for intelligent pathfinding around jammer zones.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import logging
import math
import heapq

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def euclidean_distance(p1, p2):
    """Calculate Euclidean distance between two points."""
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)


def is_point_in_jammer(point, jammers):
    """Check if a point is inside any jammer area."""
    x, y = point
    for jammer in jammers:
        jx, jy = jammer['center']
        radius = jammer['radius']
        if euclidean_distance((x, y), (jx, jy)) <= radius:
            return True
    return False


def get_neighbors(node, grid_size):
    """Get all 8 neighbors of a grid node (including diagonals)."""
    x, y = node
    neighbors = []
    # 8-directional movement (including diagonals)
    directions = [
        (0, 1), (0, -1), (1, 0), (-1, 0),  # cardinal directions
        (1, 1), (1, -1), (-1, 1), (-1, -1)  # diagonal directions
    ]
    
    for dx, dy in directions:
        nx, ny = x + dx, y + dy
        # Check if within grid bounds
        if (grid_size['x_min'] <= nx <= grid_size['x_max'] and 
            grid_size['y_min'] <= ny <= grid_size['y_max']):
            neighbors.append((nx, ny))
    
    return neighbors


def astar(origin, target, jammers, grid_size, jammer_penalty=100.0):
    """
    A* pathfinding algorithm on a rectangular grid.
    
    Args:
        origin: (x, y) starting position
        target: (x, y) target position
        jammers: list of jammer dictionaries with 'center' and 'radius'
        grid_size: dict with x_min, x_max, y_min, y_max
        jammer_penalty: cost multiplier for cells inside jammer zones (default 100.0)
    
    Returns:
        List of waypoints from origin to target, or None if no path exists
    """
    # Convert continuous coordinates to grid coordinates
    start = (round(origin[0]), round(origin[1]))
    goal = (round(target[0]), round(target[1]))
    
    # Priority queue: (f_score, g_score, node)
    open_set = [(0, 0, start)]
    
    # Track nodes we've visited
    closed_set = set()
    
    # Store the best g_score for each node
    g_score = {start: 0}
    
    # Store the path
    came_from = {}
    
    # Heuristic: Euclidean distance to target
    h = lambda node: euclidean_distance(node, goal)
    
    while open_set:
        # Get node with lowest f_score
        f_current, g_current, current = heapq.heappop(open_set)
        
        # If we reached the goal, reconstruct path
        if current == goal:
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start)
            path.reverse()
            return path
        
        # Skip if already processed
        if current in closed_set:
            continue
        
        closed_set.add(current)
        
        # Explore neighbors
        for neighbor in get_neighbors(current, grid_size):
            # Skip if already processed
            if neighbor in closed_set:
                continue
            
            # Calculate base cost: all edges have cost 1 for cardinal moves, sqrt(2) for diagonal
            dx = abs(neighbor[0] - current[0])
            dy = abs(neighbor[1] - current[1])
            if dx + dy == 2:  # diagonal
                edge_cost = math.sqrt(2)
            else:  # cardinal
                edge_cost = 1.0
            
            # Apply penalty if neighbor is in jammer zone
            if is_point_in_jammer(neighbor, jammers):
                edge_cost *= jammer_penalty
            
            tentative_g = g_current + edge_cost
            
            # If this is a better path, record it
            if neighbor not in g_score or tentative_g < g_score[neighbor]:
                g_score[neighbor] = tentative_g
                f_score = tentative_g + h(neighbor)
                heapq.heappush(open_set, (f_score, tentative_g, neighbor))
                came_from[neighbor] = current
    
    # No path found
    return None


def plan_astar_path(origin, target, jammers):
    """
    Generate an A* path from origin to target avoiding jammers.
    
    Args:
        origin: dict with 'lat', 'lng', 'x', 'y' coordinates
        target: dict with 'lat', 'lng', 'x', 'y' coordinates
        jammers: list of jammer dicts with 'lat', 'lng', 'x', 'y', 'radius'
    
    Returns:
        list of waypoint dicts with lat, lng, x, y coordinates
    """
    # Check if we have x/y coordinates
    if 'x' not in origin or 'y' not in origin or 'x' not in target or 'y' not in target:
        logger.error("Origin or target missing x/y coordinates")
        return []
    
    origin_pos = (origin['x'], origin['y'])
    target_pos = (target['x'], target['y'])
    
    # Convert jammers to A* format
    jammer_list = []
    for jammer in jammers:
        if 'x' in jammer and 'y' in jammer and 'radius' in jammer:
            jammer_list.append({
                'center': (jammer['x'], jammer['y']),
                'radius': jammer['radius']
            })
    
    # Determine grid size based on origin, target, and jammers
    all_x = [origin_pos[0], target_pos[0]]
    all_y = [origin_pos[1], target_pos[1]]
    
    for jammer in jammer_list:
        jx, jy = jammer['center']
        r = jammer['radius']
        all_x.extend([jx - r, jx + r])
        all_y.extend([jy - r, jy + r])
    
    grid_size = {
        'x_min': int(math.floor(min(all_x))) - 50,
        'x_max': int(math.ceil(max(all_x))) + 50,
        'y_min': int(math.floor(min(all_y))) - 50,
        'y_max': int(math.ceil(max(all_y))) + 50
    }
    
    logger.info(f"Planning path from {origin_pos} to {target_pos}")
    logger.info(f"Grid size: {grid_size}")
    logger.info(f"Jammers: {len(jammer_list)}")
    
    # Run A* algorithm
    path = astar(origin_pos, target_pos, jammer_list, grid_size, jammer_penalty=100.0)
    
    if not path:
        logger.error("No path found!")
        return []
    
    logger.info(f"Found path with {len(path)} waypoints")
    
    # Convert path to waypoints with lat/lng
    waypoints = []
    for x, y in path:
        waypoint = {
            'x': float(x),
            'y': float(y),
            'alt': 50.0  # Default altitude in meters
        }
        
        # If origin/target have lat/lng, interpolate them (simplified conversion)
        if 'lat' in origin and 'lng' in origin and 'lat' in target and 'lng' in target:
            # Linear interpolation from origin to target lat/lng based on x/y position
            dx_total = target['x'] - origin['x']
            dy_total = target['y'] - origin['y']
            
            if abs(dx_total) > 0.01 or abs(dy_total) > 0.01:
                # Progress from origin to target (0.0 to 1.0)
                t_x = (x - origin['x']) / dx_total if abs(dx_total) > 0.01 else 0.5
                t_y = (y - origin['y']) / dy_total if abs(dy_total) > 0.01 else 0.5
                t = (t_x + t_y) / 2  # Average of both progress values
                t = max(0.0, min(1.0, t))  # Clamp to [0, 1]
            else:
                t = 0.0
            
            waypoint['lat'] = origin['lat'] + t * (target['lat'] - origin['lat'])
            waypoint['lng'] = origin['lng'] + t * (target['lng'] - origin['lng'])
        
        waypoints.append(waypoint)
    
    return waypoints


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'service': 'pathplanner'}), 200


@app.route('/plan', methods=['POST'])
def plan_mission():
    """
    Plan mission paths based on origins, targets, and jammers using A* algorithm.
    
    Expected JSON format:
    {
        "origins": [{"id": "ORIGIN-1", "lat": 37.5, "lng": -122.5, "x": 0, "y": 0, ...}],
        "targets": [{"id": "TARGET-1", "lat": 37.6, "lng": -122.4, "x": 100, "y": 50, ...}],
        "jammers": [{"id": "JAMMER-1", "lat": 37.55, "lng": -122.45, "radius": 50, "x": 50, "y": 25, ...}]
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
                ],
                "stats": {
                    "total_waypoints": 15,
                    "path_length": 123.45,
                    "steps_in_jammer": 2
                }
            }
        ]
    }
    """
    try:
        data = request.json
        logger.info(f"Received mission planning request with {len(data.get('origins', []))} origins, "
                   f"{len(data.get('targets', []))} targets, {len(data.get('jammers', []))} jammers")
        
        origins = data.get('origins', [])
        targets = data.get('targets', [])
        jammers = data.get('jammers', [])
        
        if not origins:
            return jsonify({'error': 'No origins provided'}), 400
        
        if not targets:
            return jsonify({'error': 'No targets provided'}), 400
        
        trajectories = []
        
        # Create pairing: each origin to corresponding target (1-to-1 mapping)
        for i, origin in enumerate(origins):
            if i < len(targets):
                target = targets[i]
                
                logger.info(f"Planning path from {origin.get('id', f'origin-{i}')} to {target.get('id', f'target-{i}')}")
                
                # Generate A* path from origin to target avoiding jammers
                waypoints = plan_astar_path(origin, target, jammers)
                
                if not waypoints:
                    logger.warning(f"No path found from {origin.get('id')} to {target.get('id')}")
                    continue
                
                # Calculate statistics
                path_length = sum(
                    euclidean_distance((waypoints[j]['x'], waypoints[j]['y']), 
                                     (waypoints[j+1]['x'], waypoints[j+1]['y']))
                    for j in range(len(waypoints) - 1)
                )
                
                # Count waypoints in jammer zones
                jammer_list = [{'center': (j['x'], j['y']), 'radius': j['radius']} 
                              for j in jammers if 'x' in j and 'y' in j and 'radius' in j]
                steps_in_jammer = sum(
                    1 for wp in waypoints 
                    if is_point_in_jammer((wp['x'], wp['y']), jammer_list)
                )
                
                trajectory = {
                    'origin_id': origin.get('id', f'origin-{i}'),
                    'target_id': target.get('id', f'target-{i}'),
                    'waypoints': waypoints,
                    'stats': {
                        'total_waypoints': len(waypoints),
                        'path_length': round(path_length, 2),
                        'steps_in_jammer': steps_in_jammer
                    }
                }
                
                trajectories.append(trajectory)
                logger.info(f"Generated A* trajectory with {len(waypoints)} waypoints, "
                          f"length {path_length:.2f}m, {steps_in_jammer} steps in jammer zones")
        
        result = {
            'trajectories': trajectories,
            'num_trajectories': len(trajectories),
            'jammers_considered': len(jammers),
            'algorithm': 'A* pathfinding'
        }
        
        logger.info(f"Returning {len(trajectories)} trajectories")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error planning mission: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Path Planner service on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
