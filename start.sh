#!/bin/bash

# UAV Control System - Startup Script

echo "🚁 Starting UAV Control System..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop and remove any existing containers
echo "🧹 Cleaning up existing containers..."
docker compose down -v 2>/dev/null

# Remove old images to force rebuild
echo "🗑️  Removing old images..."
docker compose rm -f 2>/dev/null
docker images | grep sf_hackathon | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null

echo ""
echo "🔨 Building Docker containers (no cache)..."
docker compose build --no-cache

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful"
    echo ""
    echo "🚀 Starting all services..."
    docker compose up -d
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "⏳ Waiting for services to initialize..."
        sleep 5
        
        echo ""
        echo "✅ All services started successfully!"
        echo ""
        echo "📊 Service Status:"
        docker compose ps
        echo ""
        echo "🌐 Access the application at:"
        echo "   Frontend: http://localhost"
        echo "   Backend API: http://localhost:3001/api/status"
        echo ""
        echo "💡 Useful commands:"
        echo "   View logs: docker compose logs -f"
        echo "   Stop services: docker compose down"
        echo "   Restart simulators: docker compose restart hornet-1 hornet-2 ... hornet-12"
        echo ""
        echo "Happy flying! ✈️"
    else
        echo ""
        echo "❌ Error: Failed to start services"
        exit 1
    fi
else
    echo ""
    echo "❌ Error: Failed to build containers"
    exit 1
fi
