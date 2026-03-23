// src/hooks/useRideSocket.js
// Custom hook for WebSocket lifecycle management.
// Handles reconnection, cleanup, and event dispatch.
import { useEffect, useRef } from 'react';
import { useRideStore } from '../store/rideStore';
import { createRideSocket, createDriverSocket } from '../services/api';

const RECONNECT_DELAY_MS = 3000;

/**
 * Connects to a ride room WebSocket and dispatches events to the store.
 * @param {string|null} rideId - UUID of the active ride
 */
export function useRideSocket(rideId) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const { setDriverLiveLocation, setRidePhase, setActiveRide, clearRide } = useRideStore();

  useEffect(() => {
    if (!rideId) return;

    const connect = () => {
      const ws = createRideSocket(rideId);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] Connected to ride room: ${rideId}`);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleEvent(msg);
      };

      ws.onclose = (e) => {
        if (!e.wasClean) {
          console.warn('[WS] Disconnected, reconnecting...');
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = (e) => console.error('[WS] Error:', e);
    };

    const handleEvent = ({ event, data }) => {
      switch (event) {
        case 'ride_accepted':
          setRidePhase('waiting');
          setActiveRide((prev) => ({ ...prev, driver: data }));
          break;
        case 'driver_location':
          setDriverLiveLocation({ lat: data.lat, lng: data.lng });
          break;
        case 'driver_arrived':
          setRidePhase('driver_arrived');
          break;
        case 'ride_started':
          setRidePhase('in_ride');
          break;
        case 'ride_completed':
          setRidePhase('completed');
          break;
        case 'ride_cancelled':
          setRidePhase('cancelled');
          clearRide();
          break;
        default:
          break;
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [rideId]);
}

/**
 * Driver-side WebSocket hook.
 * Listens for incoming ride requests and location pings.
 * @param {string|null} driverId
 * @param {{ onRideRequest: Function }} callbacks
 */
export function useDriverSocket(driverId, { onRideRequest } = {}) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    if (!driverId) return;

    const connect = () => {
      const ws = createDriverSocket(driverId);
      wsRef.current = ws;

      ws.onopen  = () => console.log('[WS:Driver] Connected');
      ws.onclose = (e) => {
        if (!e.wasClean) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.event === 'ride_requested' && onRideRequest) {
          onRideRequest(msg.data);
        }
      };
    };

    connect();

    // Driver pings location every 5 seconds
    const locationInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(({ coords }) => {
          wsRef.current.send(JSON.stringify({
            event: 'location_update',
            data: { lat: coords.latitude, lng: coords.longitude },
          }));
        });
      }
    }, 5000);

    return () => {
      clearInterval(locationInterval);
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [driverId]);

  return wsRef;
}