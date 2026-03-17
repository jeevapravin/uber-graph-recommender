import React, { createContext, useContext, useState } from 'react';
import { Car, Bike, ShieldCheck } from 'lucide-react';

export const VEHICLES = [
  { id: 'moto', name: 'Uber Moto', icon: Bike, multiplier: 0.6, baseFare: 20, timeMultiplier: 0.8 },
  { id: 'uberx', name: 'UberX', icon: Car, multiplier: 1.0, baseFare: 50, timeMultiplier: 1.0 },
  { id: 'uberxl', name: 'UberXL', icon: ShieldCheck, multiplier: 1.5, baseFare: 80, timeMultiplier: 1.2 },
];

const RideContext = createContext();

export function RideProvider({ children }) {
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [time, setTime] = useState(12);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLES[1]); // Default UberX
  
  const [jobStatus, setJobStatus] = useState('IDLE');
  const [activeRideId, setActiveRideId] = useState(null);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  const [route, setRoute] = useState([]);

  // Store the full address or place object for UI display
  const [pickupLocation, setPickupLocation] = useState(null);
  const [dropoffLocation, setDropoffLocation] = useState(null);

  const value = {
    pickup, setPickup,
    dropoff, setDropoff,
    time, setTime,
    selectedVehicle, setSelectedVehicle,
    jobStatus, setJobStatus,
    activeRideId, setActiveRideId,
    eta, setEta,
    distance, setDistance,
    route, setRoute,
    pickupLocation, setPickupLocation,
    dropoffLocation, setDropoffLocation,
    VEHICLES,
  };

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  );
}

export function useRide() {
  const context = useContext(RideContext);
  if (!context) {
    throw new Error('useRide must be used within a RideProvider');
  }
  return context;
}
