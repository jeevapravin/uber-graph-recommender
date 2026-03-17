import { useState, useCallback, useRef } from 'react';

export function useGeocoding(delay = 500) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  const search = useCallback((query) => {
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
        );
        
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        
        const formattedSuggestions = data.map((item) => ({
          id: item.place_id,
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          address: item.address,
        }));

        setSuggestions(formattedSuggestions);
      } catch (err) {
        console.error('Geocoding error:', err);
        setError(err.message);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, delay);
  }, [delay]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  return { suggestions, isLoading, error, search, clearSuggestions };
}
