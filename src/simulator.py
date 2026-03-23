"""
simulator.py — Bangalore Driver Seeding Script

Seeds 1,000 drivers across Bangalore's actual neighborhoods.
Drivers are distributed across 3 zones:
  - Central (Koramangala, Indiranagar, MG Road): high density
  - Midring (Whitefield, Hebbal, Bannerghatta): medium density
  - Outer (Airport, Mysore Road, Electronics City): low density

Usage:
  pip install sqlalchemy psycopg2-binary h3 faker python-dotenv
  python simulator.py

This uses the SYNCHRONOUS psycopg2 engine (SYNC_DATABASE_URL) because
running asyncio in a CLI seeding script is unnecessary complexity.
"""
import os
import random
import sys
from pathlib import Path

import h3
from faker import Faker
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))
load_dotenv(Path(__file__).parent.parent / ".env")

from models import Driver, VehicleType, Base
from auth import hash_password

fake = Faker("en_IN")

# ─────────────────────────── Bangalore Zones ────────────────────────────────
# Each zone: (center_lat, center_lng, radius_km_approx, weight)

ZONES = [
    # (name, center_lat, center_lng, lat_spread, lng_spread, weight)
    ("Koramangala",    12.9352, 77.6245, 0.025, 0.030, 0.12),
    ("Indiranagar",    12.9784, 77.6408, 0.020, 0.025, 0.10),
    ("MG Road",        12.9756, 77.6097, 0.015, 0.020, 0.08),
    ("Whitefield",     12.9698, 77.7500, 0.040, 0.040, 0.09),
    ("Hebbal",         13.0358, 77.5970, 0.025, 0.030, 0.07),
    ("Electronic City",12.8418, 77.6741, 0.030, 0.035, 0.07),
    ("Banashankari",   12.9254, 77.5468, 0.025, 0.030, 0.06),
    ("Yeshwanthpur",   13.0207, 77.5530, 0.025, 0.025, 0.06),
    ("HSR Layout",     12.9116, 77.6370, 0.020, 0.025, 0.07),
    ("Marathahalli",   12.9591, 77.6976, 0.025, 0.030, 0.06),
    ("Jayanagar",      12.9308, 77.5838, 0.020, 0.025, 0.06),
    ("BTM Layout",     12.9165, 77.6101, 0.020, 0.025, 0.06),
    ("Yelahanka",      13.1004, 77.5963, 0.030, 0.030, 0.05),
    ("Bannerghatta",   12.8002, 77.5773, 0.030, 0.030, 0.05),
]

# Vehicle type distribution (realistic for Bangalore)
VEHICLE_WEIGHTS = {
    VehicleType.MOTO:   0.40,   # 40% bikes (Rapido-style)
    VehicleType.UBERX:  0.45,   # 45% sedans
    VehicleType.UBERXL: 0.15,   # 15% SUVs
}

VEHICLE_MODELS = {
    VehicleType.MOTO:   ["Honda Activa", "TVS Jupiter", "Yamaha FZ", "Royal Enfield Classic"],
    VehicleType.UBERX:  ["Maruti Swift", "Honda City", "Hyundai i20", "Toyota Etios", "Tata Tigor"],
    VehicleType.UBERXL: ["Toyota Innova", "Mahindra XUV500", "Kia Carnival", "Force Tempo"],
}

H3_RESOLUTION = 9
TOTAL_DRIVERS = 1000


def pick_zone() -> tuple:
    """Weighted random zone selection."""
    zones, weights = zip(*[(z, z[5]) for z in ZONES])
    return random.choices(zones, weights=weights, k=1)[0]


def random_coord_in_zone(zone: tuple) -> tuple[float, float]:
    _, clat, clng, dlat, dlng, _ = zone
    lat = clat + random.uniform(-dlat, dlat)
    lng = clng + random.uniform(-dlng, dlng)
    return round(lat, 6), round(lng, 6)


def pick_vehicle_type() -> VehicleType:
    types  = list(VEHICLE_WEIGHTS.keys())
    wts    = list(VEHICLE_WEIGHTS.values())
    return random.choices(types, weights=wts, k=1)[0]


def generate_plate(vehicle_type: VehicleType) -> str:
    state_codes = ["KA", "MH", "TN", "AP", "TS"]
    sc   = random.choice(state_codes)
    dist = random.randint(1, 99)
    ser  = fake.lexify("??", letters="ABCDEFGHJKLMNPRSTUVWXYZ")
    num  = random.randint(1000, 9999)
    return f"{sc}{dist:02d}{ser}{num}"


def seed_drivers(db_url: str, count: int = TOTAL_DRIVERS):
    engine = create_engine(db_url, echo=False)
    Base.metadata.create_all(engine)    # ensure tables exist
    Session = sessionmaker(bind=engine)
    session = Session()

    default_password = hash_password("Driver@123")   # all seeds use same password
    drivers = []

    print(f"🚗 Generating {count} drivers across {len(ZONES)} Bangalore zones...")

    for i in range(count):
        zone         = pick_zone()
        lat, lng     = random_coord_in_zone(zone)
        vtype        = pick_vehicle_type()
        h3_idx       = h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
        model        = random.choice(VEHICLE_MODELS[vtype])
        is_available = random.random() < 0.75   # 75% online initially

        driver = Driver(
            email=fake.unique.email(),
            phone=f"+91{random.randint(7000000000, 9999999999)}",
            name=fake.name(),
            hashed_password=default_password,
            vehicle_type=vtype,
            vehicle_plate=generate_plate(vtype),
            vehicle_model=model,
            lat=lat,
            lng=lng,
            h3_index=h3_idx,
            is_available=is_available,
            rating=round(random.uniform(3.8, 5.0), 2),
            total_rides=random.randint(0, 2000),
        )
        drivers.append(driver)

        if (i + 1) % 100 == 0:
            session.bulk_save_objects(drivers)
            session.commit()
            drivers.clear()
            print(f"  ✅ Seeded {i + 1}/{count} drivers")

    if drivers:
        session.bulk_save_objects(drivers)
        session.commit()

    # Print summary
    total = session.query(Driver).count()
    print(f"\n🎉 Done! {total} total drivers in database.")

    for vt in VehicleType:
        cnt = session.query(Driver).filter_by(vehicle_type=vt).count()
        avail = session.query(Driver).filter_by(vehicle_type=vt, is_available=True).count()
        print(f"  {vt.value:8s}: {cnt:4d} total | {avail:4d} available")

    session.close()
    engine.dispose()


if __name__ == "__main__":
    db_url = os.getenv("SYNC_DATABASE_URL")
    if not db_url:
        print("❌ SYNC_DATABASE_URL not set in .env")
        sys.exit(1)
    seed_drivers(db_url)