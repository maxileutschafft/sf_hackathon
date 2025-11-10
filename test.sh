#!/bin/bash

# UAV Control System - Demo Test Script
# This script tests the system by sending commands via the API

BASE_URL="http://localhost:3001"

echo "🧪 UAV Control System - Demo Test"
echo "════════════════════════════════════════"
echo ""

# Check if system is running
echo "1️⃣  Checking system health..."
HEALTH=$(curl -s ${BASE_URL}/api/health)
if [ $? -eq 0 ]; then
    echo "✅ System is healthy"
    echo "   Response: $HEALTH"
else
    echo "❌ System is not responding"
    echo "   Please run ./start.sh first"
    exit 1
fi
echo ""

# Check system status
echo "2️⃣  Checking system status..."
STATUS=$(curl -s ${BASE_URL}/api/status)
echo "📊 Status Response:"
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
echo ""

# Test sending a command
echo "3️⃣  Testing command interface..."
echo "   Sending ARM command..."
RESPONSE=$(curl -s -X POST ${BASE_URL}/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"command","command":"arm","params":{},"timestamp":1234567890}')
echo "   Response: $RESPONSE"
echo ""

sleep 1

# Check status after command
echo "4️⃣  Checking status after command..."
STATUS=$(curl -s ${BASE_URL}/api/status)
echo "📊 Updated Status:"
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
echo ""

echo "✅ Demo test complete!"
echo ""
echo "📝 Notes:"
echo "   - Open http://localhost in your browser to use the full UI"
echo "   - Use the web interface for complete control"
echo "   - This script demonstrates API functionality only"
echo ""
