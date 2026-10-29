// Unit checks for the fare model: node --test test/fare.test.js
const test = require('node:test');
const assert = require('node:assert');
const { haversineKm, tripEstimate, fareBreakdown } = require('../src/fare');

const sedan = { base_fare: 60, per_km_rate: 15, per_minute_rate: 2 };

test('haversine: T. Nagar to Adyar is about 5 km in a straight line', () => {
  const km = haversineKm({ latitude: 13.0418, longitude: 80.2341 }, { latitude: 13.0012, longitude: 80.2565 });
  assert.ok(km > 4.8 && km < 5.6, String(km));
});

test('estimate applies road factor and average speed', () => {
  const e = tripEstimate({ latitude: 13, longitude: 80 }, { latitude: 13.1, longitude: 80 }, { road_factor: 1.3, avg_speed_kmph: 26 });
  assert.equal(Math.round(e.km), 14); // 11.12 km × 1.3
  assert.equal(e.minutes, Math.round((e.km / 26) * 60));
});

test('fare = base + km + minutes, surge multiplies, promo is capped', () => {
  assert.equal(fareBreakdown(sedan, 10, 20).total, 60 + 150 + 40);
  assert.equal(fareBreakdown(sedan, 10, 20, { surge: 1.5 }).total, 375);
  const promo = fareBreakdown(sedan, 10, 20, { discountPct: 50, maxDiscount: 100 });
  assert.equal(promo.discount, 100);
  assert.equal(promo.total, 150);
});

test('fare never drops below the base fare', () => {
  assert.equal(fareBreakdown(sedan, 0, 0).subtotal, 60);
});
