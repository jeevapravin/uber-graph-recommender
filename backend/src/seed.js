// First-start demo data. schema.sql creates the tables; this adds users (passwords need hashing in JS)
// and a few past trips so the reports have something to show. Runs only on an empty users table.
const { q, one, tx } = require('./db');
const { hashPassword, PERMISSIONS } = require('./auth');
const { fareFor, tripEstimate } = require('./fare');

const DEMO_USERS = [
  { name: 'Super Admin', email: 'superadmin@cabgo.in', password: 'Super@123', mobile: '9000000001', role: 'SUPER_ADMIN' },
  { name: 'Anita Admin', email: 'admin@cabgo.in', password: 'Admin@123', mobile: '9000000002', role: 'ADMIN', perms: PERMISSIONS },
  { name: 'Sam Support', email: 'support@cabgo.in', password: 'Support@123', mobile: '9000000003', role: 'ADMIN', perms: ['MANAGE_TRIPS', 'MANAGE_PASSENGERS'] },
  { name: 'Priya Raman', email: 'priya@example.com', password: 'Pass@123', mobile: '9876543210', role: 'PASSENGER', address: '12 North Usman Rd, T. Nagar' },
  { name: 'Karthik S', email: 'karthik@example.com', password: 'Pass@123', mobile: '9876543211', role: 'PASSENGER', address: '4 LB Road, Adyar' },
  { name: 'Ravi Kumar', email: 'ravi@example.com', password: 'Driver@123', mobile: '9840011111', role: 'DRIVER', license: 'TN0920190001', verification: 'APPROVED', vehicle: ['TN09AB1234', 'SEDAN', 'Maruti Dzire', 4] },
  { name: 'Arun Prakash', email: 'arun@example.com', password: 'Driver@123', mobile: '9840022222', role: 'DRIVER', license: 'TN1020180002', verification: 'APPROVED', vehicle: ['TN10CD5678', 'AUTO', 'Bajaj RE', 3] },
  { name: 'Meena Devi', email: 'meena@example.com', password: 'Driver@123', mobile: '9840033333', role: 'DRIVER', license: 'TN0720210003', verification: 'PENDING', vehicle: ['TN07EF9012', 'MINI', 'Hyundai i10', 4] },
];

// [passenger email, driver email, pickup area id, drop area id, days ago, rating]
const PAST_TRIPS = [
  ['priya@example.com', 'ravi@example.com', 1, 2, 6, 5],
  ['priya@example.com', 'arun@example.com', 1, 8, 5, 4],
  ['karthik@example.com', 'ravi@example.com', 2, 9, 4, 5],
  ['priya@example.com', 'ravi@example.com', 3, 7, 3, 4],
  ['karthik@example.com', 'arun@example.com', 4, 5, 2, 3],
  ['karthik@example.com', 'ravi@example.com', 9, 1, 1, null],
];

async function migrate() {
  // Idempotent migrations for existing databases. Each creates a table only if it does not exist.
  await q(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    token_hash  CHAR(64) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP NULL DEFAULT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token_hash (token_hash),
    INDEX idx_prt_user (user_id),
    INDEX idx_prt_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  )`);
}

async function seed() {
  await migrate();
  const existing = await one('SELECT COUNT(*) AS n FROM users');
  if (existing.n > 0) return;
  console.log('Seeding demo data...');
  await tx(async (c) => {
    const ids = {};
    for (const u of DEMO_USERS) {
      const r = await q('INSERT INTO users (name, email, password, mobile, role) VALUES (?, ?, ?, ?, ?)', [u.name, u.email, hashPassword(u.password), u.mobile, u.role], c);
      ids[u.email] = { user: r.insertId };
      for (const p of u.perms || []) await q('INSERT INTO admin_permissions (admin_id, permission_name) VALUES (?, ?)', [r.insertId, p], c);
      if (u.role === 'PASSENGER') {
        const pp = await q('INSERT INTO passenger_profiles (user_id, default_address, emergency_contact) VALUES (?, ?, ?)', [r.insertId, u.address, '9123456780'], c);
        ids[u.email].passenger = pp.insertId;
      }
      if (u.role === 'DRIVER') {
        const dp = await q("INSERT INTO driver_profiles (user_id, license_no, license_expiry, verification_status) VALUES (?, ?, DATE_ADD(CURDATE(), INTERVAL 3 YEAR), ?)", [r.insertId, u.license, u.verification], c);
        const v = await q('INSERT INTO vehicles (driver_id, vehicle_number, vehicle_type, model, capacity) VALUES (?, ?, ?, ?, ?)', [dp.insertId, ...u.vehicle], c);
        Object.assign(ids[u.email], { driver: dp.insertId, vehicle: v.insertId, type: u.vehicle[1] });
      }
    }

    const areas = Object.fromEntries((await q('SELECT * FROM service_areas', [], c)).map((a) => [a.area_id, a]));
    const rules = Object.fromEntries((await q('SELECT * FROM fare_rules', [], c)).map((f) => [f.vehicle_type, f]));
    for (const [pEmail, dEmail, from, to, daysAgo, rating] of PAST_TRIPS) {
      const p = ids[pEmail];
      const d = ids[dEmail];
      const { km, minutes } = tripEstimate(areas[from], areas[to], { road_factor: 1.3, avg_speed_kmph: 25 });
      const fare = fareFor(rules[d.type], km, minutes);
      const at = `DATE_SUB(NOW(), INTERVAL ${Number(daysAgo)} DAY)`;
      const r = await q(
        `INSERT INTO ride_requests (passenger_id, pickup_area_id, drop_area_id, pickup_location, destination, vehicle_type, distance_km, requested_at, estimated_fare, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${at}, ?, 'COMPLETED')`,
        [p.passenger, from, to, areas[from].area_name, areas[to].area_name, d.type, km, fare],
        c,
      );
      const t = await q(
        `INSERT INTO trips (request_id, passenger_id, driver_id, vehicle_id, start_time, end_time, distance_km, fare, trip_status)
         VALUES (?, ?, ?, ?, DATE_ADD(${at}, INTERVAL 5 MINUTE), DATE_ADD(${at}, INTERVAL ${5 + minutes} MINUTE), ?, ?, 'COMPLETED')`,
        [r.insertId, p.passenger, d.driver, d.vehicle, km, fare],
        c,
      );
      await q(`INSERT INTO payments (trip_id, passenger_id, amount, payment_method, payment_status, paid_at) VALUES (?, ?, ?, 'UPI', 'PAID', DATE_ADD(${at}, INTERVAL ${6 + minutes} MINUTE))`, [t.insertId, p.passenger, fare], c);
      if (rating) await q('INSERT INTO ratings_reviews (trip_id, reviewer_id, reviewed_user_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [t.insertId, p.user, d.user, rating, rating >= 4 ? 'Smooth ride, polite driver.' : 'Okay ride.'], c);
    }
    await q(
      `UPDATE driver_profiles d SET rating = COALESCE((SELECT ROUND(AVG(rating), 2) FROM ratings_reviews WHERE reviewed_user_id = d.user_id), 0)`,
      [],
      c,
    );
    await q("INSERT INTO system_logs (user_id, action, description, ip_address) VALUES (NULL, 'SEED', 'Demo data created', '127.0.0.1')", [], c);
  });
}

module.exports = { seed };
