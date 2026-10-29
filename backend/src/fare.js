// Fare and distance model, shared by the estimate, booking, trip completion and receipts.

// straight-line distance between two lat/lng points, in km
function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const round2 = (n) => Math.round(n * 100) / 100;

// shortcut: road distance = straight line × road_factor; swap in a routing API for real road distance
function tripEstimate(from, to, settings) {
  const km = round2(haversineKm(from, to) * Number(settings.road_factor || 1.3));
  const minutes = Math.max(1, Math.round((km / Number(settings.avg_speed_kmph || 25)) * 60));
  return { km, minutes };
}

// fare = (base + per_km × km + per_minute × minutes) × surge, at least the base fare, minus a capped promo discount
function fareBreakdown(rule, km, minutes, { surge = 1, discountPct = 0, maxDiscount = 0 } = {}) {
  const base = rule.base_fare;
  const distance = round2(rule.per_km_rate * km);
  const time = round2(rule.per_minute_rate * minutes);
  const subtotal = Math.max(base, Math.round((base + distance + time) * surge));
  const discount = Math.min(maxDiscount, Math.round((subtotal * discountPct) / 100));
  return {
    km, minutes, base_fare: base, per_km_rate: rule.per_km_rate, per_minute_rate: rule.per_minute_rate,
    distance, time, surge, subtotal, discount, total: subtotal - discount,
  };
}

const fareFor = (rule, km, minutes, opts) => fareBreakdown(rule, km, minutes, opts).total;

module.exports = { haversineKm, tripEstimate, fareBreakdown, fareFor, round2 };
