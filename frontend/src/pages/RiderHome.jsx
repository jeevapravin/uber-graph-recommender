// src/pages/RiderHome.jsx
// Splits screen: full-bleed map (left/top) + side panel (right/bottom).
// Responsive: stacked on mobile, side-by-side on desktop.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import MapComponent from '../components/Map/MapComponent';
import RidePanel from '../components/Ride/RidePanel';

export default function RiderHome() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="h-screen w-screen bg-[#0D0D14] flex flex-col md:flex-row overflow-hidden">

      {/* ── Map fills available space ── */}
      <div className="flex-1 relative min-h-[40vh] md:min-h-0">
        <MapComponent />

        {/* Map overlay: logout button */}
        <button
          onClick={handleLogout}
          className="absolute top-4 right-4 z-[1000] bg-gray-900/80 backdrop-blur
            border border-gray-700 text-gray-400 hover:text-gray-200
            text-xs px-3 py-1.5 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* ── Side Panel ── */}
      <div
        className="
          w-full md:w-[380px] lg:w-[420px]
          bg-[#0D0D14] md:bg-gray-950/80 md:backdrop-blur
          border-t md:border-t-0 md:border-l border-gray-800
          overflow-y-auto
          flex flex-col
        "
      >
        {/* Drag handle on mobile */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        <div className="p-5 flex-1">
          <RidePanel />
        </div>
      </div>
    </div>
  );
}