import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Activity, Map as MapIcon, History, Settings as SettingsIcon, CarFront, User, CreditCard, Moon, Sun } from 'lucide-react';

import { RideProvider } from './context/RideContext';
import LocationSearch from './components/Ride/LocationSearch';
import MapComponent from './components/Map/MapComponent';
import RidePanel from './components/Ride/RidePanel';

// --- PAGE 1: THE REFACTORED ROUTING MAP ---
const RoutingMap = ({ isDarkMode }) => {
  return (
    <RideProvider>
      <div className="relative h-full w-full flex flex-col md:flex-row shadow-inner">
        
        {/* MAP LAYER */}
        <div className="flex-1 h-screen relative z-0 md:w-[70%]">
          <MapComponent isDarkMode={isDarkMode} />
        </div>

        {/* RIDE CONFIGURATION PANEL */}
        <div className="w-full md:w-[30%] flex shrink-0 bg-white dark:bg-gray-900 shadow-2xl z-10 flex-col border-l border-gray-200 dark:border-gray-800 transition-colors h-screen">
          <div className="p-6 pb-2 shrink-0">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Request a Ride</h2>
          </div>
          
          <LocationSearch />
          
          <div className="flex-1 overflow-y-auto mt-2 border-t border-gray-100 dark:border-gray-800/50 pt-2">
            <RidePanel />
          </div>
        </div>
      </div>
    </RideProvider>
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