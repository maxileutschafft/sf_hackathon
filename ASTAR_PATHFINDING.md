# A* Pathfinding Integration

## Overview

The mission planner now uses the **A* pathfinding algorithm** to intelligently navigate drones from origin points to target points while avoiding jammer zones. This is a significant improvement over the previous straight-line path planning.

## How It Works

### 1. **A* Algorithm**

The A* algorithm finds the optimal path between two points on a grid by:
- Using a **heuristic function** (Euclidean distance) to estimate the cost to reach the goal
- Exploring paths with the lowest combined cost (distance traveled + estimated remaining distance)
- Applying a **penalty multiplier** (100x) for cells inside jammer zones, making the algorithm strongly prefer to avoid them

### 2. **Grid-Based Navigation**

- The world is discretized into a **1-meter rectangular grid**
- Drones can move in **8 directions** (cardinal + diagonal)
- Cardinal moves (N, S, E, W) cost 1.0 unit
- Diagonal moves (NE, NW, SE, SW) cost √2 ≈ 1.414 units
- Moves through jammer zones cost 100x more, strongly discouraging paths through jamming areas

### 3. **Jammer Avoidance**

When a jammer zone is present:
- The algorithm calculates a grid that encompasses all origins, targets, and jammers
- It applies a high cost penalty (100x) to any grid cell within a jammer's radius
- The algorithm will route around jammers unless there's absolutely no other path
- Statistics are provided showing how many waypoints fall within jammer zones

## Usage

### In the Mission Planning Interface

1. **Add Origins**: Click "SELECT ORIGIN" and place one or more drone starting positions on the map
2. **Add Targets**: Click "SELECT TARGET" and place one or more target destinations
3. **Add Jammers** (optional): Click "SELECT JAMMER" and place circular jammer zones (adjustable radius)
4. **Plan Mission**: Click "PLAN MISSION" to generate optimal paths using A*
5. **View Results**: Click "SHOW TRAJECTORY" to see the planned waypoints

### API Usage

**Endpoint**: `POST http://localhost:3001/api/plan-mission`

**Request Body**:
```json
{
  "origins": [
    {
      "id": "ORIGIN-1",
      "x": 0,
      "y": 0,
      "lat": 37.5139,
      "lng": -122.4961
    }
  ],
  "targets": [
    {
      "id": "TARGET-1",
      "x": 200,
      "y": 200,
      "lat": 37.5159,
      "lng": -122.4941
    }
  ],
  "jammers": [
    {
      "id": "JAMMER-1",
      "x": 100,
      "y": 100,
      "lat": 37.5149,
      "lng": -122.4951,
      "radius": 50
    }
  ]
}
```

**Response**:
```json
{
  "trajectories": [
    {
      "origin_id": "ORIGIN-1",
      "target_id": "TARGET-1",
      "waypoints": [
        { "x": 0, "y": 0, "lat": 37.5139, "lng": -122.4961, "alt": 50.0 },
        { "x": 1, "y": 1, "lat": 37.5139, "lng": -122.4961, "alt": 50.0 },
        ...
      ],
      "stats": {
        "total_waypoints": 284,
        "path_length": 282.84,
        "steps_in_jammer": 0
      }
    }
  ],
  "num_trajectories": 1,
  "jammers_considered": 1,
  "algorithm": "A* pathfinding"
}
```

## Key Features

### ✅ Intelligent Path Planning
- Finds the shortest safe path avoiding obstacles
- Handles complex scenarios with multiple jammers
- Guarantees optimal solution if a path exists

### ✅ Configurable Penalties
- Default jammer penalty: **100x** (strongly avoids jammers)
- Can be adjusted in `pathPlanner.py` if needed
- Set to 1.0 to ignore jammers (treats them like normal space)

### ✅ Comprehensive Statistics
Each trajectory includes:
- **total_waypoints**: Number of waypoints in the path
- **path_length**: Total distance in meters
- **steps_in_jammer**: Number of waypoints inside jammer zones (ideally 0)

### ✅ Robust Grid Sizing
- Automatically determines grid bounds based on mission parameters
- Adds 50m margin around all points for flexibility
- Handles edge cases gracefully

## Architecture

```
┌─────────────────┐
│   Frontend      │  User places origins, targets, jammers
│  (React App)    │
└────────┬────────┘
         │ POST /api/plan-mission
         ▼
┌─────────────────┐
│   Backend       │  Proxies request to pathplanner
│  (Express.js)   │  Saves waypoints.json
└────────┬────────┘
         │ POST http://pathplanner:5000/plan
         ▼
┌─────────────────┐
│  Path Planner   │  Runs A* algorithm
│  (Flask/Python) │  Returns optimized trajectories
└─────────────────┘
```

## Algorithm Details

### Pseudocode

```python
def astar(origin, target, jammers, grid_size):
    open_set = PriorityQueue()
    open_set.push((0, origin))
    
    while not open_set.empty():
        current = open_set.pop()
        
        if current == target:
            return reconstruct_path(current)
        
        for neighbor in get_neighbors(current):
            cost = calculate_cost(neighbor, jammers)  # 100x if in jammer
            g_score = current.g_score + cost
            
            if g_score < neighbor.g_score:
                neighbor.g_score = g_score
                neighbor.f_score = g_score + heuristic(neighbor, target)
                open_set.push((neighbor.f_score, neighbor))
    
    return None  # No path found
```

### Time Complexity
- **Best case**: O(b^d) where b is branching factor (8 neighbors) and d is depth
- **Average case**: Near-optimal with good heuristic
- **Worst case**: O(n log n) where n is grid size

### Space Complexity
- O(n) where n is the number of grid cells explored

## Configuration

### Adjusting Jammer Penalty

Edit `/pathplanner/pathPlanner.py`:

```python
# Line in astar() function:
path = astar(origin_pos, target_pos, jammer_list, grid_size, jammer_penalty=100.0)

# Change to:
path = astar(origin_pos, target_pos, jammer_list, grid_size, jammer_penalty=50.0)  # Less strict
# or
path = astar(origin_pos, target_pos, jammer_list, grid_size, jammer_penalty=1000.0)  # More strict
```

### Adjusting Grid Resolution

Currently using 1-meter grid cells. To change resolution, modify the grid coordinate rounding in the `astar()` function.

## Testing

### Test Scenario 1: Simple Path with One Jammer
```bash
# Add one origin at (0, 0)
# Add one target at (200, 200)
# Add one jammer at (100, 100) with radius 50m
# Expected: Path routes around the jammer
```

### Test Scenario 2: Multiple Jammers
```bash
# Add one origin at (0, 0)
# Add one target at (300, 0)
# Add three jammers along the direct path
# Expected: Path finds alternative route around all jammers
```

### Test Scenario 3: No Path Available
```bash
# Add one origin inside a jammer
# Add one target completely surrounded by jammers
# Expected: Algorithm will accept high penalty and route through jammers if no alternative exists
```

## Troubleshooting

### Issue: No path found
**Cause**: Target may be unreachable or grid size insufficient  
**Solution**: Check grid bounds or reduce jammer radii

### Issue: Path goes through jammer
**Cause**: No alternative path exists, or penalty too low  
**Solution**: Increase jammer_penalty parameter or adjust jammer placement

### Issue: Very long path with many waypoints
**Cause**: Large distance between origin and target  
**Solution**: This is expected behavior; consider path simplification post-processing

## Future Enhancements

- [ ] Path smoothing/simplification to reduce waypoint count
- [ ] Multi-resolution grids for faster computation on large areas
- [ ] Dynamic replanning when jammers move
- [ ] 3D pathfinding with altitude constraints
- [ ] Terrain-aware pathfinding using elevation data
- [ ] Multi-agent path planning with collision avoidance

## Credits

Based on the A* pathfinding algorithm originally developed for the mission planning system. Integrated into the UAV STING framework for intelligent drone navigation.
