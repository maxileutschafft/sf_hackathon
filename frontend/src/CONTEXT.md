# HIVE System Context

## Summary
This is a complete UAV swarm control system called HIVE (High-altitude Intelligence & Vigilance Ecosystem). The system controls 12 HORNETs (drones) organized into 2 swarms of 6 drones each.

## Current Session Implementation
We are implementing multiple advanced features:
1. 12 HORNETs total (6 per swarm)
2. Click-to-move for swarms and individual drones
3. Hexagonal formation "ASSEMBLE" button
4. Region of Interest (ROI) circles - yellow overlays
5. Red target markers
6. 1km boundary visualization
7. Pulsating target indicators
8. Formation connection lines

## Architecture
- **Backend**: Node.js with WebSocket for real-time updates
- **Frontend**: React with Mapbox GL JS for 3D terrain
- **Simulators**: Python physics simulation (12 instances)
- **Docker**: Containerized deployment

## Features Implemented
- Multi-HORNET control
- Swarm grouping
- Real-time position updates
- Individual HORNET selection
- Swarm-wide selection
- Backend APIs for ROI and targets
