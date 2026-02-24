import osmnx as ox
import networkx as nx
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
import h3  # Uber's Spatial Index

print("Loading Bangalore street network (Koramangala)...")
# Download the drive network around Koramangala
koramangala_coords = (12.9352, 77.6245)
G = ox.graph_from_point(koramangala_coords, dist=3000, network_type='drive')
print("Map loaded successfully.")

# Load Models
models_loaded = False
try:
    xgb_model = joblib.load('models/xgb_model.pkl')
    lgb_model = joblib.load('models/lgb_model.pkl')
    rf_model = joblib.load('models/rf_model.pkl')
    
    source_encoder = joblib.load('models/source_encoding.pkl')
    dest_encoder = joblib.load('models/dest_encoding.pkl')
    
    global_source_avg = source_encoder.mean()
    global_dest_avg = dest_encoder.mean()
    models_loaded = True
    print("Ensemble models loaded successfully.")
except FileNotFoundError as e:
    print(f"Warning: ML models not found. {e}")

# Define H3 Resolution for street-level accuracy
H3_RESOLUTION = 9 

def get_optimal_route(start_lat, start_lon, end_lat, end_lon):
    try:
        # 1. Convert User GPS to H3 Hexagons (This is the flex for the resume)
        start_hex = h3.latlng_to_cell(start_lat, start_lon, H3_RESOLUTION)
        end_hex = h3.latlng_to_cell(end_lat, end_lon, H3_RESOLUTION)
        print(f"Routing from Hex: {start_hex} to Hex: {end_hex}")

        # 2. Map GPS to OpenStreetMap Nodes
        orig_node = ox.distance.nearest_nodes(G, X=start_lon, Y=start_lat)
        dest_node = ox.distance.nearest_nodes(G, X=end_lon, Y=end_lat)
        
        # 3. Real-Time Time Features
        current_hour = datetime.now().hour
        hod_sin = np.sin(2 * np.pi * current_hour / 24)
        hod_cos = np.cos(2 * np.pi * current_hour / 24)

        # 4. Apply H3-Aware Weights to the Graph
        for u, v, key, data in G.edges(keys=True, data=True):
            physical_length = data.get('length', 100)
            
            if models_loaded:
                # Find the coordinates of this specific road segment
                road_lat = G.nodes[u]['y']
                road_lon = G.nodes[u]['x']
                
                # Convert this road segment into its H3 Hexagon
                road_hex = h3.latlng_to_cell(road_lat, road_lon, H3_RESOLUTION)
                
                # In a fully scaled system, you map 'road_hex' to its historical traffic.
                # Here we feed the dynamic time features to the models.
                features = pd.DataFrame({
                    'hod_sin': [hod_sin],
                    'hod_cos': [hod_cos],
                    'source_avg_time': [global_source_avg], # Fallback until Hex-to-Zone mapping is built
                    'dest_avg_time': [global_dest_avg]
                })
                
                pred_xgb = xgb_model.predict(features)[0]
                pred_lgb = lgb_model.predict(features)[0]
                pred_rf = rf_model.predict(features)[0]
                
                ensemble_prediction = (0.20 * pred_xgb) + (0.20 * pred_lgb) + (0.60 * pred_rf)
                speed_multiplier = global_source_avg / max(ensemble_prediction, 1)
                speed_multiplier = max(0.1, min(1.0, speed_multiplier))
            else:
                speed_multiplier = 1.0 
                
            data['effective_length'] = physical_length / speed_multiplier

        # 5. Execute Dijkstra's Algorithm
        route = nx.shortest_path(G, orig_node, dest_node, weight='effective_length')
        route_length = nx.shortest_path_length(G, orig_node, dest_node, weight='effective_length')
        
        route_coords = [[G.nodes[node]['y'], G.nodes[node]['x']] for node in route]
        
        return {
            "status": "success", 
            "eta_score": round(route_length, 2),
            "start_hex": start_hex, # Return the Hex ID to the frontend
            "end_hex": end_hex,
            "waypoints_count": len(route_coords),
            "route_coords": route_coords
        }
        
    except nx.NetworkXNoPath:
        return {"status": "error", "message": "No path found between these points."}
    except Exception as e:
        return {"status": "error", "message": str(e)}