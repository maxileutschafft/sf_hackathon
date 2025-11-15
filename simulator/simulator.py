import asyncio
import websockets
import json
import math
import time
from datetime import datetime

class UAVSimulator:
    def __init__(self, uav_id='UAV-1', initial_position=None):
        self.uav_id = uav_id

        # Position (x, y, z) in meters
        if initial_position:
            self.position = initial_position.copy()
        else:
            self.position = {'x': 0.0, 'y': 0.0, 'z': 0.0}
        
        # Velocity (x, y, z) in m/s
        self.velocity = {'x': 0.0, 'y': 0.0, 'z': 0.0}
        
        # Orientation (pitch, roll, yaw) in degrees
        self.orientation = {'pitch': 0.0, 'roll': 0.0, 'yaw': 0.0}
        
        # Battery percentage
        self.battery = 100.0
        
        # Status: idle, armed, flying, landing
        self.status = 'idle'
        
        # Armed state
        self.armed = False
        
        # Target position for movement
        self.target_position = None
        
        # Physics constants
        self.gravity = -9.81  # m/s^2
        self.max_velocity = 33.33  # m/s (120 km/h)
        self.acceleration = 5.0  # m/s^2 (increased for faster response)
        self.drag_coefficient = 0.5
        
        # Battery drain rate (% per second)
        self.battery_drain_idle = 0.01
        self.battery_drain_flying = 0.05
        
        # Simulation time
        self.last_update = time.time()
        
    def update_physics(self, dt):
        """Update UAV physics simulation"""
        
        # Battery drain
        if self.status == 'flying':
            self.battery -= self.battery_drain_flying * dt
        else:
            self.battery -= self.battery_drain_idle * dt
        
        self.battery = max(0.0, min(100.0, self.battery))
        
        # Emergency landing if battery low
        if self.battery < 10.0 and self.status == 'flying':
            self.status = 'landing'
            self.target_position = {'x': self.position['x'], 'y': self.position['y'], 'z': 0.0}
        
        # Update position based on velocity
        if self.status in ['flying', 'landing']:
            self.position['x'] += self.velocity['x'] * dt
            self.position['y'] += self.velocity['y'] * dt
            self.position['z'] += self.velocity['z'] * dt
            
            # Ground constraint
            if self.position['z'] < 0:
                self.position['z'] = 0
                self.velocity['z'] = 0
                if self.status == 'landing':
                    self.status = 'armed'
                    self.velocity = {'x': 0.0, 'y': 0.0, 'z': 0.0}
            
            # Apply drag
            speed = math.sqrt(self.velocity['x']**2 + self.velocity['y']**2 + self.velocity['z']**2)
            if speed > 0:
                drag_force = self.drag_coefficient * speed
                self.velocity['x'] -= (self.velocity['x'] / speed) * drag_force * dt
                self.velocity['y'] -= (self.velocity['y'] / speed) * drag_force * dt
                self.velocity['z'] -= (self.velocity['z'] / speed) * drag_force * dt
        
        # Move towards target position
        if self.target_position and self.status == 'flying':
            dx = self.target_position['x'] - self.position['x']
            dy = self.target_position['y'] - self.position['y']
            dz = self.target_position['z'] - self.position['z']
            
            distance = math.sqrt(dx**2 + dy**2 + dz**2)
            
            if distance < 0.5:  # Close enough to target
                self.target_position = None
                self.velocity = {'x': 0.0, 'y': 0.0, 'z': 0.0}
            else:
                # Accelerate towards target
                target_velocity = {
                    'x': (dx / distance) * self.max_velocity * 0.5,
                    'y': (dy / distance) * self.max_velocity * 0.5,
                    'z': (dz / distance) * self.max_velocity * 0.5
                }
                
                # Smooth acceleration
                self.velocity['x'] += (target_velocity['x'] - self.velocity['x']) * self.acceleration * dt
                self.velocity['y'] += (target_velocity['y'] - self.velocity['y']) * self.acceleration * dt
                self.velocity['z'] += (target_velocity['z'] - self.velocity['z']) * self.acceleration * dt
    
    def handle_command(self, command_data):
        """Process incoming commands"""
        command = command_data.get('command')
        params = command_data.get('params', {})
        
        response = {
            'type': 'command_response',
            'command': command,
            'success': False,
            'message': ''
        }
        
        if command == 'arm':
            if not self.armed and self.position['z'] < 0.1:
                self.armed = True
                self.status = 'armed'
                response['success'] = True
                response['message'] = 'UAV armed'
            else:
                response['message'] = 'Cannot arm (already armed or not on ground)'
        
        elif command == 'disarm':
            if self.armed and self.position['z'] < 0.1:
                self.armed = False
                self.status = 'idle'
                response['success'] = True
                response['message'] = 'UAV disarmed'
            else:
                response['message'] = 'Cannot disarm (not on ground or not armed)'
        
        elif command == 'takeoff':
            if self.armed and self.status == 'armed':
                altitude = params.get('altitude', 10)
                self.status = 'flying'
                self.target_position = {
                    'x': self.position['x'],
                    'y': self.position['y'],
                    'z': altitude
                }
                response['success'] = True
                response['message'] = f'Taking off to {altitude}m'
            else:
                response['message'] = 'Cannot takeoff (not armed or already flying)'
        
        elif command == 'land':
            if self.status == 'flying':
                self.status = 'landing'
                self.target_position = {
                    'x': self.position['x'],
                    'y': self.position['y'],
                    'z': 0.0
                }
                response['success'] = True
                response['message'] = 'Landing initiated'
            else:
                response['message'] = 'Cannot land (not flying)'
        
        elif command == 'move':
            if self.status == 'flying':
                dx = params.get('dx', 0)
                dy = params.get('dy', 0)
                dz = params.get('dz', 0)
                
                self.target_position = {
                    'x': self.position['x'] + dx,
                    'y': self.position['y'] + dy,
                    'z': max(0, self.position['z'] + dz)
                }
                response['success'] = True
                response['message'] = f'Moving by ({dx}, {dy}, {dz})'
            else:
                response['message'] = 'Cannot move (not flying)'
        
        elif command == 'rotate':
            if self.status == 'flying':
                yaw_change = params.get('yaw', 0)
                self.orientation['yaw'] = (self.orientation['yaw'] + yaw_change) % 360
                response['success'] = True
                response['message'] = f'Rotating by {yaw_change}°'
            else:
                response['message'] = 'Cannot rotate (not flying)'

        elif command == 'goto':
            if self.status == 'flying':
                x = params.get('x', self.position['x'])
                y = params.get('y', self.position['y'])
                z = params.get('z', self.position['z'])

                self.target_position = {
                    'x': x,
                    'y': y,
                    'z': max(0, z)
                }
                response['success'] = True
                response['message'] = f'Going to position ({x}, {y}, {z})'
            else:
                response['message'] = 'Cannot goto (not flying)'

        else:
            response['message'] = f'Unknown command: {command}'
        
        return response
    
    def get_state(self):
        """Get current UAV state"""
        return {
            'type': 'state_update',
            'data': {
                'position': self.position.copy(),
                'velocity': self.velocity.copy(),
                'orientation': self.orientation.copy(),
                'battery': round(self.battery, 2),
                'status': self.status,
                'armed': self.armed
            },
            'timestamp': datetime.now().isoformat()
        }

class SimulatorServer:
    def __init__(self, host='0.0.0.0', port=8765, uav_id='UAV-1', initial_position=None):
        self.host = host
        self.port = port
        self.uav_id = uav_id
        self.uav = UAVSimulator(uav_id, initial_position)
        self.websocket = None
        self.running = False

    async def connect_to_backend(self):
        """Connect to backend server"""
        import os
        backend_url = os.getenv('BACKEND_URL', f'ws://backend:3001/ws/simulator?id={self.uav_id}')
        
        while True:
            try:
                print(f"Connecting to backend at {backend_url}...")
                async with websockets.connect(backend_url) as websocket:
                    self.websocket = websocket
                    self.running = True
                    print("Connected to backend!")
                    
                    # Start physics update loop
                    physics_task = asyncio.create_task(self.physics_loop())
                    
                    # Handle incoming messages
                    try:
                        async for message in websocket:
                            await self.handle_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        print("Connection closed by backend")
                    finally:
                        self.running = False
                        physics_task.cancel()
                        
            except Exception as e:
                print(f"Connection error: {e}")
                print("Retrying in 3 seconds...")
                await asyncio.sleep(3)
    
    async def handle_message(self, message):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            print(f"Received command: {data.get('command')}")
            
            if data.get('type') == 'command':
                response = self.uav.handle_command(data)
                await self.send_message(response)
                
        except json.JSONDecodeError as e:
            print(f"Error parsing message: {e}")
    
    async def send_message(self, data):
        """Send message to backend"""
        if self.websocket and not self.websocket.closed:
            try:
                await self.websocket.send(json.dumps(data))
            except Exception as e:
                print(f"Error sending message: {e}")
    
    async def physics_loop(self):
        """Main physics simulation loop"""
        print("Physics simulation started")
        
        while self.running:
            current_time = time.time()
            dt = current_time - self.uav.last_update
            self.uav.last_update = current_time
            
            # Update physics
            self.uav.update_physics(dt)
            
            # Send state update
            state = self.uav.get_state()
            await self.send_message(state)
            
            # Update at 20 Hz
            await asyncio.sleep(0.05)
    
    async def run(self):
        """Run the simulator server"""
        print(f"UAV Simulator starting...")
        print(f"Waiting to connect to backend...")
        await self.connect_to_backend()

if __name__ == "__main__":
    import os

    # Get UAV ID and initial position from environment
    uav_id = os.getenv('UAV_ID', 'UAV-1')

    # Default positions for each HORNET
    initial_positions = {
        'HORNET-1': {'x': 0.0, 'y': 0.0, 'z': 0.0},
        'HORNET-2': {'x': 20.0, 'y': 20.0, 'z': 0.0},
        'HORNET-3': {'x': 40.0, 'y': 0.0, 'z': 0.0},
        'HORNET-4': {'x': 20.0, 'y': -20.0, 'z': 0.0},
        'HORNET-5': {'x': -20.0, 'y': -20.0, 'z': 0.0},
        'HORNET-6': {'x': -20.0, 'y': 20.0, 'z': 0.0},
        'HORNET-7': {'x': -100.0, 'y': 100.0, 'z': 0.0},
        'HORNET-8': {'x': -80.0, 'y': 120.0, 'z': 0.0},
        'HORNET-9': {'x': -60.0, 'y': 100.0, 'z': 0.0},
        'HORNET-10': {'x': -80.0, 'y': 80.0, 'z': 0.0},
        'HORNET-11': {'x': -120.0, 'y': 80.0, 'z': 0.0},
        'HORNET-12': {'x': -120.0, 'y': 120.0, 'z': 0.0}
    }

    initial_position = initial_positions.get(uav_id, {'x': 0.0, 'y': 0.0, 'z': 0.0})

    print(f"Starting simulator for {uav_id} at position {initial_position}")
    simulator = SimulatorServer(uav_id=uav_id, initial_position=initial_position)
    asyncio.run(simulator.run())
