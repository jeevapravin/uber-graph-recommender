import random
import h3
from datetime import datetime
from sqlalchemy.orm import Session
from src.models import SessionLocal, Driver, engine

def generate_h3_index(lat, lng, resolution=9):
    if hasattr(h3, 'geo_to_h3'):
        return h3.geo_to_h3(lat, lng, resolution)
    elif hasattr(h3, 'latlng_to_cell'):
        return h3.latlng_to_cell(lat, lng, resolution)
    else:
        raise AttributeError("h3 module does not have a recognized latlng to h3 function")

def seed_drivers():
    print("Dropping existing drivers table and recreating for fresh H3 seeding...")
    Driver.__table__.drop(engine, checkfirst=True)
    Driver.__table__.create(engine, checkfirst=True)

    db: Session = SessionLocal()
    
    # Bangalore bounding box approx
    vehicle_types = ['UberX', 'Moto', 'UberXL']
    drivers_to_insert = []
    
    for i in range(1000):
        lat = random.uniform(12.85, 13.05)
        lng = random.uniform(77.50, 77.75)
        v_type = random.choice(vehicle_types)
        
        h3_hex = generate_h3_index(lat, lng, resolution=9)
        
        driver = Driver(
            name=f"Driver_{i}",
            vehicle_type=v_type,
            status="available",
            location=f"POINT({lng} {lat})", # WKT string format Longitude Latitude
            h3_index=h3_hex,
            last_updated=datetime.utcnow()
        )
        drivers_to_insert.append(driver)
        
    db.add_all(drivers_to_insert)
    db.commit()
    print(f"✅ Successfully seeded {len(drivers_to_insert)} drivers into the PostgreSQL Database via SQLAlchemy!")
    db.close()

if __name__ == "__main__":
    seed_drivers()