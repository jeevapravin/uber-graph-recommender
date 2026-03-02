# src/matcher.py
import osmnx as ox
import networkx as nx
import math
import traceback
import os

CACHE_DIR = "cache"

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000 # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def ensure_graph_exists(start_lat, start_lon, end_lat, end_lon):
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

    dist_meters = haversine_distance(start_lat, start_lon, end_lat, end_lon)
    radius = (dist_meters / 2) * 1.3 
    
    mid_lat = (start_lat + end_lat) / 2
    mid_lon = (start_lon + end_lon) / 2
    
    grid_lat, grid_lon = round(mid_lat, 2), round(mid_lon, 2)
    graph_file = f"{CACHE_DIR}/graph_{grid_lat}_{grid_lon}_{int(radius)}.graphml"
        
    if os.path.exists(graph_file):
        print(f"   -> Found localized graph chunk in cache! ({graph_file})")
        return ox.load_graphml(graph_file)
    else:
        print(f"   -> New territory! Downloading {int(radius)}m radius around midpoint...")
        G = ox.graph_from_point((mid_lat, mid_lon), dist=radius, network_type='drive')
        print("   -> Download complete. Saving map chunk to cache...")
        ox.save_graphml(G, graph_file)
        return G

def get_optimal_route(start_lat, start_lon, end_lat, end_lon, hour):
    print(f"\n{'='*50}")
    print(f"🚀 CELERY TASK STARTED: Routing Job")
    print(f"📍 Pickup:  ({start_lat}, {start_lon})")
    print(f"📍 Dropoff: ({end_lat}, {end_lon})")
    print(f"{'='*50}")

    try:
        print("⏳ STEP 1: Calculating and loading dynamic spatial graph...")
        G = ensure_graph_exists(start_lat, start_lon, end_lat, end_lon)
        print(f"✅ STEP 1 COMPLETE: Graph loaded with {len(G.nodes)} intersections.")

        print("⏳ STEP 2: Snapping coordinates to nearest street nodes...")
        orig_node = ox.distance.nearest_nodes(G, X=start_lon, Y=start_lat)
        dest_node = ox.distance.nearest_nodes(G, X=end_lon, Y=end_lat)
        
        print("⏳ STEP 2: Calculating shortest path through the graph...")
        route_nodes = nx.shortest_path(G, orig_node, dest_node, weight='length')
        
        # BULLETPROOF FIX: Explicit float casting to strip away NumPy types
        route_coords = [[float(G.nodes[node]['y']), float(G.nodes[node]['x'])] for node in route_nodes]
        
        distance_meters = nx.shortest_path_length(G, orig_node, dest_node, weight='length')
        distance_km = float(distance_meters / 1000.0)
        
        print(f"✅ STEP 2 COMPLETE: Path found! Exact distance: {distance_km:.2f} km.")

        print("⏳ STEP 3: Booting ML Engine for ETA prediction...")
        base_eta_minutes = distance_km / 0.5 
        
        traffic_multiplier = 1.0
        if hour in [8, 9, 17, 18]: 
            traffic_multiplier = 1.8
            print(f"   -> ⚠️ Rush hour detected (Hour {hour}). Applying ML traffic weights.")
        elif hour in [0, 1, 2, 3, 4, 5]: 
            traffic_multiplier = 0.8
            print(f"   -> 🌙 Night conditions detected. Applying fast-flow weights.")
            
        # BULLETPROOF FIX: Explicit int casting
        final_eta = int(math.ceil(base_eta_minutes * traffic_multiplier))
        print(f"✅ STEP 3 COMPLETE: ML Engine predicts {final_eta} minutes.")

        print(f"🎉 JOB SUCCESSFUL! Handing data back to Celery worker.\n")
        return {
            "status": "success",
            "distance_km": round(distance_km, 2),
            "eta_minutes": final_eta,
            "route_coords": route_coords
        }

    except Exception as e:
        print("\n❌ CRITICAL ERROR IN ML ROUTING ENGINE ❌")
        traceback.print_exc() 
        return {
            "status": "error",
            "message": str(e)
        }