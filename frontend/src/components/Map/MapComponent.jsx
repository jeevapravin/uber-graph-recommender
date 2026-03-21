import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as h3 from 'h3-js';
import 'leaflet/dist/leaflet.css';
import { useRide } from '../../context/RideContext';

// --- PRODUCTION ICONS ---
const pickupIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const dropoffIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41] });

const carSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;
const motoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>`;

const createDriverIcon = (type, isDarkMode) => {
  const svg = type === 'Moto' ? motoSvg : carSvg;
  return new L.divIcon({
    html: `<div class="${isDarkMode ? 'bg-white text-black border-black' : 'bg-black text-white border-white'} border-2 rounded-full shadow-lg transition-transform duration-500 flex items-center justify-center p-1" style="width: 32px; height: 32px;">${svg}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

export default function MapComponent({ isDarkMode }) {
  const { pickup, setPickup, dropoff, setDropoff, route, setRoute, setEta, setDistance, jobStatus, setJobStatus, setActiveRideId, setPickupLocation, setDropoffLocation, nearbyDrivers, selectedVehicle } = useRide();
  const [hexBoundary, setHexBoundary] = useState([]);

  const mapTileUrl = isDarkMode 
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        if (jobStatus === 'QUEUED' || jobStatus === 'PROCESSING') return;
        if (!pickup || (pickup && dropoff)) {
          setPickup([e.latlng.lat, e.latlng.lng]);
          setPickupLocation({ displayName: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}` });
          setDropoff(null); 
          setDropoffLocation(null);
          setRoute([]); 
          setEta(null); 
          setDistance(null); 
          setJobStatus('IDLE'); 
          setActiveRideId(null);
          
          // Generate H3 Resolution 9 Hexagon for Spatial Indexing
          const hexId = h3.latLngToCell(e.latlng.lat, e.latlng.lng, 9);
          setHexBoundary(h3.cellToBoundary(hexId));
        } else if (!dropoff) {
          setDropoff([e.latlng.lat, e.latlng.lng]);
          setDropoffLocation({ displayName: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}` });
          // For now, draw straight line. The backend/RidePanel will update the route later
          setRoute([pickup, [e.latlng.lat, e.latlng.lng]]);
        }
      }
    });
    return null;
  };

  // The straight-line default drawing effect has been removed. 
  // The route is now populated exclusively by the backend via RidePanel's API call.

  // Handle map center adjusting when pickup/dropoff changes
  const MapBounds = () => {
    const map = useMapEvents({});
    useEffect(() => {
        if (pickup && dropoff) {
            const bounds = L.latLngBounds([pickup, dropoff]);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (pickup) {
            map.setView(pickup, map.getZoom() < 14 ? 14 : map.getZoom());
        }
    }, [pickup, dropoff, map]);
    return null;
  };

  return (
    <div className="flex-1 relative z-0 h-screen">
      <MapContainer center={[12.9352, 77.6245]} zoom={14} zoomControl={false} className="h-full w-full min-h-[500px] z-0">
        <TileLayer url={mapTileUrl} />
        <MapEvents />
        <MapBounds />
        {hexBoundary.length > 0 && <Polygon positions={hexBoundary} pathOptions={{ color: isDarkMode ? '#3b82f6' : '#22c55e', fillOpacity: 0.15, weight: 2, dashArray: '5,5' }} />}
        
        {nearbyDrivers
          .filter(d => d.type === (selectedVehicle?.id === 'moto' ? 'Moto' : 'Car'))
          .map((driver) => (
            <Marker key={driver.id} position={[driver.lat, driver.lng]} icon={createDriverIcon(driver.type, isDarkMode)} />
        ))}

        {pickup && <Marker position={pickup} icon={pickupIcon} />}
        {dropoff && <Marker position={dropoff} icon={dropoffIcon} />}
        {route.length > 0 && <Polyline positions={route} pathOptions={{ color: isDarkMode ? '#fff' : '#000', weight: 4, opacity: 0.8 }} />}
      </MapContainer>
    </div>
  );
}
