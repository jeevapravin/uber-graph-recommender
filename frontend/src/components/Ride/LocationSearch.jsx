import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { useRide } from '../../context/RideContext';
import { useGeocoding } from '../../hooks/useGeocoding';

export default function LocationSearch() {
  const { setPickup, setDropoff, pickupLocation, setPickupLocation, dropoffLocation, setDropoffLocation } = useRide();
  const [activeInput, setActiveInput] = useState(null); // 'pickup' or 'dropoff'
  const [query, setQuery] = useState('');
  
  const { suggestions, isLoading, search, clearSuggestions } = useGeocoding(300);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setActiveInput(null);
        clearSuggestions();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [clearSuggestions]);

  useEffect(() => {
    if (activeInput) {
      search(query);
    }
  }, [query, activeInput, search]);

  const handleSelect = (place) => {
    if (activeInput === 'pickup') {
      setPickup([place.lat, place.lon]);
      setPickupLocation(place);
    } else {
      setDropoff([place.lat, place.lon]);
      setDropoffLocation(place);
    }
    setQuery('');
    setActiveInput(null);
    clearSuggestions();
  };

  const renderInput = (type, placeholder, icon, value, locationState) => {
    const isActive = activeInput === type;
    const displayValue = isActive ? query : (locationState ? locationState.displayName : '');

    return (
      <div className="relative flex items-center mb-3">
        <div className="absolute left-3 text-gray-400">
          {icon}
        </div>
        <input
          type="text"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            if (!isActive) setActiveInput(type);
            setQuery(e.target.value);
            if (type === 'pickup' && !isActive) setPickupLocation(null);
            if (type === 'dropoff' && !isActive) setDropoffLocation(null);
          }}
          onFocus={() => {
            setActiveInput(type);
            setQuery(locationState ? locationState.displayName : '');
          }}
          className={`w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all ${isActive ? 'ring-2 ring-black dark:ring-white bg-white dark:bg-gray-900 shadow-lg' : ''}`}
        />
        {locationState && !isActive && (
          <button 
            className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            onClick={(e) => {
              e.stopPropagation();
              if (type === 'pickup') { setPickupLocation(null); setPickup(null); }
              else { setDropoffLocation(null); setDropoff(null); }
            }}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative z-50 p-4" ref={wrapperRef}>
      <div className="relative before:absolute before:inset-y-0 before:left-[21px] before:w-[2px] before:bg-gray-200 dark:before:bg-gray-700 before:z-0 py-2">
        <div className="relative z-10">
          {renderInput('pickup', 'Pickup Location', <Navigation className="w-4 h-4 text-green-500" />, query, pickupLocation)}
          {renderInput('dropoff', 'Dropoff Location', <MapPin className="w-4 h-4 text-red-500" />, query, dropoffLocation)}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {activeInput && (query.length > 2 || suggestions.length > 0) && (
        <div className="absolute left-4 right-4 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-50 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Searching...</div>
          ) : suggestions.length > 0 ? (
            <ul>
              {suggestions.map((place) => (
                <li 
                  key={place.id}
                  onClick={() => handleSelect(place)}
                  className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-50 dark:border-gray-800/50 last:border-0 transition-colors flex items-start gap-3"
                >
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{place.address?.name || place.displayName.split(',')[0]}</p>
                    <p className="text-xs text-gray-500 truncate">{place.displayName}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : query.length > 2 ? (
            <div className="p-4 text-center text-gray-500 text-sm">No results found</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
