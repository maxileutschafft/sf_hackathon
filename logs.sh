#!/bin/bash

# UAV Control System - View Logs Script

if [ "$1" == "" ]; then
    echo "📊 Viewing logs for all services..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker-compose logs -f
elif [ "$1" == "backend" ]; then
    echo "📊 Viewing backend logs..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker-compose logs -f backend
elif [ "$1" == "frontend" ]; then
    echo "📊 Viewing frontend logs..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker-compose logs -f frontend
elif [ "$1" == "simulator" ]; then
    echo "📊 Viewing simulator logs..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker-compose logs -f simulator
else
    echo "❌ Unknown service: $1"
    echo ""
    echo "Usage: ./logs.sh [service]"
    echo ""
    echo "Services:"
    echo "  backend     - View backend logs"
    echo "  frontend    - View frontend logs"
    echo "  simulator   - View simulator logs"
    echo "  (no args)   - View all logs"
    exit 1
fi
