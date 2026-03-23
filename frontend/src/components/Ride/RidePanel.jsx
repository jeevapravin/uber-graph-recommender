// src/components/Ride/RidePanel.jsx
// The bottom sheet that orchestrates the entire rider flow.
// Phases: idle → searching → selecting → booking → [activeRide]
import React, { useState, useCallback } from 'react';
import { matchAPI, ridesAPI } from '../../services/api';
import { useRideStore } from '../../store/rideStore';
import { useAuthStore } from '../../store/authStore';
import LocationSearch from './LocationSearch';
import VehicleSelector from './VehicleSelector';
import ActiveRidePanel from './ActiveRidePanel';

export default function RidePanel() {
  const {
    pickup, setPickup,
    dropoff, setDropoff,
    selectedVehicle,
    nearbyDrivers,
    ridePhase, setRidePhase,
    setSearchResult,
    setIsSearching,
    isSearching,
    estimatedFare,
    route,
    setActiveRide,
    activeRide,
  } = useRideStore();

  const { name } = useAuthStore();
  const [error,    setError]   = useState('');
  const [booking,  setBooking] = useState(false);

  // ── Step 1: Search for drivers ──────────────────────────────────────────
  const searchDrivers = useCallback(async () => {
    if (!pickup || !dropoff) {
      setError('Set both pickup and dropoff locations');
      return;
    }
    setError('');
    setIsSearching(true);
    setRidePhase('searching');

    try {
      const res = await matchAPI.findDrivers({
        pickup_lat:   pickup.lat,
        pickup_lng:   pickup.lng,
        dropoff_lat:  dropoff.lat,
        dropoff_lng:  dropoff.lng,
        vehicle_type: selectedVehicle,
      });
      setSearchResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Search failed. Check your connection.');
      setRidePhase('idle');
    } finally {
      setIsSearching(false);
    }
  }, [pickup, dropoff, selectedVehicle]);

  // ── Step 2: Book the best available driver ───────────────────────────────
  const bookRide = useCallback(async () => {
    const availableDrivers = nearbyDrivers.filter((d) => d.vehicle_type === selectedVehicle);
    if (!availableDrivers.length) {
      setError('No drivers available right now. Try again.');
      return;
    }

    setBooking(true);
    setError('');

    // Pick highest-rated available driver
    const driver = availableDrivers.sort((a, b) => b.rating - a.rating)[0];

    try {
      const res = await ridesAPI.create({
        driver_id:      driver.id,
        pickup_lat:     pickup.lat,
        pickup_lng:     pickup.lng,
        pickup_address: pickup.address,
        dropoff_lat:    dropoff.lat,
        dropoff_lng:    dropoff.lng,
        dropoff_address: dropoff.address,
        vehicle_type:   selectedVehicle,
        polyline:       route?.polyline,
        distance_km:    route?.distance_km,
        duration_min:   route?.duration_min,
        estimated_fare: estimatedFare,
      });
      setActiveRide(res.data);
      setRidePhase('waiting');
    } catch (err) {
      setError(err.response?.data?.detail || 'Booking failed. Try again.');
      setRidePhase('selecting');
    } finally {
      setBooking(false);
    }
  }, [nearbyDrivers, selectedVehicle, pickup, dropoff, route, estimatedFare]);

  // ── Active ride phases bypass the booking UI ─────────────────────────────
  const isActiveRidePhase = ['waiting', 'driver_arrived', 'in_ride', 'completed', 'cancelled']
    .includes(ridePhase);

  const driverCountForVehicle = nearbyDrivers.filter((d) => d.vehicle_type === selectedVehicle).length;

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Greeting */}
      {!isActiveRidePhase && (
        <div>
          <h2 className="text-white font-bold text-lg">
            Hey, {name?.split(' ')[0]} 👋
          </h2>
          <p className="text-gray-500 text-sm">Where are you going?</p>
        </div>
      )}

      {/* Active ride UI */}
      {isActiveRidePhase ? (
        <ActiveRidePanel />
      ) : (
        <>
          {/* Location inputs */}
          <div className="flex flex-col gap-3">
            <LocationSearch
              label="Pickup"
              icon="🟢"
              value={pickup}
              onSelect={setPickup}
            />
            <LocationSearch
              label="Dropoff"
              icon="🔴"
              value={dropoff}
              onSelect={setDropoff}
            />
          </div>

          {/* Route summary */}
          {route && (
            <div className="flex gap-3 bg-gray-800/60 rounded-xl px-4 py-2.5 border border-gray-700">
              <Stat label="Distance" value={`${route.distance_km} km`} />
              <div className="w-px bg-gray-700" />
              <Stat label="Est. time" value={`${Math.round(route.duration_min)} min`} />
              {estimatedFare && (
                <>
                  <div className="w-px bg-gray-700" />
                  <Stat label="Fare" value={`₹${estimatedFare}`} highlight />
                </>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Vehicle selector — only shown after search */}
          {(ridePhase === 'selecting' || ridePhase === 'searching') && (
            <VehicleSelector />
          )}

          {/* Primary CTA */}
          {ridePhase === 'idle' || ridePhase === 'searching' ? (
            <button
              onClick={searchDrivers}
              disabled={!pickup || !dropoff || isSearching}
              className="w-full bg-teal-400 hover:bg-teal-300 disabled:opacity-40
                disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-xl
                transition-all text-sm tracking-wide"
            >
              {isSearching ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⟳</span>
                  Finding drivers...
                </span>
              ) : 'Search Rides'}
            </button>
          ) : ridePhase === 'selecting' ? (
            <button
              onClick={bookRide}
              disabled={booking || driverCountForVehicle === 0}
              className="w-full bg-teal-400 hover:bg-teal-300 disabled:opacity-40
                disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-xl
                transition-all text-sm tracking-wide"
            >
              {booking
                ? 'Booking...'
                : driverCountForVehicle === 0
                  ? 'No drivers available'
                  : `Book ${selectedVehicle}${estimatedFare ? ` · ₹${estimatedFare}` : ''}`}
            </button>
          ) : null}

          {/* Reset */}
          {ridePhase === 'selecting' && (
            <button
              onClick={() => {
                setRidePhase('idle');
                useRideStore.getState().clearRide();
              }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors text-center"
            >
              ← Search again
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight = false }) {
  return (
    <div className="flex-1 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-teal-300' : 'text-gray-200'}`}>{value}</p>
    </div>
  );
}