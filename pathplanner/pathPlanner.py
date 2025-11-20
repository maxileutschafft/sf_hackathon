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
from collections import deque

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Planning constants
FORMATION_RADIUS_METERS = 30.0   # swarm radius around center path (unused when no margins)
EXTRA_CLEARANCE_METERS = 15.0    # extra clearance (unused when no margins)
# Grid resolution multiplier (2 -> half-size cells, 4 -> quarter-size cells)
GRID_SCALE = 2


def haversine_distance(lat1, lng1, lat2, lng2):
    """Calculate great-circle distance between two lat/lng points in meters."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


def euclidean_distance(p1, p2):
    """Calculate Euclidean distance between two points."""
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)


def is_point_in_jammer(point, jammers, use_latlng=False):
    """
    Check if a point is inside any jammer area.
    
    Args:
        point: (x, y) or (lat, lng) depending on use_latlng
        jammers: list of jammer dicts with 'center', 'radius', and optionally 'center_latlng'
        use_latlng: if True, use geographic distance; if False, use Euclidean distance
    """
    if use_latlng:
        lat, lng = point
        for jammer in jammers:
            if 'center_latlng' in jammer:
                jlat, jlng = jammer['center_latlng']
                radius = jammer['radius']
                distance = haversine_distance(lat, lng, jlat, jlng)
                if distance <= radius:
                    return True
    else:
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


def nearest_free_cell(point, blocked_set, grid_size, max_radius=500):
    """If a point is blocked, find the nearest free integer cell via expanding rings."""
    x0, y0 = round(point[0]), round(point[1])
    if (x0, y0) not in blocked_set:
        return (x0, y0)
    for r in range(1, max_radius + 1):
        # iterate ring perimeter
        for dx in range(-r, r + 1):
            for dy in (-r, r):
                x, y = x0 + dx, y0 + dy
                if (grid_size['x_min'] <= x <= grid_size['x_max'] and
                    grid_size['y_min'] <= y <= grid_size['y_max'] and
                    (x, y) not in blocked_set):
                    return (x, y)
        for dy in range(-r + 1, r):
            for dx in (-r, r):
                x, y = x0 + dx, y0 + dy
                if (grid_size['x_min'] <= x <= grid_size['x_max'] and
                    grid_size['y_min'] <= y <= grid_size['y_max'] and
                    (x, y) not in blocked_set):
                    return (x, y)
    return (x0, y0)


def bresenham_line_cells(a, b):
    """Generate integer cells along the line from a to b (inclusive)."""
    x0, y0 = a
    x1, y1 = b
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    cells = []
    dx = abs(x1 - x0)
    sx = 1 if x0 < x1 else -1
    dy = -abs(y1 - y0)
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        cells.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return cells


def line_of_sight(a, b, blocked_set):
    """Return True if straight segment from a to b stays in free space."""
    for c in bresenham_line_cells(a, b):
        if c in blocked_set:
            return False
    return True


def smooth_path(path, blocked_set):
    """Simple line-of-sight path smoothing: keep turning points only."""
    if not path:
        return path
    smoothed = [path[0]]
    i = 0
    while i < len(path) - 1:
        j = len(path) - 1
        # Find farthest visible point
        while j > i + 1 and not line_of_sight(path[i], path[j], blocked_set):
            j -= 1
        smoothed.append(path[j])
        i = j
    return smoothed


def astar(origin, target, blocked_set, grid_size):
    """
    A* pathfinding algorithm using grid-based approach.
    
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

    # Shift start/goal if they are inside obstacles
    if start in blocked_set:
        shifted = nearest_free_cell(start, blocked_set, grid_size)
        if shifted != start:
            logger.warning(f"Shifted START from {start} to free cell {shifted}")
            start = shifted
    if goal in blocked_set:
        shifted = nearest_free_cell(goal, blocked_set, grid_size)
        if shifted != goal:
            logger.warning(f"Shifted GOAL from {goal} to free cell {shifted}")
            goal = shifted
    
    # Counter for blocked neighbors
    blocked_count = 0
    
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
            logger.info(f"A* found path with {len(path)} waypoints, blocked {blocked_count} neighbors in jammer zones")
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
            
            # BLOCK: skip neighbors in obstacle set
            if neighbor in blocked_set:
                blocked_count += 1
                if blocked_count <= 5:
                    logger.debug(f"Blocking neighbor {neighbor} - obstacle")
                continue
            
            # Calculate base cost: all edges have cost 1 for cardinal moves, sqrt(2) for diagonal
            dx = abs(neighbor[0] - current[0])
            dy = abs(neighbor[1] - current[1])
            if dx + dy == 2:  # diagonal
                edge_cost = math.sqrt(2)
            else:  # cardinal
                edge_cost = 1.0
            
            tentative_g = g_current + edge_cost
            
            # If this is a better path, record it
            if neighbor not in g_score or tentative_g < g_score[neighbor]:
                g_score[neighbor] = tentative_g
                f_score = tentative_g + h(neighbor)
                heapq.heappush(open_set, (f_score, tentative_g, neighbor))
                came_from[neighbor] = current
    
    # No path found
    logger.info(f"A* blocked {blocked_count} neighbors in obstacle set")
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
    
    # CRITICAL FIX: Calculate the actual scale factor for this coordinate system
    # The x/y values are NOT in meters, they're in a scaled coordinate system
    # where 0.0001 degrees ≈ 11 meters (varies by latitude)
    
    # Calculate actual distance in meters using lat/lng
    if 'lat' in origin and 'lng' in origin and 'lat' in target and 'lng' in target:
        actual_distance_meters = haversine_distance(
            origin['lat'], origin['lng'], 
            target['lat'], target['lng']
        )
        # Calculate distance in the x/y coordinate system
        xy_distance = euclidean_distance(origin_pos, target_pos)
        
        # Calculate scale factor: how many coordinate units per meter
        if xy_distance > 0:
            scale_factor = xy_distance / actual_distance_meters
            logger.info(f"Scale factor: {scale_factor:.6f} coordinate units per meter")
        else:
            scale_factor = 0.0001  # fallback to approximate value
            logger.warning("Could not calculate scale factor, using default")
    else:
        scale_factor = 0.0001  # fallback
        logger.warning("Missing lat/lng, using approximate scale factor")
    
    # Convert jammers to internal format with SCALED (meters->coords), no extra safety margin
    jammer_list = []
    for jammer in jammers:
        if 'x' in jammer and 'y' in jammer and 'radius' in jammer:
            # Scale the radius from meters to coordinate system units
            radius_in_coords = jammer['radius'] * scale_factor
            # No safety margin requested: use exact jammer radius
            inflation_meters = 0.0
            safety_margin = 0.0
            
            jammer_dict = {
                'center': (jammer['x'], jammer['y']),
                'radius': radius_in_coords + safety_margin  # Expanded for formation clearance
            }
            
            # Also store lat/lng center for verification
            if 'lat' in jammer and 'lng' in jammer:
                jammer_dict['center_latlng'] = (jammer['lat'], jammer['lng'])
            
            jammer_list.append(jammer_dict)
            logger.info(
                f"Jammer at ({jammer['x']:.2f}, {jammer['y']:.2f}), "
                f"radius {jammer['radius']}m = {radius_in_coords:.2f} coords (no margin)"
            )
    
    # Determine grid size (unscaled) based on origin, target, and jammers
    all_x = [origin_pos[0], target_pos[0]]
    all_y = [origin_pos[1], target_pos[1]]
    
    for jammer in jammer_list:
        jx, jy = jammer['center']
        r = jammer['radius']  # Already scaled to coordinate units
        all_x.extend([jx - r, jx + r])
        all_y.extend([jy - r, jy + r])
    
    # Unscaled bounds with 50-cell padding, then scale for grid
    unscaled_grid = {
        'x_min': int(math.floor(min(all_x))) - 50,
        'x_max': int(math.ceil(max(all_x))) + 50,
        'y_min': int(math.floor(min(all_y))) - 50,
        'y_max': int(math.ceil(max(all_y))) + 50
    }
    grid_size = {
        'x_min': unscaled_grid['x_min'] * GRID_SCALE,
        'x_max': unscaled_grid['x_max'] * GRID_SCALE,
        'y_min': unscaled_grid['y_min'] * GRID_SCALE,
        'y_max': unscaled_grid['y_max'] * GRID_SCALE,
    }
    
    logger.info(f"Planning path from {origin_pos} to {target_pos}")
    logger.info(f"Grid size (scaled): {grid_size} with GRID_SCALE={GRID_SCALE}")
    logger.info(f"Jammers: {len(jammer_list)}")
    logger.info(f"=== OBSTACLE DETAILS (inflated) ===")
    for idx, jammer in enumerate(jammer_list):
        logger.info(f"Obstacle {idx}: center={jammer['center']}, radius={jammer['radius']:.4f} coords")
    logger.info(f"Scale factor: {scale_factor:.6f}")
    logger.info(f"======================")
    
    # Build obstacle set (blocked cells) by rasterizing inflated circles (in scaled grid)
    blocked_set = set()
    for j in jammer_list:
        (cx_u, cy_u) = j['center']
        r_u = j['radius']
        # Scale to grid
        cx = cx_u * GRID_SCALE
        cy = cy_u * GRID_SCALE
        r = r_u * GRID_SCALE
        xmin = int(math.floor(cx - r))
        xmax = int(math.ceil(cx + r))
        ymin = int(math.floor(cy - r))
        ymax = int(math.ceil(cy + r))
        for x in range(max(xmin, grid_size['x_min']), min(xmax, grid_size['x_max']) + 1):
            for y in range(max(ymin, grid_size['y_min']), min(ymax, grid_size['y_max']) + 1):
                if euclidean_distance((x, y), (cx, cy)) <= r:
                    blocked_set.add((x, y))

    logger.info(f"Obstacle cells: {len(blocked_set)}")

    # Run A* on free grid
    logger.info(f"Starting A* with {len(jammer_list)} obstacles")
    # Scale origin/target to grid
    origin_grid = (round(origin_pos[0] * GRID_SCALE), round(origin_pos[1] * GRID_SCALE))
    target_grid = (round(target_pos[0] * GRID_SCALE), round(target_pos[1] * GRID_SCALE))
    path = astar(origin_grid, target_grid, blocked_set, grid_size)
    
    if not path:
        logger.error("No path found!")
        return []
    
    logger.info(f"Found path with {len(path)} waypoints")

    # Smooth path using line-of-sight to reduce unnecessary turns
    path_smoothed = smooth_path(path, blocked_set)
    if len(path_smoothed) != len(path):
        logger.info(f"Smoothed path from {len(path)} to {len(path_smoothed)} waypoints")
        path = path_smoothed
    
    # DISABLED: Decimation removed to show full A* path detail
    # The full path shows the actual curve around jammers
    # if len(path) > 2:
    #     decimated_path = [path[0]]  # Always keep first waypoint
    #     for i in range(3, len(path) - 1, 3):  # Every 3rd waypoint instead of 10th
    #         decimated_path.append(path[i])
    #     decimated_path.append(path[-1])  # Always keep last waypoint
    #     logger.info(f"Decimated path from {len(path)} to {len(decimated_path)} waypoints (every 3rd)")
    #     path = decimated_path
    
    logger.info(f"Using full path with {len(path)} waypoints (no decimation)")
    
    # Convert path (scaled grid) to waypoints in original coordinate units with lat/lng
    waypoints = []
    for x_s, y_s in path:
        # Unscale grid back to original coordinate units
        x = float(x_s) / GRID_SCALE
        y = float(y_s) / GRID_SCALE
        waypoint = {
            'x': float(x),
            'y': float(y),
            'alt': 50.0  # Default altitude in meters
        }
        
        # If origin has lat/lng, compute lat/lng by projecting x/y deltas (not linear interpolation)
        # This preserves the actual curved path from A* in geographic coordinates.
        if 'lat' in origin and 'lng' in origin:
            # Deltas in our coordinate units
            dx_coords = (x - origin['x'])
            dy_coords = (y - origin['y'])

            # Convert coordinate deltas to meters using the previously computed scale_factor
            # scale_factor: coordinate units per meter -> meters = coords / scale_factor
            dx_meters = dx_coords / scale_factor if scale_factor != 0 else 0.0
            dy_meters = dy_coords / scale_factor if scale_factor != 0 else 0.0

            # Convert meters to degrees at the origin latitude
            meters_per_deg_lat = 110540.0
            meters_per_deg_lng = 111320.0 * math.cos(math.radians(origin['lat']))

            dlat = dx_meters / meters_per_deg_lat
            dlng = dy_meters / meters_per_deg_lng if meters_per_deg_lng != 0 else 0.0

            waypoint['lat'] = origin['lat'] + dlat
            waypoint['lng'] = origin['lng'] + dlng
        
        waypoints.append(waypoint)

    # Ensure first and last waypoints are at origin/target when not inside a jammer
    if waypoints:
        # Snap first to exact origin if origin cell is not inside obstacle
        origin_grid = (round(origin_pos[0] * GRID_SCALE), round(origin_pos[1] * GRID_SCALE))
        if origin_grid not in blocked_set:
            waypoints[0]['x'] = float(origin_pos[0])
            waypoints[0]['y'] = float(origin_pos[1])
            if 'lat' in origin and 'lng' in origin:
                waypoints[0]['lat'] = origin['lat']
                waypoints[0]['lng'] = origin['lng']
        else:
            logger.warning("Origin lies inside jammer – keeping first free waypoint instead of snapping.")

        # Snap last to exact target if target cell is not inside obstacle
        target_grid = (round(target_pos[0] * GRID_SCALE), round(target_pos[1] * GRID_SCALE))
        if target_grid not in blocked_set:
            waypoints[-1]['x'] = float(target_pos[0])
            waypoints[-1]['y'] = float(target_pos[1])
            if 'lat' in target and 'lng' in target:
                waypoints[-1]['lat'] = target['lat']
                waypoints[-1]['lng'] = target['lng']
        else:
            logger.warning("Target lies inside jammer – keeping last free waypoint to avoid entering jammer.")
    
    return waypoints, scale_factor


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
        
        # Debug: Log raw jammer data received
        logger.info("=== RAW JAMMER DATA RECEIVED ===")
        for idx, j in enumerate(jammers):
            logger.info(f"Jammer {idx}: lat={j.get('lat')}, lng={j.get('lng')}, x={j.get('x')}, y={j.get('y')}, radius={j.get('radius')}")
        logger.info("================================")
        
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
                waypoints, scale_factor = plan_astar_path(origin, target, jammers)
                
                if not waypoints:
                    logger.warning(f"No path found from {origin.get('id')} to {target.get('id')}")
                    continue
                
                # Calculate statistics using geographic distances
                if 'lat' in origin and 'lng' in origin and 'lat' in target and 'lng' in target:
                    # Calculate actual path length in meters using lat/lng
                    path_length = 0
                    for j in range(len(waypoints) - 1):
                        if 'lat' in waypoints[j] and 'lng' in waypoints[j] and 'lat' in waypoints[j+1] and 'lng' in waypoints[j+1]:
                            path_length += haversine_distance(
                                waypoints[j]['lat'], waypoints[j]['lng'],
                                waypoints[j+1]['lat'], waypoints[j+1]['lng']
                            )
                else:
                    # Fallback to coordinate distance
                    path_length = sum(
                        euclidean_distance((waypoints[j]['x'], waypoints[j]['y']), 
                                         (waypoints[j+1]['x'], waypoints[j+1]['y']))
                        for j in range(len(waypoints) - 1)
                    )
                
                # Count waypoints in jammer zones using geographic distance
                steps_in_jammer = 0
                for wp in waypoints:
                    if 'lat' in wp and 'lng' in wp:
                        for jammer in jammers:
                            if 'lat' in jammer and 'lng' in jammer and 'radius' in jammer:
                                distance = haversine_distance(
                                    wp['lat'], wp['lng'],
                                    jammer['lat'], jammer['lng']
                                )
                                if distance <= jammer['radius']:
                                    steps_in_jammer += 1
                                    break  # Count each waypoint only once
                
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
            'algorithm': 'A* pathfinding',
            'scale_factor': scale_factor,                 # coordinate units per meter
            'meters_per_coord': (1.0 / scale_factor) if scale_factor else None
        }
        
        logger.info(f"Returning {len(trajectories)} trajectories")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error planning mission: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Path Planner service on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
