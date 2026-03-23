"""
rides.py — Full Ride Lifecycle Router

State machine:
  requested → accepted → driver_arrived → in_progress → completed
                                                       ↘ cancelled_rider
                       ↘ cancelled_driver              ↘ cancelled_driver
  ↘ cancelled_rider

Cancellation penalties:
  - Rider can cancel for free before driver accepts
  - After acceptance, business logic can add cancellation fee (not implemented here, but hooked)
"""
from datetime import datetime
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Ride, Driver, User, RideStatus, VehicleType
from schemas import RideRequest, CancelRideRequest, RidePublic, RatingRequest
from auth import get_current_user, get_current_driver
from websocket_manager import manager
from matcher import calculate_fare

router = APIRouter(prefix="/rides", tags=["Rides"])


# ─────────────────────────── WebSocket Rooms ────────────────────────────────

@router.websocket("/ws/ride/{ride_id}")
async def ride_websocket(ride_id: str, ws: WebSocket):
    """
    Both rider and driver connect here after ride is created.
    Client sends: { "event": "ping" } to keep connection alive.
    Server pushes: ride lifecycle events.
    """
    await manager.connect_to_ride(ride_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            # Handle client pings / driver location updates from rider-side
            # In production, validate JWT from query param ws://...?token=
    except WebSocketDisconnect:
        await manager.disconnect_from_ride(ride_id, ws)


@router.websocket("/ws/driver/{driver_id}")
async def driver_websocket(driver_id: str, ws: WebSocket):
    """
    Driver app connects here on startup.
    Receives incoming ride requests and general dispatch events.
    """
    await manager.connect_driver(driver_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            # Driver can send location updates through here too
            import json
            msg = json.loads(data)
            if msg.get("event") == "location_update":
                d = msg.get("data", {})
                # Forward to any active ride room for this driver
                # In production, look up driver's current active ride
    except WebSocketDisconnect:
        await manager.disconnect_driver(driver_id)


# ─────────────────────────── Create Ride ────────────────────────────────────

@router.post("/", response_model=RidePublic, status_code=status.HTTP_201_CREATED)
async def create_ride(
    payload: RideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify driver exists and is available
    result = await db.execute(select(Driver).where(Driver.id == payload.driver_id))
    driver = result.scalar_one_or_none()
    if not driver or not driver.is_available:
        raise HTTPException(status_code=409, detail="Driver no longer available")

    import h3
    from config import get_settings
    settings = get_settings()

    pickup_h3 = h3.latlng_to_cell(
        payload.pickup_lat, payload.pickup_lng, settings.H3_RESOLUTION
    )

    ride = Ride(
        rider_id=current_user.id,
        driver_id=driver.id,
        status=RideStatus.REQUESTED,
        pickup_lat=payload.pickup_lat,
        pickup_lng=payload.pickup_lng,
        pickup_address=payload.pickup_address,
        pickup_h3=pickup_h3,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
        dropoff_address=payload.dropoff_address,
        vehicle_type=payload.vehicle_type,
        polyline=payload.polyline,
        distance_km=payload.distance_km,
        duration_min=payload.duration_min,
        estimated_fare=payload.estimated_fare,
    )
    db.add(ride)

    # Lock driver
    driver.is_available = False
    await db.commit()
    await db.refresh(ride)

    # Notify driver via WebSocket
    await manager.emit_ride_requested(str(driver.id), {
        "ride_id":       str(ride.id),
        "rider_name":    current_user.name,
        "rider_rating":  current_user.rating,
        "pickup_lat":    ride.pickup_lat,
        "pickup_lng":    ride.pickup_lng,
        "pickup_address": ride.pickup_address,
        "dropoff_address": ride.dropoff_address,
        "estimated_fare": ride.estimated_fare,
        "vehicle_type":   ride.vehicle_type.value,
    })

    # Load relationship for response
    result = await db.execute(
        select(Ride).options(selectinload(Ride.driver)).where(Ride.id == ride.id)
    )
    return result.scalar_one()


# ─────────────────────────── Driver Accept ──────────────────────────────────

@router.patch("/{ride_id}/accept", response_model=RidePublic)
async def accept_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    driver: Driver = Depends(get_current_driver),
):
    result = await db.execute(
        select(Ride).options(selectinload(Ride.driver)).where(Ride.id == ride_id)
    )
    ride = result.scalar_one_or_none()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if str(ride.driver_id) != str(driver.id):
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.status != RideStatus.REQUESTED:
        raise HTTPException(status_code=409, detail=f"Cannot accept ride in status: {ride.status}")

    ride.status = RideStatus.ACCEPTED
    ride.accepted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(ride)

    await manager.emit_ride_accepted(str(ride_id), {
        "driver_name":   driver.name,
        "driver_rating": driver.rating,
        "vehicle_plate": driver.vehicle_plate,
        "vehicle_model": driver.vehicle_model,
        "driver_lat":    driver.lat,
        "driver_lng":    driver.lng,
    })
    return ride


# ─────────────────────────── Driver Arrived ─────────────────────────────────

@router.patch("/{ride_id}/arrived", response_model=RidePublic)
async def driver_arrived(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    driver: Driver = Depends(get_current_driver),
):
    ride = await _get_ride_for_driver(ride_id, driver, db)
    _assert_status(ride, RideStatus.ACCEPTED, "arrive")
    ride.status = RideStatus.DRIVER_ARRIVED
    ride.arrived_at = datetime.utcnow()
    await db.commit()
    await manager.emit_driver_arrived(str(ride_id))
    return ride


# ─────────────────────────── Start Ride ─────────────────────────────────────

@router.patch("/{ride_id}/start", response_model=RidePublic)
async def start_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    driver: Driver = Depends(get_current_driver),
):
    ride = await _get_ride_for_driver(ride_id, driver, db)
    _assert_status(ride, RideStatus.DRIVER_ARRIVED, "start")
    ride.status = RideStatus.IN_PROGRESS
    ride.started_at = datetime.utcnow()
    await db.commit()
    await manager.emit_ride_started(str(ride_id))
    return ride


# ─────────────────────────── Complete Ride ──────────────────────────────────

@router.patch("/{ride_id}/complete", response_model=RidePublic)
async def complete_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    driver: Driver = Depends(get_current_driver),
):
    ride = await _get_ride_for_driver(ride_id, driver, db)
    _assert_status(ride, RideStatus.IN_PROGRESS, "complete")

    # Calculate final fare (use estimated if no route data)
    final_fare = ride.estimated_fare
    if ride.distance_km and ride.duration_min:
        final_fare = calculate_fare(
            ride.vehicle_type, ride.distance_km, ride.duration_min, ride.surge_multiplier
        )

    ride.status = RideStatus.COMPLETED
    ride.completed_at = datetime.utcnow()
    ride.final_fare = final_fare

    # Free driver
    result = await db.execute(select(Driver).where(Driver.id == ride.driver_id))
    drv = result.scalar_one()
    drv.is_available = True
    drv.total_rides += 1

    await db.commit()
    await manager.emit_ride_completed(str(ride_id), final_fare)
    return ride


# ─────────────────────────── Cancel Ride (Rider) ────────────────────────────

@router.patch("/{ride_id}/cancel/rider", response_model=RidePublic)
async def cancel_ride_rider(
    ride_id: UUID,
    payload: CancelRideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Ride).options(selectinload(Ride.driver)).where(Ride.id == ride_id)
    )
    ride = result.scalar_one_or_none()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if str(ride.rider_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.status in (RideStatus.COMPLETED, RideStatus.CANCELLED_RIDER, RideStatus.CANCELLED_DRIVER):
        raise HTTPException(status_code=409, detail="Ride already ended")

    ride.status = RideStatus.CANCELLED_RIDER
    ride.cancelled_at = datetime.utcnow()
    ride.cancelled_by = "rider"
    ride.cancellation_reason = payload.reason

    # Free driver if one was assigned
    if ride.driver_id:
        result2 = await db.execute(select(Driver).where(Driver.id == ride.driver_id))
        drv = result2.scalar_one_or_none()
        if drv:
            drv.is_available = True

    await db.commit()
    await manager.emit_ride_cancelled(str(ride_id), "rider", payload.reason or "No reason given")
    return ride


# ─────────────────────────── Cancel Ride (Driver) ───────────────────────────

@router.patch("/{ride_id}/cancel/driver", response_model=RidePublic)
async def cancel_ride_driver(
    ride_id: UUID,
    payload: CancelRideRequest,
    db: AsyncSession = Depends(get_db),
    driver: Driver = Depends(get_current_driver),
):
    ride = await _get_ride_for_driver(ride_id, driver, db)
    if ride.status not in (RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED):
        raise HTTPException(status_code=409, detail="Cannot cancel at this stage")

    ride.status = RideStatus.CANCELLED_DRIVER
    ride.cancelled_at = datetime.utcnow()
    ride.cancelled_by = "driver"
    ride.cancellation_reason = payload.reason
    driver.is_available = True

    await db.commit()
    await manager.emit_ride_cancelled(str(ride_id), "driver", payload.reason or "No reason given")
    return ride


# ─────────────────────────── Rate Ride ──────────────────────────────────────

@router.post("/{ride_id}/rate", response_model=dict)
async def rate_ride(
    ride_id: UUID,
    payload: RatingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rider rates driver after ride completion."""
    result = await db.execute(
        select(Ride).options(selectinload(Ride.driver)).where(Ride.id == ride_id)
    )
    ride = result.scalar_one_or_none()
    if not ride or str(ride.rider_id) != str(current_user.id):
        raise HTTPException(status_code=404)
    if ride.status != RideStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Can only rate completed rides")
    if ride.rider_rating:
        raise HTTPException(status_code=409, detail="Already rated")

    ride.rider_rating = payload.rating
    ride.rider_review = payload.review

    # Update driver rolling average
    drv = ride.driver
    drv.rating = round(
        (drv.rating * drv.total_rides + payload.rating) / (drv.total_rides + 1), 2
    )
    await db.commit()
    return {"message": "Rating submitted"}


# ─────────────────────────── Ride History ───────────────────────────────────

@router.get("/history", response_model=list[RidePublic])
async def ride_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0,
):
    result = await db.execute(
        select(Ride)
        .options(selectinload(Ride.driver))
        .where(Ride.rider_id == current_user.id)
        .order_by(Ride.requested_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


# ─────────────────────────── Helpers ────────────────────────────────────────

async def _get_ride_for_driver(ride_id: UUID, driver: Driver, db: AsyncSession) -> Ride:
    result = await db.execute(
        select(Ride).options(selectinload(Ride.driver)).where(Ride.id == ride_id)
    )
    ride = result.scalar_one_or_none()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if str(ride.driver_id) != str(driver.id):
        raise HTTPException(status_code=403, detail="Not your ride")
    return ride


def _assert_status(ride: Ride, required: RideStatus, action: str):
    if ride.status != required:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot {action} a ride with status: {ride.status.value}",
        )