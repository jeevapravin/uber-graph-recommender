import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as h3 from 'h3-js';
import { Activity, Clock, Map as MapIcon, History, Settings as SettingsIcon, CarFront, User, CreditCard, Loader2, Moon, Sun, Bike, Car, ShieldCheck } from 'lucide-react';

// --- PRODUCTION ICONS ---
const pickupIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const dropoffIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const driverIcon = new L.divIcon({ className: 'bg-black dark:bg-white border-2 border-white dark:border-black rounded-full shadow-lg transition-all duration-500', iconSize: [14, 14], iconAnchor: [7, 7] });

// --- VEHICLE PRICING ENGINE ---
const VEHICLES = [
  { id: 'moto', name: 'Uber Moto', icon: Bike, multiplier: 0.6, baseFare: 20, timeMultiplier: 0.8 },
  { id: 'uberx', name: 'UberX', icon: Car, multiplier: 1.0, baseFare: 50, timeMultiplier: 1.0 },
  { id: 'uberxl', name: 'UberXL', icon: ShieldCheck, multiplier: 1.5, baseFare: 80, timeMultiplier: 1.2 },
];

// --- PAGE 1: THE ASYNC MAP ENGINE ---
const RoutingMap = ({ isDarkMode }) => {
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [time, setTime] = useState(12);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLES[1]); // Default UberX
  
  const [jobStatus, setJobStatus] = useState('IDLE');
  const [activeRideId, setActiveRideId] = useState(null);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  const [route, setRoute] = useState([]);
  
  const [hexBoundary, setHexBoundary] = useState([]);
  const [wsDrivers, setWsDrivers] = useState([]);
  const ws = useRef(null);
  const pollingInterval = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws/drivers');
    ws.current.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'DRIVER_LOCATIONS') setWsDrivers(payload.data.map(d => [d.lat, d.lng]));
      } catch (err) { }
    };
    return () => { if (ws.current) ws.current.close(); };
  }, []);

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        if (jobStatus === 'QUEUED' || jobStatus === 'PROCESSING') return;
        if (!pickup || (pickup && dropoff)) {
          setPickup([e.latlng.lat, e.latlng.lng]);
          setDropoff(null); setRoute([]); setEta(null); setDistance(null); 
          setJobStatus('IDLE'); setActiveRideId(null);
          
          // Generate H3 Resolution 9 Hexagon for Spatial Indexing
          const hexId = h3.latLngToCell(e.latlng.lat, e.latlng.lng, 9);
          setHexBoundary(h3.cellToBoundary(hexId));
        } else if (!dropoff) {
          setDropoff([e.latlng.lat, e.latlng.lng]);
        }
      }
    });
    return null;
  };

  useEffect(() => {
    if (pickup && dropoff && jobStatus === 'IDLE') queueRouteJob();
  }, [dropoff]);

  const queueRouteJob = async () => {
    setJobStatus('QUEUED');
    try {
      const response = await fetch('http://127.0.0.1:8000/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_coords: pickup, end_coords: dropoff, hour: parseInt(time) })
      });
      const data = await response.json();
      if (response.status === 202) {
        setActiveRideId(data.ride_id);
        setJobStatus('PROCESSING');
        startPolling(data.ride_id);
      } else throw new Error(data.detail);
    } catch (error) { setJobStatus('FAILED'); }
  };

  const startPolling = (rideId) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/route/${rideId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          clearInterval(pollingInterval.current);
          setEta(data.eta); setDistance(data.distance); setJobStatus('COMPLETED');
          if (data.route_coords && data.route_coords.length > 0) setRoute(data.route_coords);
          else setRoute([pickup, dropoff]); 
        } else if (data.status === 'failed') {
          clearInterval(pollingInterval.current); setJobStatus('FAILED');
        }
      } catch (err) { }
    }, 2000);
  };

  const mapTileUrl = isDarkMode 
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  return (
    <div className="relative h-full w-full flex flex-col md:flex-row">
      
      {/* MAP LAYER */}
      <div className="flex-1 relative z-0">
        <MapContainer center={[12.9352, 77.6245]} zoom={14} zoomControl={false} className="w-full h-full">
          <TileLayer url={mapTileUrl} />
          <MapEvents />
          {hexBoundary.length > 0 && <Polygon positions={hexBoundary} pathOptions={{ color: isDarkMode ? '#3b82f6' : '#22c55e', fillOpacity: 0.15, weight: 2, dashArray: '5,5' }} />}
          {wsDrivers.map((pos, idx) => <Marker key={`ws-${idx}`} position={pos} icon={driverIcon} />)}
          {pickup && <Marker position={pickup} icon={pickupIcon} />}
          {dropoff && <Marker position={dropoff} icon={dropoffIcon} />}
          {route.length > 0 && <Polyline positions={route} pathOptions={{ color: isDarkMode ? '#fff' : '#000', weight: 4, opacity: 0.8 }} />}
        </MapContainer>
      </div>

      {/* RIDE CONFIGURATION PANEL */}
      <div className="w-full md:w-[400px] bg-white dark:bg-gray-900 shadow-2xl z-10 flex flex-col border-l border-gray-200 dark:border-gray-800 transition-colors">
        <div className="p-6 flex-1 overflow-y-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">Request a Ride</h2>
          
          <div className="space-y-4 mb-8 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-gray-200 dark:before:bg-gray-800">
            <div className={`flex items-center gap-4 text-sm font-semibold relative ${!pickup || (pickup && dropoff) ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              <div className="w-6 h-6 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] border-4 border-white dark:border-gray-900 z-10"></div> 
              <span className="flex-1 pb-4 border-b border-gray-100 dark:border-gray-800">{pickup ? "Location Selected" : "Set Pickup Location"}</span>
            </div>
            <div className={`flex items-center gap-4 text-sm font-semibold relative ${pickup && !dropoff ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              <div className="w-6 h-6 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] border-4 border-white dark:border-gray-900 z-10"></div> 
              <span className="flex-1 pb-4 border-b border-gray-100 dark:border-gray-800">{dropoff ? "Destination Selected" : "Set Dropoff"}</span>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2"><Clock className="w-4 h-4"/> Departure Time</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                {time % 12 || 12}:00 {time >= 12 ? 'PM' : 'AM'}
              </span>
            </div>
            <input type="range" min="0" max="23" value={time} onChange={(e) => setTime(e.target.value)} disabled={jobStatus === 'QUEUED' || jobStatus === 'PROCESSING'} className="w-full accent-black dark:accent-white cursor-pointer" />
          </div>

          {/* VEHICLE SELECTOR */}
          <div className="space-y-3 mb-8">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Available Rides</h3>
            {VEHICLES.map((v) => (
              <button 
                key={v.id}
                onClick={() => setSelectedVehicle(v)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedVehicle.id === v.id ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
              >
                <div className="flex items-center gap-4">
                  <v.icon className={`w-8 h-8 ${selectedVehicle.id === v.id ? 'text-black dark:text-white' : 'text-gray-400'}`} />
                  <div className="text-left">
                    <div className={`font-bold ${selectedVehicle.id === v.id ? 'text-black dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{v.name}</div>
                    <div className="text-xs text-gray-500">
                      {eta ? `${Math.ceil(eta * v.timeMultiplier)} mins away` : 'Select route for ETA'}
                    </div>
                  </div>
                </div>
                <div className="font-extrabold text-lg text-gray-900 dark:text-white">
                  {distance ? `₹${Math.round(v.baseFare + (distance * 15 * v.multiplier))}` : '--'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* STATUS & ACTION FOOTER */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
           {(jobStatus === 'QUEUED' || jobStatus === 'PROCESSING') ? (
             <button disabled className="w-full py-4 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold flex items-center justify-center gap-2">
               <Loader2 className="w-5 h-5 animate-spin" /> Calculating Route...
             </button>
           ) : jobStatus === 'COMPLETED' ? (
             <button className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold text-lg shadow-xl hover:scale-[1.02] transition-transform">
               Confirm {selectedVehicle.name}
             </button>
           ) : (
             <button disabled className="w-full py-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 font-bold">
               Select Pickup & Dropoff
             </button>
           )}
           {distance && (
             <div className="mt-4 text-center text-xs text-gray-500 font-medium">
               {distance.toFixed(2)} km exact PostGIS distance
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

// --- DUMMY PAGES ---
const RideHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/history');
        if (!response.ok) throw new Error('Failed to fetch DB records');
        const data = await response.json();
        setHistory(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div className="p-8 h-full bg-gray-50 dark:bg-gray-950 overflow-y-auto text-gray-900 dark:text-white transition-colors">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Ride History</h1>
        <p className="text-gray-500 mb-8">Live data streamed from PostGIS Database</p>
        
        {error && <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-lg text-sm">{error}</div>}

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                <th className="p-4">Ride ID</th>
                <th className="p-4">Date</th>
                <th className="p-4">Distance</th>
                <th className="p-4">ETA</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-400">Loading...</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-400">Database is empty.</td></tr>
              ) : (
                history.map((ride) => (
                  <tr key={ride.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-4 font-mono text-gray-500">#{ride.id}</td>
                    <td className="p-4 font-medium text-gray-900 dark:text-white">
                      {new Date(ride.created_at || Date.now()).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-400">{ride.distance_km ? ride.distance_km.toFixed(2) : '--'} km</td>
                    <td className="p-4 font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-3 h-3 text-blue-500"/> {ride.eta_minutes} mins
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${ride.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ride.status === 'processing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {ride.status || 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Payments = () => (
  <div className="p-8 h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white transition-colors">
    <div className="max-w-4xl mx-auto"><h1 className="text-3xl font-bold mb-8">Wallet & Payments</h1>
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 rounded-2xl text-white shadow-xl max-w-sm"><CreditCard className="w-10 h-10 mb-4"/>
    <div className="text-2xl font-mono mb-1">**** **** **** 4242</div><div className="text-sm text-gray-400">Jeeva Pravin</div></div></div>
  </div>
);

const Settings = () => (
  <div className="p-8 h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white transition-colors">
    <div className="max-w-4xl mx-auto"><h1 className="text-3xl font-bold mb-8">Account Settings</h1><p className="text-gray-500">Profile configuration and privacy controls.</p></div>
  </div>
);

// --- SIDEBAR COMPONENT ---
const SidebarItem = ({ icon: Icon, text, to }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-md' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
      <Icon className="w-5 h-5" /><span>{text}</span>
    </Link>
  );
};

// --- MAIN APP LAYOUT (WITH THEME ENGINE) ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Apply dark mode to HTML document body for Tailwind
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  return (
    <Router>
      <div className={`flex h-screen w-screen overflow-hidden font-sans transition-colors ${isDarkMode ? 'dark bg-gray-950' : 'bg-white'}`}>
        
        {/* SIDEBAR */}
        <div className="w-64 bg-white dark:bg-gray-950 flex flex-col border-r border-gray-200 dark:border-gray-800 z-50 transition-colors">
          <div className="p-6">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="bg-black dark:bg-white p-2 rounded-lg"><CarFront className="w-6 h-6 text-white dark:text-black"/></div>
                <h1 className="text-gray-900 dark:text-white text-xl font-bold tracking-tight">Uber ML</h1>
              </div>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
            
            <nav className="space-y-2">
              <SidebarItem icon={MapIcon} text="Live Map" to="/" />
              <SidebarItem icon={History} text="Ride History" to="/history" />
              <SidebarItem icon={CreditCard} text="Payments" to="/payments" />
              <SidebarItem icon={SettingsIcon} text="Settings" to="/settings" />
            </nav>
          </div>
          
          <div className="mt-auto p-6 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-gray-900 dark:text-white text-sm font-semibold">Jeeva Pravin</div>
                <div className="text-gray-500 text-xs">Rider Account</div>
              </div>
            </div>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div className="flex-1 relative">
          <Routes>
            <Route path="/" element={<RoutingMap isDarkMode={isDarkMode} />} />
            <Route path="/history" element={<RideHistory />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>

      </div>
    </Router>
  );
}