import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:password@localhost:5432/uber_clone"
    )
    SYNC_DATABASE_URL: str = os.getenv(
        "SYNC_DATABASE_URL",
        "postgresql+psycopg2://postgres:password@localhost:5432/uber_clone"
    )

    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "CHANGE_THIS_IN_PRODUCTION_USE_256_BIT_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h

    # Redis (for WebSocket pub/sub at scale)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # OSRM routing (self-hosted or public demo)
    OSRM_BASE_URL: str = os.getenv("OSRM_BASE_URL", "http://router.project-osrm.org")

    # H3 resolution
    H3_RESOLUTION: int = 9

    # Fare config (INR per km)
    FARE_BASE: dict = {
        "Moto":   {"base": 20.0, "per_km": 8.0,  "per_min": 1.0},
        "UberX":  {"base": 40.0, "per_km": 12.0, "per_min": 1.5},
        "UberXL": {"base": 60.0, "per_km": 16.0, "per_min": 2.0},
    }

    class Config:
        env_file = "../.env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()