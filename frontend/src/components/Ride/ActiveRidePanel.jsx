// src/components/Ride/ActiveRidePanel.jsx
// The status machine UI. Every phase has a distinct visual state.
// This is the component that makes or breaks the UX demo.
import React, { useState } from 'react';
import { ridesAPI } from '../../services/api';
import { useRideStore } from '../../store/rideStore';
import { useRideSocket } from '../../hooks/useRideSocket';

const PHASE_CONFIG = {
  waiting: {
    label:    'Finding your driver...',
    subtext:  'Your driver is on the way',
    color:    'text-yellow-400',
    icon:     '🔍',
    pulse:    true,
  },
  driver_arrived: {
    label:    'Driver has arrived!',
    subtext:  'Head to the pickup point',
    color:    'text-teal-400',
    icon:     '📍',
    pulse:    false,
  },
  in_ride: {
    label:    'On your way',
    subtext:  'Enjoy your ride',
    color:    'text-teal-400',
    icon:     '🚗',
    pulse:    false,
  },
  completed: {
    label:    'Ride complete!',
    subtext:  'Hope you enjoyed the ride',
    color:    'text-green-400',
    icon:     '✅',
    pulse:    false,
  },
  cancelled: {
    label:    'Ride cancelled',
    subtext:  'Something went wrong',
    color:    'text-red-400',
    icon:     '✕',
    pulse:    false,
  },
};

export default function ActiveRidePanel() {
  const { activeRide, ridePhase, clearRide } = useRideStore();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel,   setShowCancel]   = useState(false);
  const [rating,       setRating]       = useState(0);
  const [submitting,   setSubmitting]   = useState(false);

  // Connect to ride WebSocket
  useRideSocket(activeRide?.id);

  if (!activeRide) return null;

  const cfg = PHASE_CONFIG[ridePhase] || PHASE_CONFIG.waiting;

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setSubmitting(true);
    try {
      await ridesAPI.cancelByRider(activeRide.id, cancelReason);
    } catch {
      /* WebSocket will update phase on success */
    } finally {
      setSubmitting(false);
      setShowCancel(false);
    }
  };

  const handleRate = async (stars) => {
    setRating(stars);
    try {
      await ridesAPI.rate(activeRide.id, { rating: stars });
    } catch {
      /* non-critical */
    }
    setTimeout(() => clearRide(), 2000);
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Status header */}
      <div className="flex items-center gap-3">
        <div className={`text-2xl ${cfg.pulse ? 'animate-pulse' : ''}`}>{cfg.icon}</div>
        <div>
          <p className={`font-bold text-base ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-gray-500">{cfg.subtext}</p>
        </div>
      </div>

      {/* Driver card — shown once accepted */}
      {activeRide.driver && ridePhase !== 'waiting' && (
        <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-400/20 flex items-center justify-center">
              <span className="text-teal-300 font-bold text-sm">
                {activeRide.driver.name?.[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-200">{activeRide.driver.name}</p>
              <p className="text-xs text-gray-500">
                ★ {activeRide.driver.rating} · {activeRide.driver.vehicle_plate}
              </p>
            </div>
          </div>
          <a
            href={`tel:${activeRide.driver.phone}`}
            className="w-9 h-9 rounded-full bg-teal-400/10 border border-teal-400/30
              flex items-center justify-center text-teal-400 hover:bg-teal-400/20 transition-colors"
          >
            📞
          </a>
        </div>
      )}

      {/* Fare estimate */}
      {activeRide.estimated_fare && ridePhase !== 'completed' && (
        <div className="flex justify-between items-center px-1">
          <span className="text-xs text-gray-500">Estimated fare</span>
          <span className="text-teal-300 font-bold">₹{activeRide.estimated_fare}</span>
        </div>
      )}

      {/* Final fare on completion */}
      {ridePhase === 'completed' && activeRide.final_fare && (
        <div className="bg-teal-400/10 border border-teal-400/20 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Final Fare</p>
          <p className="text-2xl font-black text-teal-300">₹{activeRide.final_fare}</p>
          {activeRide.distance_km && (
            <p className="text-xs text-gray-500 mt-1">
              {activeRide.distance_km} km · {Math.round(activeRide.duration_min)} min
            </p>
          )}
        </div>
      )}

      {/* Rating — shown on completion */}
      {ridePhase === 'completed' && !rating && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gray-400">Rate your driver</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => handleRate(s)}
                className="text-2xl hover:scale-125 transition-transform"
              >
                {s <= rating ? '⭐' : '☆'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cancellation UI */}
      {['waiting', 'driver_arrived'].includes(ridePhase) && !showCancel && (
        <button
          onClick={() => setShowCancel(true)}
          className="text-xs text-gray-600 hover:text-red-400 transition-colors underline
            underline-offset-2 text-center mt-1"
        >
          Cancel ride
        </button>
      )}

      {showCancel && (
        <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm text-gray-300 font-medium">Reason for cancellation</p>
          {[
            "Driver is too far",
            "Found another ride",
            "Plans changed",
            "Waited too long",
          ].map((reason) => (
            <button
              key={reason}
              onClick={() => setCancelReason(reason)}
              className={`text-left text-sm px-3 py-2 rounded-lg border transition-all ${
                cancelReason === reason
                  ? 'border-red-400 bg-red-400/10 text-red-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {reason}
            </button>
          ))}
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setShowCancel(false)}
              className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400
                text-sm hover:border-gray-500 transition-colors"
            >
              Keep ride
            </button>
            <button
              onClick={handleCancel}
              disabled={!cancelReason || submitting}
              className="flex-1 py-2 rounded-lg bg-red-500/80 hover:bg-red-500
                disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? '...' : 'Confirm cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}