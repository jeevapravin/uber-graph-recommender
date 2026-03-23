"""
auth_router.py — Registration and Login endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, Driver
from schemas import UserRegister, DriverRegister, LoginRequest, TokenResponse
from auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/rider/register", response_model=TokenResponse, status_code=201)
async def register_rider(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        phone=payload.phone,
        name=payload.name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id), role="rider")
    return TokenResponse(access_token=token, role="rider", user_id=str(user.id), name=user.name)


@router.post("/rider/login", response_model=TokenResponse)
async def login_rider(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(user.id), role="rider")
    return TokenResponse(access_token=token, role="rider", user_id=str(user.id), name=user.name)


@router.post("/driver/register", response_model=TokenResponse, status_code=201)
async def register_driver(payload: DriverRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Driver).where(Driver.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    driver = Driver(
        email=payload.email,
        phone=payload.phone,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        vehicle_type=payload.vehicle_type,
        vehicle_plate=payload.vehicle_plate,
        vehicle_model=payload.vehicle_model,
    )
    db.add(driver)
    await db.commit()
    await db.refresh(driver)

    token = create_access_token(str(driver.id), role="driver")
    return TokenResponse(access_token=token, role="driver", user_id=str(driver.id), name=driver.name)


@router.post("/driver/login", response_model=TokenResponse)
async def login_driver(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(Driver.email == payload.email))
    driver = result.scalar_one_or_none()
    if not driver or not verify_password(payload.password, driver.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(driver.id), role="driver")
    return TokenResponse(access_token=token, role="driver", user_id=str(driver.id), name=driver.name)