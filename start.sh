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

# Build and start all services
echo "🔨 Building Docker containers..."
docker-compose build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful"
    echo ""
    echo "🚀 Starting all services..."
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ All services started successfully!"
        echo ""
        echo "📊 Service Status:"
        docker-compose ps
        echo ""
        echo "🌐 Access the application at:"
        echo "   Frontend: http://localhost"
        echo "   Backend API: http://localhost:3001/api/status"
        echo ""
        echo "📝 View logs with: docker-compose logs -f"
        echo "🛑 Stop services with: docker-compose down"
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
