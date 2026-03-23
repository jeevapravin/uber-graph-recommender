"""
main.py — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from auth_router import router as auth_router
from matcher import router as match_router
from rides import router as rides_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    print("✅ Database tables initialized")
    yield
    # Shutdown (add cleanup here if needed)
    print("🛑 Shutting down")


app = FastAPI(
    title="UberClone API",
    version="1.0.0",
    description="Production-grade ride-hailing API with H3 spatial matching",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://your-production-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(match_router)
app.include_router(rides_router)


@app.get("/health")
async def health():
    return {"status": "ok"}