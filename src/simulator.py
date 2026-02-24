import requests
import time

URL = "http://127.0.0.1:8000/api/route"

trips = [
    {
        "name": "Trip 1: Forum Mall to Sony World Signal",
        "payload": {
            "start_coords": [12.9345, 77.6112],
            "end_coords": [12.9421, 77.6256]
        }
    },
    {
        "name": "Trip 2: Wipro Park to JNC",
        "payload": {
            "start_coords": [12.9312, 77.6289],
            "end_coords": [12.9348, 77.6165]
        }
    }
]

print("Starting FastAPI simulation tests...\n")

for trip in trips:
    print(f"Requesting {trip['name']}...")
    try:
        response = requests.post(URL, json=trip['payload'])
        
        if response.status_code == 200:
            data = response.json()
            print("SUCCESS: Route calculated.")
            print(f"ETA Score: {data['eta_score']}")
            print(f"Total Waypoints: {data['waypoints_count']}\n")
        else:
            print(f"FAILED: Server returned {response.status_code}")
            print(f"Error Details: {response.text}\n")
            
    except requests.exceptions.ConnectionError:
        print("ERROR: Could not connect. Is app.py running on port 8000?\n")
    
    time.sleep(1)