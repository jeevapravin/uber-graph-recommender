import networkx as nx
import osmnx as ox
import random
import h3
import pandas as pd

def simulate_drivers(graph, num_drivers=50):
    # 1. Get a list of all nodes (intersections) in your Chennai map
    nodes = list(graph.nodes)
    
    drivers = []
    for i in range(num_drivers):
        # 2. Pick a random intersection to place the driver
        node_id = random.choice(nodes)
        
        # 3. Extract the exact GPS coordinates of that intersection
        lon = graph.nodes[node_id]['x']
        lat = graph.nodes[node_id]['y']
        
        # 4. The Uber Magic: Convert Lat/Lon into an H3 Hexagon ID (Resolution 9)
        hex_id = h3.latlng_to_cell(lat, lon, 9)
        
        # 5. Store the driver's data
        drivers.append({
            "driver_id": f"driver_{i+1}",
            "node_id": node_id,
            "lat": lat,
            "lon": lon,
            "h3_id": hex_id,
            "status": "available"
        })
        
    # Convert the list into a Pandas DataFrame for easy saving
    return pd.DataFrame(drivers)

if __name__ == "__main__":
    print("Loading city graph...")
    # Load the graph we generated in Part 1
    G = ox.load_graphml("./data/chennai_graph.graphml")
    
    print("Simulating driver locations...")
    driver_df = simulate_drivers(G, num_drivers=50)
    
    # Save the data to a CSV file
    driver_df.to_csv("./data/drivers.csv", index=False)
    print("Successfully saved 50 drivers to ./data/drivers.csv")
    
    # Print a preview
    print(driver_df[['driver_id', 'h3_id', 'node_id']].head())