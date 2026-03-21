import React, { useEffect } from 'react';
import { Clock, Loader2, Car, Bike, ShieldCheck } from 'lucide-react';
import { useRide } from '../../context/RideContext';
import { estimateRide } from '../../services/api';
import useDebounce from '../../hooks/useDebounce';

export default function RidePanel() {
  const { 
    pickup, dropoff, time, setTime, 
    selectedVehicle, setSelectedVehicle, 
    jobStatus, distance, setDistance, 
    eta, setEta, route, setRoute,
    isEstimating, setIsEstimating,
    dynamicPrices, setDynamicPrices,
    nearbyDrivers, setNearbyDrivers,
    VEHICLES 
  } = useRide();

  const debouncedTime = useDebounce(time, 500);

  useEffect(() => {
    const fetchEstimate = async () => {
      if (pickup && dropoff) {
        setIsEstimating(true);
        try {
          const pickupCoords = [pickup[0], pickup[1]];
          const dropoffCoords = [dropoff[0], dropoff[1]];
          
          const result = await estimateRide(pickupCoords, dropoffCoords, debouncedTime, selectedVehicle.id);
          
          setRoute(result.route_coordinates);
          setEta(result.eta_minutes);
          setDistance(result.distance_km);
          setDynamicPrices(result.prices);
          setNearbyDrivers(result.nearby_drivers || []);
        } catch (error) {
          console.error("Failed to estimate ride", error);
        } finally {
          setIsEstimating(false);
        }
      } else {
        setDistance(null);
        setEta(null);
        setRoute([]);
        setDynamicPrices(null);
        setNearbyDrivers([]);
      }
    };

    fetchEstimate();
  }, [pickup, dropoff, debouncedTime, selectedVehicle.id, setDistance, setEta, setRoute, setIsEstimating, setDynamicPrices, setNearbyDrivers]);

  const handleConfirmRide = () => {
    const activePrice = dynamicPrices ? dynamicPrices[selectedVehicle.id] : 0;
    const payload = {
      pickup,
      dropoff,
      time,
      vehicle: selectedVehicle.id,
      distance,
      eta,
      route,
      price: activePrice
    };
    console.log('--- CONFIRM RIDE PAYLOAD ---');
    console.log(JSON.stringify(payload, null, 2));
    alert('Ride confirmed! Check console for payload.');
  };

  if (!pickup || !dropoff) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400 mt-8">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto flex items-center justify-center mb-4">
          <Clock className="w-8 h-8 text-gray-400" />
        </div>
        <p className="font-semibold text-lg text-gray-900 dark:text-white mb-2">Select locations</p>
        <p className="text-sm">Enter your pickup and dropoff points to see available rides and estimates.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2"><Clock className="w-4 h-4"/> Departure Time</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
              {time % 12 || 12}:00 {time >= 12 ? 'PM' : 'AM'}
            </span>
          </div>
          <input 
            type="range" 
            min="0" max="23" 
            value={time} 
            onChange={(e) => setTime(e.target.value)} 
            disabled={jobStatus === 'QUEUED' || jobStatus === 'PROCESSING'} 
            className="w-full accent-black dark:accent-white cursor-pointer" 
          />
        </div>

        {/* VEHICLE SELECTOR */}
        <div className="space-y-3 mb-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Available Rides</h3>
          {VEHICLES.map((v) => (
            <button 
              key={v.id}
              onClick={() => setSelectedVehicle(v)}
              disabled={isEstimating}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedVehicle.id === v.id ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'} ${isEstimating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-4">
                <v.icon className={`w-8 h-8 ${selectedVehicle.id === v.id ? 'text-black dark:text-white' : 'text-gray-400'}`} />
                <div className="text-left">
                  <div className={`font-bold ${selectedVehicle.id === v.id ? 'text-black dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{v.name}</div>
                  <div className="text-xs text-gray-500">
                    {isEstimating ? (
                      <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Calculating...</span>
                    ) : eta ? (
                      `${eta} mins away`
                    ) : (
                      'Select route for ETA'
                    )}
                  </div>
                </div>
              </div>
              <div className="font-extrabold text-lg text-gray-900 dark:text-white">
                {isEstimating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : dynamicPrices && dynamicPrices[v.id] ? (
                  `₹${dynamicPrices[v.id]}`
                ) : (
                  '--'
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* STATUS & ACTION FOOTER */}
      <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
        {(jobStatus === 'QUEUED' || jobStatus === 'PROCESSING' || isEstimating) ? (
          <button disabled className="w-full py-4 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> {isEstimating ? 'Finding Best Route...' : 'Processing...'}
          </button>
        ) : (
          <button 
            onClick={handleConfirmRide}
            disabled={!route || route.length === 0}
            className={`w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold text-lg shadow-xl hover:scale-[1.02] transition-transform ${(!route || route.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Confirm {selectedVehicle.name}
          </button>
        )}
        {distance && (
          <div className="mt-4 text-center text-xs text-gray-500 font-medium">
            {distance.toFixed(2)} km straight-line distance
          </div>
        )}
      </div>
    </div>
  );
}
