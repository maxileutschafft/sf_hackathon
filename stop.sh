#!/bin/bash

# UAV Control System - Shutdown Script

echo "🛑 Stopping UAV Control System..."
echo ""

# Stop all services
docker-compose down

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All services stopped successfully"
    echo ""
else
    echo ""
    echo "❌ Error: Failed to stop some services"
    exit 1
fi
