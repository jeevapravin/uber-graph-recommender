import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as h3 from 'h3-js';
import 'leaflet/dist/leaflet.css';
import { useRide } from '../../context/RideContext';

// --- PRODUCTION ICONS ---
const pickupIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const dropoffIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const driverIcon = new L.divIcon({ className: 'bg-black dark:bg-white border-2 border-white dark:border-black rounded-full shadow-lg transition-all duration-500', iconSize: [14, 14], iconAnchor: [7, 7] });

export default function MapComponent({ isDarkMode }) {
  const { pickup, setPickup, dropoff, setDropoff, route, setRoute, setEta, setDistance, jobStatus, setJobStatus, setActiveRideId, setPickupLocation, setDropoffLocation } = useRide();
  const [hexBoundary, setHexBoundary] = useState([]);
  const [wsDrivers, setWsDrivers] = useState([]);

  // Mock drivers near standard location for demo
  useEffect(() => {
    setWsDrivers([
        [12.9360, 77.6250],
        [12.9340, 77.6230],
        [12.9370, 77.6270],
    ]);
  }, []);

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

  // If pickup and dropoff are set from search, draw a straight line
  useEffect(() => {
    if (pickup && dropoff && route.length === 0) {
      setRoute([pickup, dropoff]);
    }
  }, [pickup, dropoff, route, setRoute]);

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
        {wsDrivers.map((pos, idx) => <Marker key={`ws-${idx}`} position={pos} icon={driverIcon} />)}
        {pickup && <Marker position={pickup} icon={pickupIcon} />}
        {dropoff && <Marker position={dropoff} icon={dropoffIcon} />}
        {route.length > 0 && <Polyline positions={route} pathOptions={{ color: isDarkMode ? '#fff' : '#000', weight: 4, opacity: 0.8 }} />}
      </MapContainer>
    </div>
  );
}
