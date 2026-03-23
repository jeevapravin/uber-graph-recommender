"""
websocket_manager.py — Room-Based WebSocket Connection Manager

Each active ride gets its own "room" keyed by ride_id.
Both rider and driver connect to the same room and receive real-time events.

Event types:
  - ride_requested    → driver receives new ride request
  - ride_accepted     → rider receives driver info
  - driver_location   → rider receives driver GPS in real-time
  - driver_arrived    → rider notified driver is at pickup
  - ride_started      → both notified trip is in progress
  - ride_completed    → both notified with final fare
  - ride_cancelled    → both notified with cancellation detail

Scaling note: This is a single-instance manager using in-memory dicts.
For multi-worker production, replace the `rooms` dict with Redis pub/sub:
  - `await redis.publish(f"ride:{ride_id}", json.dumps(event))`
  - Each worker subscribes and forwards to its local WebSocket connections.
"""
import json
import asyncio
from collections import defaultdict
from typing import Dict, Set
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # ride_id (str) → set of active WebSocket connections
        self.rooms: Dict[str, Set[WebSocket]] = defaultdict(set)
        # driver_id → WebSocket (for direct driver dispatch)
        self.driver_connections: Dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect_to_ride(self, ride_id: str, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.rooms[ride_id].add(ws)

    async def connect_driver(self, driver_id: str, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.driver_connections[driver_id] = ws

    async def disconnect_from_ride(self, ride_id: str, ws: WebSocket):
        async with self._lock:
            self.rooms[ride_id].discard(ws)
            if not self.rooms[ride_id]:
                del self.rooms[ride_id]

    async def disconnect_driver(self, driver_id: str):
        async with self._lock:
            self.driver_connections.pop(driver_id, None)

    async def broadcast_to_ride(self, ride_id: str, event: dict):
        """Send event to every participant in a ride room."""
        payload = json.dumps(event)
        dead: Set[WebSocket] = set()
        for ws in list(self.rooms.get(ride_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        # Clean up dead connections
        if dead:
            async with self._lock:
                self.rooms[ride_id] -= dead

    async def send_to_driver(self, driver_id: str, event: dict):
        """Send event directly to a connected driver."""
        ws = self.driver_connections.get(driver_id)
        if ws:
            try:
                await ws.send_text(json.dumps(event))
            except Exception:
                await self.disconnect_driver(driver_id)

    # ── Typed event helpers ──────────────────────────────────────────────────

    async def emit_ride_requested(self, driver_id: str, ride_data: dict):
        await self.send_to_driver(driver_id, {
            "event": "ride_requested",
            "data": ride_data,
        })

    async def emit_ride_accepted(self, ride_id: str, driver_data: dict):
        await self.broadcast_to_ride(ride_id, {
            "event": "ride_accepted",
            "data": driver_data,
        })

    async def emit_driver_location(self, ride_id: str, lat: float, lng: float):
        await self.broadcast_to_ride(ride_id, {
            "event": "driver_location",
            "data": {"lat": lat, "lng": lng},
        })

    async def emit_driver_arrived(self, ride_id: str):
        await self.broadcast_to_ride(ride_id, {"event": "driver_arrived", "data": {}})

    async def emit_ride_started(self, ride_id: str):
        await self.broadcast_to_ride(ride_id, {"event": "ride_started", "data": {}})

    async def emit_ride_completed(self, ride_id: str, fare: float):
        await self.broadcast_to_ride(ride_id, {
            "event": "ride_completed",
            "data": {"final_fare": fare},
        })

    async def emit_ride_cancelled(self, ride_id: str, cancelled_by: str, reason: str):
        await self.broadcast_to_ride(ride_id, {
            "event": "ride_cancelled",
            "data": {"cancelled_by": cancelled_by, "reason": reason},
        })


# Singleton — imported by every router that needs WebSocket broadcasting
manager = ConnectionManager()