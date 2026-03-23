// src/components/Ride/VehicleSelector.jsx
import React from 'react';
import { useRideStore } from '../../store/rideStore';

const VEHICLES = [
  {
    type:    'Moto',
    label:   'Moto',
    desc:    'Fastest for solo',
    icon:    '🏍️',
    badge:   '2 min',
  },
  {
    type:    'UberX',
    label:   'UberX',
    desc:    'Comfortable sedan',
    icon:    '🚗',
    badge:   '4 min',
  },
  {
    type:    'UberXL',
    label:   'UberXL',
    desc:    'For groups up to 6',
    icon:    '🚙',
    badge:   '6 min',
  },
];

export default function VehicleSelector() {
  const { selectedVehicle, setSelectedVehicle, estimatedFare, nearbyDrivers, isSearching } =
    useRideStore();

  const driverCount = (type) => nearbyDrivers.filter((d) => d.vehicle_type === type).length;

  return (
    <div className="flex flex-col gap-2 w-full">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Select ride type</p>
      {VEHICLES.map(({ type, label, desc, icon, badge }) => {
        const isActive = selectedVehicle === type;
        const count    = driverCount(type);

        return (
          <button
            key={type}
            onClick={() => setSelectedVehicle(type)}
            className={`
              flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all duration-200
              ${isActive
                ? 'border-teal-400 bg-teal-400/10 shadow-lg shadow-teal-500/10'
                : 'border-gray-700 bg-gray-800/60 hover:border-gray-500'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div className="text-left">
                <p className={`font-semibold text-sm ${isActive ? 'text-teal-300' : 'text-gray-200'}`}>
                  {label}
                </p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {isActive && estimatedFare ? (
                <span className="text-teal-300 font-bold text-sm">₹{estimatedFare}</span>
              ) : (
                <span className="text-xs text-gray-500">{badge} away</span>
              )}
              <span className="text-xs text-gray-600">
                {isSearching ? '...' : count > 0 ? `${count} nearby` : 'None nearby'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}