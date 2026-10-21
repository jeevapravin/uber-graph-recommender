"""
main.py — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from auth_router import router as auth_router
from matcher import router as match_router
from rides import router as rides_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    print("✅ Database tables initialized")
    yield
    # Shutdown (add cleanup here if needed)
    print("🛑 Shutting down")


import os
from typing import List
from pydantic import BaseModel
from fastapi.responses import FileResponse, HTMLResponse
from ml_engine import get_optimal_route

app = FastAPI(
    title="UberClone API",
    version="1.0.0",
    description="Production-grade ride-hailing API with H3 spatial matching",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(match_router)
app.include_router(rides_router)


class RouteRequest(BaseModel):
    start_coords: List[float]
    end_coords: List[float]
    hour: int = 12


@app.post("/api/route")
async def calculate_route(payload: RouteRequest):
    return get_optimal_route(
        start_lat=payload.start_coords[0],
        start_lon=payload.start_coords[1],
        end_lat=payload.end_coords[0],
        end_lon=payload.end_coords[1],
        hour=payload.hour,
    )


@app.get("/demo")
async def demo():
    index_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Demo not found</h1>")


@app.get("/health")
async def health():
    return {"status": "ok"}