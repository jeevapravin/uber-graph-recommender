import requests
from config import get_settings

settings = get_settings()

def get_optimal_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float, hour: int) -> dict:
    """
    Synchronous ML and Routing Engine logic for the Celery Worker.
    Fetches exact routes from OSRM and runs an ETA Prediction model.
    """
    url = (
        f"{settings.OSRM_BASE_URL}/route/v1/driving/"
        f"{start_lon},{start_lat};{end_lon},{end_lat}"
        f"?overview=full&geometries=geojson&steps=false"
    )
    
    try:
        resp = requests.get(url, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        
        if data.get("code") != "Ok" or not data.get("routes"):
            return {"status": "error", "message": "OSRM routing failed to find a valid route."}
            
        route = data["routes"][0]
        
        # OSRM returns duration in seconds, distance in meters
        distance_km = round(route["distance"] / 1000.0, 2)
        osrm_eta_min = route["duration"] / 60.0
        
        # ─────────────────────────────────────────────────────────────────
        # [PLACEHOLDER] Machine Learning ETA Engine
        # In a real production system, you would load your cached XGBoost model
        # and feed it features: [distance_km, hour, day_of_week, start_lat...]
        # and let it predict the final ETA.
        # Here we simulate an ML adjustment:
        # ─────────────────────────────────────────────────────────────────
        ml_eta_prediction = round(osrm_eta_min * 1.15, 2)  # Simulated 15% traffic addition
        
        # Route geometry (list of [lon, lat])
        # GeoJSON LineString coordinates are [lon, lat]
        coordinates = route["geometry"]["coordinates"]
        
        # PostGIS requires WKT: LINESTRING(lon lat, lon lat, ...)
        # The worker.py expects a list of tuples, but since GeoJSON gives [lon, lat],
        # let's return it exactly how worker expects to build its WKT.
        # Worker expects route_coords elements returning (lat, lon) or (lon, lat).
        # We will standardize on a list of `(lon, lat)` to easily convert to WKT string.
        
        route_coords = coordinates # list of [lon, lat]

        return {
            "status": "success",
            "distance_km": distance_km,
            "eta_minutes": ml_eta_prediction,
            "route_coords": route_coords
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}
