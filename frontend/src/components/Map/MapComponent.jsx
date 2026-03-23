// frontend/src/components/Map/MapComponent.jsx
// This is not a tutorial map. Every line here is intentional.

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRideStore } from '../../store/rideStore';
import { decodePolyline } from '../../utils/polyline';

// ─── Tile Layer ──────────────────────────────────────────────────────────────
// CartoDB Dark Matter — no API key needed, production-ready dark basemap.
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTRIBUTION =
  '&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>';

// ─── Bangalore center ────────────────────────────────────────────────────────
const BANGALORE_CENTER = [12.9716, 77.5946];
const DEFAULT_ZOOM     = 13;

// ─── SVG Icon Factory ────────────────────────────────────────────────────────
/**
 * Creates a custom L.divIcon with an inline SVG.
 * divIcon is always preferred over L.icon for custom shapes —
 * no network request, scales with devicePixelRatio, fully CSS-animatable.
 */
const createDriverIcon = (vehicleType, isSelected = false) => {
  const size   = isSelected ? 36 : 28;
  const color  = isSelected ? '#00D4AA' : '#888FA0';
  const pulse  = isSelected
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="none" stroke="#00D4AA" stroke-width="2" opacity="0.4">
         <animate attributeName="r" from="${size / 2 - 2}" to="${size / 2 + 6}" dur="1.5s" repeatCount="indefinite"/>
         <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite"/>
       </circle>`
    : '';

  // Moto: minimalist bike SVG
  const motoSVG = `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      ${pulse}
      <!-- Rear wheel -->
      <circle cx="8"  cy="22" r="5" fill="none" stroke="${color}" stroke-width="2.5"/>
      <!-- Front wheel -->
      <circle cx="24" cy="22" r="5" fill="none" stroke="${color}" stroke-width="2.5"/>
      <!-- Frame -->
      <path d="M8 22 L14 12 L20 12 L24 22" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Fuel tank -->
      <path d="M14 12 L17 12 L19 16 L13 16 Z" fill="${color}" opacity="0.8"/>
      <!-- Handlebar -->
      <path d="M20 12 L24 10 L26 12" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      <!-- Seat -->
      <path d="M14 12 L13 10 L17 10 L16 12" fill="${color}" opacity="0.6"/>
    </svg>`;

  // Car: minimalist sedan SVG
  const carSVG = `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      ${pulse}
      <!-- Body -->
      <rect x="3" y="16" width="26" height="9" rx="2" fill="${color}" opacity="0.9"/>
      <!-- Cabin -->
      <path d="M8 16 L10 9 L22 9 L24 16 Z" fill="${color}" opacity="0.75"/>
      <!-- Windshield -->
      <path d="M10 9 L11 13 L21 13 L22 9 Z" fill="none" stroke="#1a1a2e" stroke-width="1" opacity="0.7"/>
      <!-- Wheels -->
      <circle cx="9"  cy="25" r="3.5" fill="#1a1a2e" stroke="${color}" stroke-width="1.5"/>
      <circle cx="23" cy="25" r="3.5" fill="#1a1a2e" stroke="${color}" stroke-width="1.5"/>
      <!-- Headlights -->
      <rect x="26" y="18" width="2" height="3" rx="1" fill="#FFE580" opacity="0.9"/>
      <rect x="4"  y="18" width="2" height="3" rx="1" fill="#FFE580" opacity="0.9"/>
    </svg>`;

  // XL: SUV — taller roofline
  const xlSVG = `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      ${pulse}
      <rect x="2" y="15" width="28" height="10" rx="2" fill="${color}" opacity="0.9"/>
      <path d="M6 15 L8 7 L24 7 L26 15 Z" fill="${color}" opacity="0.75"/>
      <path d="M8 7 L9 12 L23 12 L24 7 Z" fill="none" stroke="#1a1a2e" stroke-width="1" opacity="0.7"/>
      <circle cx="9"  cy="25" r="3.5" fill="#1a1a2e" stroke="${color}" stroke-width="1.5"/>
      <circle cx="23" cy="25" r="3.5" fill="#1a1a2e" stroke="${color}" stroke-width="1.5"/>
      <rect x="27" y="17" width="2" height="3" rx="1" fill="#FFE580" opacity="0.9"/>
      <rect x="3"  y="17" width="2" height="3" rx="1" fill="#FFE580" opacity="0.9"/>
    </svg>`;

  const svgMap = { Moto: motoSVG, UberX: carSVG, UberXL: xlSVG };
  const svg    = svgMap[vehicleType] ?? carSVG;

  return L.divIcon({
    html:      svg,
    className: '',            // MUST be empty — Leaflet adds ugly white box by default
    iconSize:  [size, size],
    iconAnchor:[size / 2, size / 2],
  });
};

// Pickup pin (green)
const PICKUP_ICON = L.divIcon({
  html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z" fill="#00D4AA"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  className: '',
  iconSize:  [24, 32],
  iconAnchor:[12, 32],
});

// Dropoff pin (orange)
const DROPOFF_ICON = L.divIcon({
  html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z" fill="#FF6B35"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  className: '',
  iconSize:  [24, 32],
  iconAnchor:[12, 32],
});

// Driver live location (pulsing teal dot)
const LIVE_DRIVER_ICON = L.divIcon({
  html: `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" fill="#00D4AA" opacity="0.3">
      <animate attributeName="r" from="6" to="10" dur="1.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5" to="0" dur="1.2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="10" cy="10" r="5" fill="#00D4AA"/>
    <circle cx="10" cy="10" r="2" fill="white"/>
  </svg>`,
  className: '',
  iconSize:  [20, 20],
  iconAnchor:[10, 10],
});

// ─── Auto-Bound Component ────────────────────────────────────────────────────
/**
 * This MUST be a child of <MapContainer> to access the Leaflet map instance.
 * When `bounds` changes, it smoothly pans/zooms to fit the route.
 */
function AutoBound({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds || bounds.length < 2) return;
    try {
      map.fitBounds(L.latLngBounds(bounds), {
        padding: [60, 60],
        maxZoom: 15,
        animate: true,
        duration: 0.8,
      });
    } catch (e) {
      console.error('[AutoBound] Invalid bounds:', e);
    }
  }, [bounds, map]);

  return null;
}

// ─── Main Map Component ──────────────────────────────────────────────────────
export default function MapComponent() {
  const {
    pickup,
    dropoff,
    nearbyDrivers,
    selectedVehicle,
    route,
    driverLiveLocation,
    ridePhase,
  } = useRideStore();

  // Decode OSRM polyline to [[lat, lng], ...] for Leaflet
  const routeCoords = useMemo(() => {
    if (!route?.polyline) return null;
    return decodePolyline(route.polyline);
  }, [route?.polyline]);

  // Compute bounds for auto-zoom:
  // During ride: fit pickup + dropoff + live driver
  // During search: fit pickup + dropoff
  const autoBounds = useMemo(() => {
    const pts = [];
    if (pickup)              pts.push([pickup.lat,  pickup.lng]);
    if (dropoff)             pts.push([dropoff.lat, dropoff.lng]);
    if (driverLiveLocation)  pts.push([driverLiveLocation.lat, driverLiveLocation.lng]);
    return pts.length >= 2 ? pts : null;
  }, [pickup, dropoff, driverLiveLocation]);

  // Only render drivers matching the selected vehicle type
  // This is a strict conditional render — not a filter hidden in CSS
  const filteredDrivers = useMemo(
    () => nearbyDrivers.filter((d) => d.vehicle_type === selectedVehicle),
    [nearbyDrivers, selectedVehicle]
  );

  return (
    <MapContainer
      center={BANGALORE_CENTER}
      zoom={DEFAULT_ZOOM}
      className="w-full h-full"
      zoomControl={false}          // Custom zoom UI — default is ugly
      attributionControl={false}   // Moved to corner via custom component
    >
      {/* Premium dark tile layer */}
      <TileLayer
        url={DARK_TILE_URL}
        attribution={DARK_TILE_ATTRIBUTION}
        maxZoom={19}
      />

      {/* Auto-bound on route draw */}
      {autoBounds && <AutoBound bounds={autoBounds} />}

      {/* Route polyline */}
      {routeCoords && (
        <Polyline
          positions={routeCoords}
          pathOptions={{
            color:     '#00D4AA',
            weight:    4,
            opacity:   0.9,
            dashArray: ridePhase === 'in_ride' ? undefined : '8, 6',
            lineCap:   'round',
          }}
        />
      )}

      {/* Pickup pin */}
      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON} />
      )}

      {/* Dropoff pin */}
      {dropoff && (
        <Marker position={[dropoff.lat, dropoff.lng]} icon={DROPOFF_ICON} />
      )}

      {/* Nearby drivers — ONLY rendered when phase is idle/selecting, ONLY matching vehicle type */}
      {(ridePhase === 'idle' || ridePhase === 'selecting') &&
        filteredDrivers.map((driver) => (
          <Marker
            key={driver.id}
            position={[driver.lat, driver.lng]}
            icon={createDriverIcon(driver.vehicle_type)}
            title={`${driver.name} ★${driver.rating}`}
          />
        ))}

      {/* Live driver location during active ride */}
      {driverLiveLocation &&
        ['waiting', 'driver_arrived', 'in_ride'].includes(ridePhase) && (
          <Marker
            position={[driverLiveLocation.lat, driverLiveLocation.lng]}
            icon={LIVE_DRIVER_ICON}
          />
        )}
    </MapContainer>
  );
}
