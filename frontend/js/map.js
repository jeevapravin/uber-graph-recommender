// CabGo: Theme-aligned Leaflet route map engine for booking & live trip tracking.
(function () {
  'use strict';

  // Free, high-performance basemap tile layers (Zero API keys required, zero watermarks)
  const TILES = {
    dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };

  function isDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? false : true;
  }

  // Create clean HTML/SVG markers matching the app's badge styles
  function createPinIcon(type, label = '') {
    const isPickup = type === 'pickup';
    const bg = isPickup ? '#30a46c' : '#e5484d';
    const text = label || (isPickup ? 'A' : 'B');
    return L.divIcon({
      className: 'cab-map-pin-wrap',
      html: `
        <div class="cab-map-pin ${isPickup ? 'pickup' : 'drop'}">
          <div class="pin-ring"></div>
          <div class="pin-core" style="background:${bg}">${text}</div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    });
  }

  function createCabIcon(vehicleType = 'CAB') {
    return L.divIcon({
      className: 'cab-map-cab-wrap',
      html: `
        <div class="cab-map-cab">
          <div class="cab-pulse"></div>
          <div class="cab-body" title="${vehicleType}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4.66l.12-.34h13.77l.11.34V17z"/>
              <circle cx="7.5" cy="14.5" r="1.5"/>
              <circle cx="16.5" cy="14.5" r="1.5"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  // Initialize a Leaflet map inside a container
  function init(containerEl, { defaultCenter = [13.0418, 80.2341], defaultZoom = 12 } = {}) {
    if (!window.L) {
      console.warn('Leaflet library is not loaded');
      return null;
    }
    if (typeof containerEl === 'string') containerEl = document.querySelector(containerEl);
    if (!containerEl) return null;

    const dark = isDark();
    const map = L.map(containerEl, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    }).setView(defaultCenter, defaultZoom);

    // Zoom control at bottom right to avoid header collision
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Subtle attribution
    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution(TILES.attribution)
      .addTo(map);

    // Theme tile layer
    const tileUrl = dark ? TILES.dark : TILES.light;
    const tileLayer = L.tileLayer(tileUrl, {
      maxNativeZoom: 16,
      maxZoom: 19,
    }).addTo(map);

    // Fallback to standard OpenStreetMap if Esri is unreachable
    tileLayer.on('tileerror', function () {
      if (tileLayer._url !== TILES.osm) {
        tileLayer.setUrl(TILES.osm);
      }
    });

    // Listen for theme preference changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        tileLayer.setUrl(e.matches ? TILES.dark : TILES.light);
      });
    }

    let pickupMarker = null;
    let dropMarker = null;
    let cabMarker = null;
    let routeHalo = null;
    let routeLine = null;
    let areaMarkers = [];

    function setAreas(areas, onSelect) {
      areaMarkers.forEach((m) => map.removeLayer(m));
      areaMarkers = [];
      if (!Array.isArray(areas)) return;

      areas.forEach((a) => {
        if (!a.latitude || !a.longitude) return;
        const lat = Number(a.latitude);
        const lng = Number(a.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const icon = L.divIcon({
          className: 'cab-map-station-wrap',
          html: `<div class="cab-map-station" title="${a.area_name}"><span class="dot"></span></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const m = L.marker([lat, lng], { icon }).addTo(map);
        m.bindPopup(`
          <div class="cab-map-popup">
            <span class="badge info">SERVICE AREA</span>
            <b>${a.area_name}</b>
            <small class="muted">${a.city || 'Chennai'}</small>
          </div>
        `);
        areaMarkers.push(m);
      });
    }

    function clearRoute() {
      if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
      if (dropMarker) { map.removeLayer(dropMarker); dropMarker = null; }
      if (cabMarker) { map.removeLayer(cabMarker); cabMarker = null; }
      if (routeHalo) { map.removeLayer(routeHalo); routeHalo = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    }

    function renderRoute({ pickup, drop, vehicleType = 'CAB', stage = null }) {
      if (!pickup || !drop || !pickup.latitude || !drop.latitude) {
        clearRoute();
        return;
      }

      const pLat = Number(pickup.latitude);
      const pLng = Number(pickup.longitude);
      const dLat = Number(drop.latitude);
      const dLng = Number(drop.longitude);

      if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) return;

      const pLatLng = [pLat, pLng];
      const dLatLng = [dLat, dLng];
      const waypoints = [pLatLng, dLatLng];

      // Route lines (casing + primary accent line)
      if (routeHalo) map.removeLayer(routeHalo);
      if (routeLine) map.removeLayer(routeLine);

      routeHalo = L.polyline(waypoints, {
        color: '#000000',
        weight: 7,
        opacity: 0.6,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      routeLine = L.polyline(waypoints, {
        color: '#f5c400',
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: stage === 'STARTED' ? '8, 8' : null,
      }).addTo(map);

      // Pickup Marker
      if (pickupMarker) map.removeLayer(pickupMarker);
      pickupMarker = L.marker(pLatLng, { icon: createPinIcon('pickup', 'A') }).addTo(map);
      pickupMarker.bindPopup(`
        <div class="cab-map-popup">
          <span class="badge ok">PICKUP</span>
          <b>${pickup.area_name || 'Pickup Point'}</b>
          <small class="muted">${pickup.city || 'Chennai'}</small>
        </div>
      `);

      // Destination Marker
      if (dropMarker) map.removeLayer(dropMarker);
      dropMarker = L.marker(dLatLng, { icon: createPinIcon('drop', 'B') }).addTo(map);
      dropMarker.bindPopup(`
        <div class="cab-map-popup">
          <span class="badge bad">DESTINATION</span>
          <b>${drop.area_name || 'Drop Point'}</b>
          <small class="muted">${drop.city || 'Chennai'}</small>
        </div>
      `);

      // Live vehicle marker positioning based on trip stage
      if (stage) {
        let cabPos = pLatLng;
        if (stage === 'STARTED') {
          // Halfway along the route in progress
          cabPos = [(pLat + dLat) / 2, (pLng + dLng) / 2];
        } else if (stage === 'COMPLETED') {
          cabPos = dLatLng;
        }

        if (cabMarker) map.removeLayer(cabMarker);
        cabMarker = L.marker(cabPos, { icon: createCabIcon(vehicleType), zIndexOffset: 1000 }).addTo(map);
        cabMarker.bindPopup(`
          <div class="cab-map-popup">
            <span class="badge info">${vehicleType}</span>
            <b>Driver Position</b>
            <small class="muted">Stage: ${stage}</small>
          </div>
        `);
      } else if (cabMarker) {
        map.removeLayer(cabMarker);
        cabMarker = null;
      }

      // Smoothly fit bounds
      map.fitBounds(L.latLngBounds(pLatLng, dLatLng), {
        padding: [45, 45],
        maxZoom: 14,
        animate: true,
      });
    }

    // Call map.invalidateSize() when container unhides or resizes
    function resize() {
      setTimeout(() => map.invalidateSize(), 80);
    }

    return {
      map,
      setAreas,
      renderRoute,
      clearRoute,
      resize,
    };
  }

  window.CabMap = { init };
})();

