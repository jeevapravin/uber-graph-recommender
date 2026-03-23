"""
matcher.py — H3 Spatial Matching Engine

Architecture:
  1. Convert pickup (lat, lng) → H3 index at resolution 9
  2. Get k_ring(center, radius) — a set of adjacent hexagons
  3. Query drivers WHERE h3_index IN (...rings) AND is_available AND vehicle_type
  4. Adaptive expansion: if 0 results at k=2, retry at k=3 (up to k=4)
  5. Fetch OSRM route for fare estimation

Why H3 over raw geo queries:
  - PostGIS ST_DWithin still requires a geometry column + GiST index
  - H3 string IN-query uses a plain B-Tree index → faster for our write-heavy use case
  - H3 buckets equalize search area regardless of lat/lng distortion
"""
import asyncio
import httpx
import h3
from typing import List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from database import get_db
from models import Driver, VehicleType
from schemas import MatchRequest, MatchResponse, DriverPublic, RouteInfo
from auth import get_current_user, get_current_driver
from config import get_settings

settings = get_settings()
router = APIRouter(prefix="/match", tags=["Matching"])

# ─────────────────────────── OSRM Route Fetch ───────────────────────────────

async def fetch_osrm_route(
    pickup: Tuple[float, float],
    dropoff: Tuple[float, float],
) -> Optional[RouteInfo]:
    """
    Hits the OSRM /route/v1/driving endpoint.
    Returns encoded polyline, distance in km, duration in minutes.
    Falls back to None on network error — never let routing block matching.
    """
    olat, olng = pickup
    dlat, dlng = dropoff
    url = (
        f"{settings.OSRM_BASE_URL}/route/v1/driving/"
        f"{olng},{olat};{dlng},{dlat}"
        f"?overview=full&geometries=polyline&steps=false"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") != "Ok" or not data.get("routes"):
                return None
            route = data["routes"][0]
            return RouteInfo(
                polyline=route["geometry"],
                distance_km=round(route["distance"] / 1000, 2),
                duration_min=round(route["duration"] / 60, 2),
            )
    except Exception:
        return None   # Non-blocking fallback


# ─────────────────────────── Fare Calculation ───────────────────────────────

def calculate_fare(
    vehicle_type: VehicleType,
    distance_km: float,
    duration_min: float,
    surge: float = 1.0,
) -> float:
    cfg = settings.FARE_BASE[vehicle_type.value]
    raw = cfg["base"] + (cfg["per_km"] * distance_km) + (cfg["per_min"] * duration_min)
    return round(raw * surge, 2)


# ─────────────────────────── Adaptive H3 Matching ───────────────────────────

async def find_drivers_adaptive(
    db: AsyncSession,
    pickup_h3: str,
    vehicle_type: VehicleType,
    min_k: int = 2,
    max_k: int = 4,
    limit: int = 20,
) -> Tuple[List[Driver], int]:
    """
    Adaptive ring expansion.
    Tries k=min_k first. If empty, expands to k+1 up to max_k.
    Returns (drivers, ring_used).
    """
    for k in range(min_k, max_k + 1):
        # h3.grid_disk (formerly k_ring) — set of hex IDs within k rings
        hex_ring: set = h3.grid_disk(pickup_h3, k)

        result = await db.execute(
            select(Driver).where(
                and_(
                    Driver.h3_index.in_(hex_ring),
                    Driver.is_available == True,
                    Driver.vehicle_type == vehicle_type,
                    Driver.is_active == True,
                )
            ).order_by(Driver.rating.desc()).limit(limit)
        )
        drivers = result.scalars().all()

        if drivers:
            return drivers, k

    return [], max_k


# ─────────────────────────── Match Endpoint ─────────────────────────────────

@router.post("/", response_model=MatchResponse)
async def match_drivers(
    payload: MatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # 1. Convert pickup to H3 index at configured resolution
    pickup_h3 = h3.latlng_to_cell(
        payload.pickup_lat,
        payload.pickup_lng,
        settings.H3_RESOLUTION,
    )

    # 2. Run OSRM route fetch and driver spatial query concurrently
    drivers_task = find_drivers_adaptive(
        db, pickup_h3, payload.vehicle_type
    )
    route_task = fetch_osrm_route(
        (payload.pickup_lat, payload.pickup_lng),
        (payload.dropoff_lat, payload.dropoff_lng),
    )

    (drivers, rings_used), route = await asyncio.gather(drivers_task, route_task)

    # 3. Fare estimation
    fare = None
    if route:
        fare = calculate_fare(payload.vehicle_type, route.distance_km, route.duration_min)

    return MatchResponse(
        drivers=[DriverPublic.model_validate(d) for d in drivers],
        pickup_h3=pickup_h3,
        searched_rings=rings_used,
        route=route,
        estimated_fare=fare,
    )


# ─────────────────────────── Driver Location Update ─────────────────────────

@router.patch("/driver/location", tags=["Driver"])
async def update_driver_location(
    lat: float,
    lng: float,
    db: AsyncSession = Depends(get_db),
    driver=Depends(get_current_driver),
):
    """
    Called by driver app every ~5 seconds.
    Recalculates H3 index on each update — this is what keeps
    the spatial index fresh. Without this, your whole H3 system is a lie.
    """
    from auth import get_current_driver  # avoid circular at module level

    new_h3 = h3.latlng_to_cell(lat, lng, settings.H3_RESOLUTION)
    driver.lat      = lat
    driver.lng      = lng
    driver.h3_index = new_h3
    await db.commit()
    return {"h3_index": new_h3}