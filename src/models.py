# src/models.py
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Enum
from sqlalchemy.orm import declarative_base, sessionmaker
from geoalchemy2 import Geometry
from datetime import datetime
import os

from dotenv import load_dotenv
import os

load_dotenv()

# Ensure you have your Supabase URL in your environment variables
# Note: You MUST enable the PostGIS extension in your Supabase SQL editor: `CREATE EXTENSION postgis;`
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Driver(Base):
    __tablename__ = "drivers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    vehicle_type = Column(Enum('UberX', 'Moto', 'UberXL', name='vehicle_types'), default='UberX')
    status = Column(Enum('available', 'on_trip', name='driver_statuses'), default='available')
    # The game-changer: A spatial column with a GiST index
    location = Column(Geometry(geometry_type='POINT', srid=4326), index=True)
    h3_index = Column(String, index=True)
    last_updated = Column(DateTime, default=datetime.utcnow)

# src/models.py (Snippet to update)
class Ride(Base):
    __tablename__ = "rides"
    
    id = Column(Integer, primary_key=True, index=True)
    pickup_location = Column(Geometry(geometry_type='POINT', srid=4326))
    dropoff_location = Column(Geometry(geometry_type='POINT', srid=4326))
    
    # NEW: Store the actual route path as a spatial LineString
    route_geometry = Column(Geometry(geometry_type='LINESTRING', srid=4326), nullable=True)
    
    distance_km = Column(Float, nullable=True)
    eta_minutes = Column(Float, nullable=True)
    status = Column(String, default="processing")
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables (In production, use Alembic for migrations instead of this)
Base.metadata.create_all(bind=engine)