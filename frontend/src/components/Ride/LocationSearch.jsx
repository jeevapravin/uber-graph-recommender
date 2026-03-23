// src/components/Ride/LocationSearch.jsx
// Uses OpenStreetMap Nominatim for free geocoding.
// Debounced at 400ms — do NOT hit their API on every keystroke, you'll get rate-limited.
import React, { useState, useEffect, useRef, useCallback } from 'react';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function geocode(query) {
  if (!query || query.length < 3) return [];
  const params = new URLSearchParams({
    q:               query + ', Bangalore, India',
    format:          'json',
    limit:           5,
    addressdetails:  1,
    countrycodes:    'in',
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'Accept-Language': 'en' },
  });
  return res.json();
}

export default function LocationSearch({ label, value, onSelect, icon }) {
  const [query,    setQuery]    = useState(value?.address || '');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const debouncedQuery = useDebounce(query, 400);
  const containerRef   = useRef(null);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery === value?.address) {
      setResults([]);
      return;
    }
    setLoading(true);
    geocode(debouncedQuery)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((result) => {
    const address = result.display_name.split(',').slice(0, 3).join(',').trim();
    setQuery(address);
    setOpen(false);
    setResults([]);
    onSelect({
      lat:     parseFloat(result.lat),
      lng:     parseFloat(result.lon),
      address: address,
    });
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
        {icon} {label}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
          text-gray-100 text-sm placeholder-gray-600 outline-none
          focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 transition-all"
      />

      {/* Dropdown */}
      {open && (results.length > 0 || loading) && (
        <div className="absolute top-full mt-1 left-0 right-0 z-[9999]
          bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
          {loading && (
            <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-2">
              <span className="animate-spin">⟳</span> Searching...
            </div>
          )}
          {results.map((r) => {
            const parts = r.display_name.split(',');
            return (
              <button
                key={r.place_id}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors
                  border-b border-gray-800 last:border-0"
              >
                <p className="text-sm text-gray-200 truncate">{parts.slice(0, 2).join(',')}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{parts.slice(2, 4).join(',')}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}