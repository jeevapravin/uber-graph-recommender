import osmnx as ox
import networkx as nx

def build_city_graph(location_name):
    print(f"Fetching road network for {location_name}...")
    # This downloads the 'driving' roads as a Directed Graph
    graph = ox.graph_from_address(location_name, dist=1500, network_type='drive')
    
    # Save the graph so we don't have to download it every time
    ox.save_graphml(graph, filepath="./data/chennai_graph.graphml")
    print("Graph saved to ./data/chennai_graph.graphml")
    return graph

if __name__ == "__main__":
    # You can change this to your specific college area or neighborhood
    my_area = "Adyar, Chennai, India"
    city_graph = build_city_graph(my_area)
    
    # Print some stats to prove it works
    print(f"Nodes (Intersections): {len(city_graph.nodes)}")
    print(f"Edges (Roads): {len(city_graph.edges)}")