# src/worker.py
from celery import Celery
import time
from src.matcher import get_optimal_route
from src.models import SessionLocal, Ride

# Initialize Celery pointing to Docker Redis
celery_app = Celery(
    "uber_tasks",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

@celery_app.task(bind=True)
def process_ml_route(self, ride_id: int, start_lat: float, start_lon: float, end_lat: float, end_lon: float, hour: int):
    db = SessionLocal()
    try:
        # 1. Run the heavy ML/Graph logic
        result = get_optimal_route(start_lat, start_lon, end_lat, end_lon, hour)
        
        # SAFETY CHECK: Prevent silent failures!
        if result.get("status") == "error":
            raise Exception(f"ML Engine Failed: {result.get('message')}")
            
        # 2. Update the database safely
        ride = db.query(Ride).filter(Ride.id == ride_id).first()
        if ride:
            ride.distance_km = result.get("distance_km")
            ride.eta_minutes = result.get("eta_minutes")
            
            coords = result.get("route_coords", [])
            if coords:
                # PostGIS requires WKT Format: LINESTRING(lon lat, lon lat)
                wkt_coords = ", ".join([f"{lon} {lat}" for lat, lon in coords])
                ride.route_geometry = f"LINESTRING({wkt_coords})"
            
            ride.status = "completed"
            db.commit()
            
        return {"ride_id": ride_id, "status": "success"}
        
    except Exception as e:
        db.rollback()
        ride = db.query(Ride).filter(Ride.id == ride_id).first()
        if ride:
            ride.status = "failed"
            db.commit()
        print(f"\n❌ CELERY WORKER FAILED: {str(e)} ❌\n")
        return {"ride_id": ride_id, "status": "failed", "error": str(e)}
    finally:
        db.close()