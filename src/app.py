from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import uvicorn
from src.matcher import get_optimal_route

app = FastAPI(title="Uber ETA Routing API", version="1.0")

# Define the expected incoming data structure
class RouteRequest(BaseModel):
    start_coords: List[float]  # [latitude, longitude]
    end_coords: List[float]    # [latitude, longitude]

@app.post("/api/route")
async def calculate_route(request: RouteRequest):
    try:
        start_lat, start_lon = request.start_coords
        end_lat, end_lon = request.end_coords
        
        # Call the core ML routing engine
        result = get_optimal_route(start_lat, start_lon, end_lat, end_lon)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=404, detail=result.get("message"))
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("Starting FastAPI Server on port 8000...")
    # uvicorn runs the server asynchronously
    uvicorn.run("src.app:app", host="0.0.0.0", port=8000, reload=True)
    