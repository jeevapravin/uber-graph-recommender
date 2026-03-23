// src/store/rideStore.js
import { create } from 'zustand';

export const useRideStore = create((set, get) => ({
  // Matching state
  selectedVehicle: 'UberX',
  pickup: null,       // { lat, lng, address }
  dropoff: null,      // { lat, lng, address }
  nearbyDrivers: [],
  pickupH3: null,
  route: null,        // { polyline, distance_km, duration_min }
  estimatedFare: null,
  isSearching: false,

  // Active ride state
  activeRide: null,   // full ride object from backend
  driverLiveLocation: null, // { lat, lng } from WebSocket

  // UI state
  ridePhase: 'idle',  // idle | searching | selecting | waiting | in_ride | completed | cancelled

  setSelectedVehicle: (v) => set({ selectedVehicle: v }),
  setPickup: (p)  => set({ pickup: p }),
  setDropoff: (d) => set({ dropoff: d }),

  setSearchResult: ({ drivers, pickup_h3, route, estimated_fare }) =>
    set({
      nearbyDrivers: drivers,
      pickupH3: pickup_h3,
      route,
      estimatedFare: estimated_fare,
      ridePhase: 'selecting',
      isSearching: false,
    }),

  setIsSearching: (v) => set({ isSearching: v }),

  setActiveRide: (ride) => set({ activeRide: ride, ridePhase: 'waiting' }),

  setDriverLiveLocation: (loc) => set({ driverLiveLocation: loc }),

  setRidePhase: (phase) => set({ ridePhase: phase }),

  setRoute: (route) => set({ route }),

  clearRide: () => set({
    activeRide: null,
    driverLiveLocation: null,
    ridePhase: 'idle',
    nearbyDrivers: [],
    route: null,
    estimatedFare: null,
    pickupH3: null,
  }),
}));