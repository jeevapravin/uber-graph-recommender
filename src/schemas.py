"""
schemas.py — Pydantic v2 request/response models.
Strict typing here prevents an entire class of runtime bugs.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
from models import VehicleType, RideStatus


# ─────────────────────────── AUTH ───────────────────────────────────────────

class UserRegister(BaseModel):
    email:    EmailStr
    phone:    Optional[str] = None
    name:     str = Field(..., min_length=2, max_length=120)
    password: str = Field(..., min_length=8)


class DriverRegister(BaseModel):
    email:         EmailStr
    phone:         Optional[str] = None
    name:          str = Field(..., min_length=2, max_length=120)
    password:      str = Field(..., min_length=8)
    vehicle_type:  VehicleType
    vehicle_plate: str = Field(..., min_length=4, max_length=20)
    vehicle_model: Optional[str] = None


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str   # "rider" | "driver"
    user_id:      str
    name:         str


# ─────────────────────────── DRIVER ─────────────────────────────────────────

class DriverLocationUpdate(BaseModel):
    lat: float = Field(..., ge=-90,  le=90)
    lng: float = Field(..., ge=-180, le=180)


class DriverPublic(BaseModel):
    id:            UUID
    name:          str
    vehicle_type:  VehicleType
    vehicle_plate: str
    vehicle_model: Optional[str]
    rating:        float
    lat:           Optional[float]
    lng:           Optional[float]
    h3_index:      Optional[str]
    is_available:  bool

    model_config = {"from_attributes": True}


# ─────────────────────────── MATCHING ───────────────────────────────────────

class MatchRequest(BaseModel):
    pickup_lat:    float = Field(..., ge=-90,  le=90)
    pickup_lng:    float = Field(..., ge=-180, le=180)
    dropoff_lat:   float = Field(..., ge=-90,  le=90)
    dropoff_lng:   float = Field(..., ge=-180, le=180)
    vehicle_type:  VehicleType


class MatchResponse(BaseModel):
    drivers:        List[DriverPublic]
    pickup_h3:      str
    searched_rings: int
    route:          Optional[RouteInfo] = None
    estimated_fare: Optional[float]    = None


class RouteInfo(BaseModel):
    polyline:    str
    distance_km: float
    duration_min: float


# ─────────────────────────── RIDE ───────────────────────────────────────────

class RideRequest(BaseModel):
    driver_id:      UUID
    pickup_lat:     float
    pickup_lng:     float
    pickup_address: Optional[str] = None
    dropoff_lat:    float
    dropoff_lng:    float
    dropoff_address: Optional[str] = None
    vehicle_type:   VehicleType
    polyline:       Optional[str] = None
    distance_km:    Optional[float] = None
    duration_min:   Optional[float] = None
    estimated_fare: Optional[float] = None


class CancelRideRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=512)


class RideStatusUpdate(BaseModel):
    status: RideStatus


class RatingRequest(BaseModel):
    rating: float = Field(..., ge=1.0, le=5.0)
    review: Optional[str] = Field(None, max_length=512)


class RidePublic(BaseModel):
    id:               UUID
    status:           RideStatus
    pickup_lat:       float
    pickup_lng:       float
    pickup_address:   Optional[str]
    dropoff_lat:      float
    dropoff_lng:      float
    dropoff_address:  Optional[str]
    vehicle_type:     VehicleType
    polyline:         Optional[str]
    distance_km:      Optional[float]
    duration_min:     Optional[float]
    estimated_fare:   Optional[float]
    final_fare:       Optional[float]
    surge_multiplier: float
    cancellation_reason: Optional[str]
    cancelled_by:     Optional[str]
    requested_at:     datetime
    accepted_at:      Optional[datetime]
    completed_at:     Optional[datetime]
    cancelled_at:     Optional[datetime]
    driver:           Optional[DriverPublic]

    model_config = {"from_attributes": True}


# Fix forward reference
MatchResponse.model_rebuild()