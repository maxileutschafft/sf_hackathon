#!/bin/bash

# UAV Control System - Status Check Script

echo "🔍 UAV Control System Status"
echo "════════════════════════════════════════"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if containers are running
echo "📦 Container Status:"
echo "────────────────────────────────────────"
docker-compose ps
echo ""

# Check if services are healthy
BACKEND_STATUS=$(docker inspect --format='{{.State.Status}}' uav-backend 2>/dev/null)
FRONTEND_STATUS=$(docker inspect --format='{{.State.Status}}' uav-frontend 2>/dev/null)
SIMULATOR_STATUS=$(docker inspect --format='{{.State.Status}}' uav-simulator 2>/dev/null)

echo "🚦 Service Health:"
echo "────────────────────────────────────────"

if [ "$BACKEND_STATUS" == "running" ]; then
    echo "✅ Backend:   Running"
else
    echo "❌ Backend:   Not Running"
fi

if [ "$FRONTEND_STATUS" == "running" ]; then
    echo "✅ Frontend:  Running"
else
    echo "❌ Frontend:  Not Running"
fi

if [ "$SIMULATOR_STATUS" == "running" ]; then
    echo "✅ Simulator: Running"
else
    echo "❌ Simulator: Not Running"
fi

echo ""

# Show access URLs if services are running
if [ "$BACKEND_STATUS" == "running" ] && [ "$FRONTEND_STATUS" == "running" ]; then
    echo "🌐 Access Points:"
    echo "────────────────────────────────────────"
    echo "Frontend:    http://localhost"
    echo "Backend API: http://localhost:3001/api/status"
    echo ""
    
    # Test backend health
    HEALTH_CHECK=$(curl -s http://localhost:3001/api/health 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "✅ Backend API is responding"
    else
        echo "⚠️  Backend API is not responding"
    fi
else
    echo "⚠️  Services are not fully running"
    echo "   Run ./start.sh to start all services"
fi

echo ""
