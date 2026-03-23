// src/components/Driver/DriverDashboard.jsx
// The entire driver-side experience.
// Driver connects on mount, handles incoming requests, full ride lifecycle controls.
import React, { useState, useCallback, useEffect } from 'react';
import { ridesAPI, matchAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useDriverSocket } from '../../hooks/useRideSocket';

const STATUS_ACTIONS = {
  accepted:        { label: "I've arrived",       action: 'arrived',  color: 'bg-blue-500 hover:bg-blue-400'  },
  driver_arrived:  { label: "Start Ride",          action: 'start',    color: 'bg-teal-500 hover:bg-teal-400'  },
  in_progress:     { label: "Complete Ride",       action: 'complete', color: 'bg-green-500 hover:bg-green-400' },
};

export default function DriverDashboard() {
  const { userId, name } = useAuthStore();

  const [isOnline,    setIsOnline]    = useState(true);
  const [activeRide,  setActiveRide]  = useState(null);
  const [incomingReq, setIncomingReq] = useState(null);   // pending ride request
  const [totalToday,  setTotalToday]  = useState(0);
  const [earnings,    setEarnings]    = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModal,   setCancelModal]   = useState(false);
  const [cancelReason,  setCancelReason]  = useState('');

  // Dismiss incoming request after 30s if no response
  useEffect(() => {
    if (!incomingReq) return;
    const t = setTimeout(() => setIncomingReq(null), 30000);
    return () => clearTimeout(t);
  }, [incomingReq]);

  // Handle incoming ride dispatch via WebSocket
  const handleRideRequest = useCallback((data) => {
    if (activeRide) return;   // already in a ride
    setIncomingReq(data);
  }, [activeRide]);

  useDriverSocket(userId, { onRideRequest: handleRideRequest });

  // ── Toggle Online/Offline ──────────────────────────────────────────────
  const toggleOnline = useCallback(async () => {
    // In production: PATCH /drivers/me/status
    // For now, just toggle UI state
    setIsOnline((prev) => !prev);
    if (incomingReq) setIncomingReq(null);
  }, [incomingReq]);

  // ── Accept Ride ────────────────────────────────────────────────────────
  const acceptRide = useCallback(async () => {
    if (!incomingReq) return;
    setActionLoading(true);
    try {
      const res = await ridesAPI.accept(incomingReq.ride_id);
      setActiveRide(res.data);
      setIncomingReq(null);
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not accept ride');
      setIncomingReq(null);
    } finally {
      setActionLoading(false);
    }
  }, [incomingReq]);

  // ── Reject Incoming ────────────────────────────────────────────────────
  const rejectRide = useCallback(() => setIncomingReq(null), []);

  // ── Ride Lifecycle Actions ─────────────────────────────────────────────
  const handleRideAction = useCallback(async (action) => {
    if (!activeRide) return;
    setActionLoading(true);
    try {
      let res;
      if (action === 'arrived')  res = await ridesAPI.arrived(activeRide.id);
      if (action === 'start')    res = await ridesAPI.start(activeRide.id);
      if (action === 'complete') {
        res = await ridesAPI.complete(activeRide.id);
        setTotalToday((p) => p + 1);
        setEarnings((p) => p + (res.data.final_fare || 0));
        setTimeout(() => setActiveRide(null), 3000);
      }
      setActiveRide(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }, [activeRide]);

  // ── Cancel Active Ride ─────────────────────────────────────────────────
  const cancelRide = useCallback(async () => {
    if (!cancelReason || !activeRide) return;
    setActionLoading(true);
    try {
      await ridesAPI.cancelByDriver(activeRide.id, cancelReason);
      setActiveRide(null);
      setCancelModal(false);
      setCancelReason('');
    } catch (err) {
      alert(err.response?.data?.detail || 'Cancel failed');
    } finally {
      setActionLoading(false);
    }
  }, [activeRide, cancelReason]);

  const currentAction = activeRide ? STATUS_ACTIONS[activeRide.status] : null;

  return (
    <div className="min-h-screen bg-[#0D0D14] text-white flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-widest">Driver Mode</p>
          <h1 className="text-xl font-bold">{name}</h1>
        </div>
        <button
          onClick={toggleOnline}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
            isOnline
              ? 'bg-teal-400/10 border border-teal-400 text-teal-400'
              : 'bg-gray-800 border border-gray-700 text-gray-500'
          }`}
        >
          {isOnline ? '● Online' : '○ Offline'}
        </button>
      </div>

      {/* ── Stats Bar ── */}
      <div className="mx-5 bg-gray-900 border border-gray-800 rounded-2xl p-4 flex divide-x divide-gray-800 mb-4">
        <StatCell label="Today's Rides" value={totalToday} />
        <StatCell label="Earnings"      value={`₹${earnings.toFixed(0)}`} highlight />
        <StatCell label="Rating"        value="★ 4.9" />
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 px-5 flex flex-col gap-4">

        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-6 text-center">
            <p className="text-4xl mb-3">😴</p>
            <p className="text-gray-400 font-medium">You're offline</p>
            <p className="text-gray-600 text-sm mt-1">Go online to receive ride requests</p>
          </div>
        )}

        {/* Incoming ride request — modal style */}
        {incomingReq && isOnline && (
          <div className="bg-gray-900 border border-teal-400/40 rounded-2xl p-5
            shadow-2xl shadow-teal-500/10 animate-pulse-subtle">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              <p className="text-teal-400 font-bold text-sm uppercase tracking-wider">
                New Ride Request
              </p>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-teal-400/10 flex items-center justify-center">
                <span className="text-teal-300 font-bold">
                  {incomingReq.rider_name?.[0]}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-200">{incomingReq.rider_name}</p>
                <p className="text-xs text-gray-500">★ {incomingReq.rider_rating?.toFixed(1)}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-teal-300 font-bold text-lg">₹{incomingReq.estimated_fare}</p>
                <p className="text-xs text-gray-500">{incomingReq.vehicle_type}</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-3 mb-4 space-y-2">
              <LocationRow icon="🟢" label="Pickup"  text={incomingReq.pickup_address  || 'Location set'} />
              <div className="w-px h-3 bg-gray-600 ml-2" />
              <LocationRow icon="🔴" label="Dropoff" text={incomingReq.dropoff_address || 'Location set'} />
            </div>

            <div className="flex gap-3">
              <button
                onClick={rejectRide}
                className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400
                  font-semibold text-sm hover:border-gray-500 transition-colors"
              >
                Decline
              </button>
              <button
                onClick={acceptRide}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-teal-400 hover:bg-teal-300
                  text-black font-bold text-sm disabled:opacity-50 transition-colors"
              >
                {actionLoading ? '...' : 'Accept'}
              </button>
            </div>
          </div>
        )}

        {/* Active ride card */}
        {activeRide && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Active Ride</p>
              <StatusBadge status={activeRide.status} />
            </div>

            <div className="space-y-2">
              <LocationRow icon="🟢" label="Pickup"  text={activeRide.pickup_address  || `${activeRide.pickup_lat?.toFixed(4)}, ${activeRide.pickup_lng?.toFixed(4)}`} />
              <div className="w-px h-3 bg-gray-700 ml-2" />
              <LocationRow icon="🔴" label="Dropoff" text={activeRide.dropoff_address || `${activeRide.dropoff_lat?.toFixed(4)}, ${activeRide.dropoff_lng?.toFixed(4)}`} />
            </div>

            {activeRide.estimated_fare && (
              <div className="flex justify-between items-center bg-gray-800 rounded-xl px-4 py-2.5">
                <span className="text-xs text-gray-500">Est. Earnings</span>
                <span className="text-teal-300 font-bold">₹{activeRide.estimated_fare}</span>
              </div>
            )}

            {/* Ride action button */}
            {currentAction && activeRide.status !== 'completed' && (
              <button
                onClick={() => handleRideAction(currentAction.action)}
                disabled={actionLoading}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-sm
                  disabled:opacity-50 transition-colors ${currentAction.color}`}
              >
                {actionLoading ? 'Processing...' : currentAction.label}
              </button>
            )}

            {activeRide.status === 'completed' && (
              <div className="text-center py-2">
                <p className="text-green-400 font-bold">✅ Ride Completed!</p>
                <p className="text-gray-500 text-sm">Final: ₹{activeRide.final_fare}</p>
              </div>
            )}

            {/* Cancel option */}
            {['accepted', 'driver_arrived'].includes(activeRide.status) && (
              <button
                onClick={() => setCancelModal(true)}
                className="text-xs text-gray-600 hover:text-red-400 text-center transition-colors"
              >
                Cancel this ride
              </button>
            )}
          </div>
        )}

        {/* Idle waiting state */}
        {isOnline && !activeRide && !incomingReq && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-16 h-16 rounded-full border-2 border-teal-400/20 flex items-center justify-center">
              <span className="text-3xl">🚗</span>
            </div>
            <p className="text-gray-400 font-medium">Waiting for ride requests</p>
            <p className="text-gray-600 text-sm">Stay in a busy area for faster matches</p>
          </div>
        )}
      </div>

      {/* ── Cancel Modal ── */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-gray-900 border-t border-gray-800 rounded-t-3xl p-6 flex flex-col gap-4">
            <h3 className="font-bold text-lg">Cancel Ride</h3>
            <p className="text-sm text-gray-400">Select a reason:</p>
            {[
              "Vehicle issue",
              "Unsafe area",
              "Rider unresponsive",
              "Personal emergency",
            ].map((r) => (
              <button
                key={r}
                onClick={() => setCancelReason(r)}
                className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                  cancelReason === r
                    ? 'border-red-400 bg-red-400/10 text-red-300'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {r}
              </button>
            ))}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { setCancelModal(false); setCancelReason(''); }}
                className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm"
              >
                Go Back
              </button>
              <button
                onClick={cancelRide}
                disabled={!cancelReason || actionLoading}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white
                  font-bold text-sm disabled:opacity-40 transition-colors"
              >
                {actionLoading ? '...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, highlight = false }) {
  return (
    <div className="flex-1 text-center px-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`font-bold text-base ${highlight ? 'text-teal-300' : 'text-gray-200'}`}>
        {value}
      </p>
    </div>
  );
}

function LocationRow({ icon, label, text }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-200 truncate">{text}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    requested:      ['Requested',       'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'],
    accepted:       ['Accepted',        'bg-blue-500/10   text-blue-400   border-blue-500/20'  ],
    driver_arrived: ['At Pickup',       'bg-teal-500/10   text-teal-400   border-teal-500/20'  ],
    in_progress:    ['In Progress',     'bg-purple-500/10 text-purple-400 border-purple-500/20'],
    completed:      ['Completed',       'bg-green-500/10  text-green-400  border-green-500/20' ],
  };
  const [label, cls] = map[status] || ['Unknown', 'bg-gray-800 text-gray-400 border-gray-700'];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}