"""
models.py — Production SQLAlchemy ORM Models
Composite indexes are CRITICAL here. A naive single-column index on h3_index
still forces Postgres to do a second lookup for is_available and vehicle_type.
The composite index (h3_index, is_available, vehicle_type) makes matching O(1).
"""
import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, String, Float, Boolean, DateTime,
    Enum as SAEnum, Index, ForeignKey, Integer, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped

from database import Base


# ─────────────────────────── ENUMS ──────────────────────────────────────────

class VehicleType(str, enum.Enum):
    MOTO   = "Moto"
    UBERX  = "UberX"
    UBERXL = "UberXL"


class RideStatus(str, enum.Enum):
    REQUESTED       = "requested"
    ACCEPTED        = "accepted"
    DRIVER_ARRIVED  = "driver_arrived"
    IN_PROGRESS     = "in_progress"
    COMPLETED       = "completed"
    CANCELLED_RIDER  = "cancelled_rider"
    CANCELLED_DRIVER = "cancelled_driver"


# ─────────────────────────── USER ───────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    phone           = Column(String(20),  unique=True, nullable=True)
    name            = Column(String(120), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    profile_picture = Column(String(512), nullable=True)
    rating          = Column(Float, default=5.0, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rides = relationship("Ride", back_populates="rider", foreign_keys="Ride.rider_id")


# ─────────────────────────── DRIVER ─────────────────────────────────────────

class Driver(Base):
    __tablename__ = "drivers"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    phone           = Column(String(20),  unique=True, nullable=True)
    name            = Column(String(120), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    profile_picture = Column(String(512), nullable=True)

    # Vehicle
    vehicle_type    = Column(SAEnum(VehicleType), nullable=False)
    vehicle_plate   = Column(String(20),  nullable=False)
    vehicle_model   = Column(String(100), nullable=True)

    # Real-time spatial state
    is_available    = Column(Boolean, default=True,  nullable=False)
    lat             = Column(Float, nullable=True)
    lng             = Column(Float, nullable=True)
    # H3 Resolution 9 hex string — updated every time driver moves
    # VARCHAR(20) is enough: H3 r9 indexes are 15 hex chars
    h3_index        = Column(String(20), nullable=True)

    rating          = Column(Float, default=5.0, nullable=False)
    total_rides     = Column(Integer, default=0, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rides = relationship("Ride", back_populates="driver", foreign_keys="Ride.driver_id")

    # ── THIS IS THE INDEX THAT MAKES YOUR MATCHING ENGINE FAST ──────────────
    # Composite B-Tree index: Postgres can use this for queries that filter
    # on h3_index AND is_available AND vehicle_type simultaneously.
    # Without this, your WHERE clause does 3 sequential scans. With it: 1 index scan.
    __table_args__ = (
        Index(
            "ix_drivers_h3_available_vehicle",
            "h3_index",
            "is_available",
            "vehicle_type",
            postgresql_using="btree",
        ),
    )


# ─────────────────────────── RIDE ───────────────────────────────────────────

class Ride(Base):
    __tablename__ = "rides"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    rider_id         = Column(UUID(as_uuid=True), ForeignKey("users.id"),   nullable=False, index=True)
    driver_id        = Column(UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=True,  index=True)

    # Status machine
    status           = Column(SAEnum(RideStatus), default=RideStatus.REQUESTED, nullable=False, index=True)

    # Pickup
    pickup_lat       = Column(Float,       nullable=False)
    pickup_lng       = Column(Float,       nullable=False)
    pickup_address   = Column(String(512), nullable=True)
    pickup_h3        = Column(String(20),  nullable=True)   # H3 of pickup for analytics

    # Dropoff
    dropoff_lat      = Column(Float,       nullable=False)
    dropoff_lng      = Column(Float,       nullable=False)
    dropoff_address  = Column(String(512), nullable=True)

    # Route
    vehicle_type     = Column(SAEnum(VehicleType), nullable=False)
    polyline         = Column(Text,  nullable=True)   # OSRM encoded polyline
    distance_km      = Column(Float, nullable=True)
    duration_min     = Column(Float, nullable=True)

    # Fares
    estimated_fare   = Column(Float, nullable=True)
    final_fare       = Column(Float, nullable=True)
    surge_multiplier = Column(Float, default=1.0, nullable=False)

    # Cancellation
    cancellation_reason = Column(String(512), nullable=True)
    cancelled_by        = Column(String(10),  nullable=True)   # "rider" | "driver"

    # Timestamps
    requested_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    accepted_at      = Column(DateTime, nullable=True)
    arrived_at       = Column(DateTime, nullable=True)
    started_at       = Column(DateTime, nullable=True)
    completed_at     = Column(DateTime, nullable=True)
    cancelled_at     = Column(DateTime, nullable=True)

    # Ratings (post-ride)
    rider_rating     = Column(Float, nullable=True)   # rider rates driver
    driver_rating    = Column(Float, nullable=True)   # driver rates rider
    rider_review     = Column(String(512), nullable=True)

    rider  = relationship("User",   back_populates="rides", foreign_keys=[rider_id])
    driver = relationship("Driver", back_populates="rides", foreign_keys=[driver_id])