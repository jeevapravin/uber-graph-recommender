# src/app.py
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import asyncio
import json
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

# Local imports
from src.models import SessionLocal, Ride
from src.worker import process_ml_route

app = FastAPI(title="Uber ETA Routing API - Production Grade", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class RouteRequest(BaseModel):
    start_coords: List[float]
    end_coords: List[float]
    hour: Optional[int] = None

# --- REST API ENDPOINTS ---

@app.post("/api/route", status_code=202)
async def request_route(request: RouteRequest, db: Session = Depends(get_db)):
    try:
        start_lat, start_lon = request.start_coords
        end_lat, end_lon = request.end_coords
        
        new_ride = Ride(
            pickup_location=f"POINT({start_lon} {start_lat})",
            dropoff_location=f"POINT({end_lon} {end_lat})",
            status="processing",
            created_at=datetime.utcnow()
        )
        db.add(new_ride)
        db.commit()
        db.refresh(new_ride)
        
        process_ml_route.delay(
            new_ride.id, start_lat, start_lon, end_lat, end_lon, request.hour or 12
        )
        
        return {"message": "Route queued", "ride_id": new_ride.id, "status": "processing"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/route/{ride_id}")
async def get_route_status(ride_id: int, db: Session = Depends(get_db)):
    ride = db.query(
        Ride.id, Ride.status, Ride.eta_minutes, Ride.distance_km, 
        func.ST_AsGeoJSON(Ride.route_geometry).label('geojson')
    ).filter(Ride.id == ride_id).first()
    
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
        
    route_coords = []
    if ride.geojson:
        geom = json.loads(ride.geojson)
        route_coords = [[coord[1], coord[0]] for coord in geom['coordinates']]

    return {
        "ride_id": ride.id, 
        "status": ride.status, 
        "eta": ride.eta_minutes, 
        "distance": ride.distance_km,
        "route_coords": route_coords
    }

@app.get("/api/history")
async def get_ride_history(db: Session = Depends(get_db)):
    try:
        # Explicitly select non-geometry columns to prevent JSON serialization crash
        rides = db.query(
            Ride.id, 
            Ride.status, 
            Ride.distance_km, 
            Ride.eta_minutes, 
            Ride.created_at
        ).order_by(Ride.id.desc()).limit(50).all()
        
        history_list = []
        for r in rides:
            history_list.append({
                "id": r.id,
                "status": r.status,
                "distance_km": r.distance_km,
                "eta_minutes": r.eta_minutes,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return history_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- WEBSOCKETS ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except RuntimeError:
                self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/ws/drivers")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            import random
            base_lat, base_lon = 12.9352, 77.6245
            drivers_data = [
                {"id": 1, "lat": base_lat + random.uniform(-0.01, 0.01), "lng": base_lon + random.uniform(-0.01, 0.01)},
                {"id": 2, "lat": base_lat + random.uniform(-0.01, 0.01), "lng": base_lon + random.uniform(-0.01, 0.01)},
            ]
            await manager.broadcast(json.dumps({"type": "DRIVER_LOCATIONS", "data": drivers_data}))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run("src.app:app", host="0.0.0.0", port=8000, reload=True)