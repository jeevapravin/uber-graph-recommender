"""
auth.py — JWT token creation, validation, and dependency injection.
Two token types: "rider" and "driver". Always check which role the
endpoint expects — mixing them up is a security vulnerability.
"""
from datetime import datetime, timedelta
from typing import Optional, Literal
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import get_settings
from database import get_db
from models import User, Driver

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Separate OAuth2 schemes so FastAPI docs separates rider/driver flows
oauth2_rider_scheme  = OAuth2PasswordBearer(tokenUrl="/auth/rider/login",  auto_error=False)
oauth2_driver_scheme = OAuth2PasswordBearer(tokenUrl="/auth/driver/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    subject: str,
    role: Literal["rider", "driver"],
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub":  subject,
        "role": role,
        "exp":  expire,
        "iat":  datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str = Depends(oauth2_rider_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = _decode_token(token)
    if payload.get("role") != "rider":
        raise HTTPException(status_code=403, detail="Rider token required")
    result = await db.execute(select(User).where(User.id == UUID(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def get_current_driver(
    token: str = Depends(oauth2_driver_scheme),
    db: AsyncSession = Depends(get_db),
) -> Driver:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = _decode_token(token)
    if payload.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver token required")
    result = await db.execute(select(Driver).where(Driver.id == UUID(payload["sub"])))
    driver = result.scalar_one_or_none()
    if not driver or not driver.is_active:
        raise HTTPException(status_code=401, detail="Driver not found or inactive")
    return driver