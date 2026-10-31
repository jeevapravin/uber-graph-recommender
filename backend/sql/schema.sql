-- Online Cab Booking System schema (MySQL 8).
-- Runs once, from docker-entrypoint-initdb.d, on an empty data volume.
-- Seed rows with hashed passwords are added by the app on first start (src/seed.js).

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS cab_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cab_booking;

CREATE TABLE users (
  user_id     INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,                -- scrypt "salt:hash", never plain text
  mobile      VARCHAR(15)  NOT NULL,
  role        ENUM('PASSENGER','DRIVER','ADMIN','SUPER_ADMIN') NOT NULL,
  status      ENUM('ACTIVE','BLOCKED','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_mobile CHECK (mobile REGEXP '^[0-9]{10}$')
);

CREATE TABLE passenger_profiles (
  passenger_id      INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL UNIQUE,
  default_address   VARCHAR(255),
  emergency_contact VARCHAR(15),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE driver_profiles (
  driver_id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL UNIQUE,
  license_no          VARCHAR(30) NOT NULL UNIQUE,
  license_expiry      DATE NOT NULL,
  verification_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  rating              DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  availability        ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'OFFLINE',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_rating CHECK (rating BETWEEN 0 AND 5)
);

CREATE TABLE vehicles (
  vehicle_id     INT AUTO_INCREMENT PRIMARY KEY,
  driver_id      INT NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL UNIQUE,
  vehicle_type   ENUM('BIKE','AUTO','MINI','SEDAN','SUV') NOT NULL,
  model          VARCHAR(60) NOT NULL,
  capacity       TINYINT NOT NULL,
  status         ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  CONSTRAINT chk_vehicle_capacity CHECK (capacity BETWEEN 1 AND 8)
);

-- latitude/longitude added so the system can estimate the distance between two areas
CREATE TABLE service_areas (
  area_id   INT AUTO_INCREMENT PRIMARY KEY,
  area_name VARCHAR(80) NOT NULL,
  city      VARCHAR(60) NOT NULL,
  state     VARCHAR(60) NOT NULL,
  latitude  DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  status    ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  UNIQUE KEY uq_area (area_name, city)
);

CREATE TABLE fare_rules (
  fare_id          INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_type     ENUM('BIKE','AUTO','MINI','SEDAN','SUV') NOT NULL UNIQUE,
  base_fare        DECIMAL(8,2) NOT NULL,
  per_km_rate      DECIMAL(8,2) NOT NULL,
  per_minute_rate  DECIMAL(8,2) NOT NULL,
  cancellation_fee DECIMAL(8,2) NOT NULL DEFAULT 0,
  status           ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT chk_fare_positive CHECK (base_fare >= 0 AND per_km_rate >= 0 AND per_minute_rate >= 0 AND cancellation_fee >= 0)
);

-- extra feature: discount codes the admin manages and passengers apply when booking
CREATE TABLE promo_codes (
  promo_id     INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(20) NOT NULL UNIQUE,
  discount_pct TINYINT NOT NULL,
  max_discount DECIMAL(8,2) NOT NULL,
  valid_until  DATE NOT NULL,
  usage_limit  INT NOT NULL DEFAULT 100,
  used_count   INT NOT NULL DEFAULT 0,
  status       ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT chk_promo_pct CHECK (discount_pct BETWEEN 1 AND 90),
  CONSTRAINT chk_promo_use CHECK (used_count <= usage_limit)
);

CREATE TABLE ride_requests (
  request_id       INT AUTO_INCREMENT PRIMARY KEY,
  passenger_id     INT NOT NULL,
  pickup_area_id   INT NOT NULL,
  drop_area_id     INT NOT NULL,
  pickup_location  VARCHAR(255) NOT NULL,
  destination      VARCHAR(255) NOT NULL,
  vehicle_type     ENUM('BIKE','AUTO','MINI','SEDAN','SUV') NOT NULL,
  distance_km      DECIMAL(6,2) NOT NULL,
  requested_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estimated_fare   DECIMAL(10,2) NOT NULL,
  surge_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,  -- fixed at booking time
  promo_id         INT NULL,
  discount_pct     TINYINT NOT NULL DEFAULT 0,
  max_discount     DECIMAL(8,2) NOT NULL DEFAULT 0,
  status           ENUM('REQUESTED','ACCEPTED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  FOREIGN KEY (passenger_id)   REFERENCES passenger_profiles(passenger_id) ON DELETE CASCADE,
  FOREIGN KEY (promo_id)       REFERENCES promo_codes(promo_id) ON DELETE SET NULL,
  FOREIGN KEY (pickup_area_id) REFERENCES service_areas(area_id),
  FOREIGN KEY (drop_area_id)   REFERENCES service_areas(area_id),
  CONSTRAINT chk_request_areas CHECK (pickup_area_id <> drop_area_id),
  INDEX idx_request_status (status)
);

-- a driver who rejects a request no longer sees it; other drivers still do
CREATE TABLE request_rejections (
  request_id INT NOT NULL,
  driver_id  INT NOT NULL,
  PRIMARY KEY (request_id, driver_id),
  FOREIGN KEY (request_id) REFERENCES ride_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id)  REFERENCES driver_profiles(driver_id) ON DELETE CASCADE
);

CREATE TABLE trips (
  trip_id      INT AUTO_INCREMENT PRIMARY KEY,
  request_id   INT NOT NULL UNIQUE,                 -- one ride request becomes at most one trip
  passenger_id INT NOT NULL,
  driver_id    INT NOT NULL,
  vehicle_id   INT NOT NULL,
  start_time   DATETIME NULL,
  end_time     DATETIME NULL,
  distance_km  DECIMAL(6,2) NULL,
  fare         DECIMAL(10,2) NULL,
  fare_details JSON NULL,                           -- breakdown printed on the receipt
  trip_status  ENUM('ACCEPTED','STARTED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACCEPTED',
  FOREIGN KEY (request_id)   REFERENCES ride_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id)    REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id)   REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  CONSTRAINT chk_trip_times CHECK (end_time IS NULL OR start_time IS NULL OR end_time >= start_time),
  INDEX idx_trip_status (trip_status)
);

CREATE TABLE payments (
  payment_id     INT AUTO_INCREMENT PRIMARY KEY,
  trip_id        INT NOT NULL UNIQUE,               -- one trip has one payment
  passenger_id   INT NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  payment_method ENUM('CASH','CARD','UPI','WALLET') NULL,
  payment_status ENUM('PENDING','PAID','REFUNDED') NOT NULL DEFAULT 'PENDING',
  paid_at        DATETIME NULL,
  FOREIGN KEY (trip_id)      REFERENCES trips(trip_id) ON DELETE CASCADE,
  FOREIGN KEY (passenger_id) REFERENCES passenger_profiles(passenger_id) ON DELETE CASCADE,
  CONSTRAINT chk_payment_amount CHECK (amount >= 0)
);

-- extra feature: passengers/drivers raise an issue about a booking, admins resolve it (optionally refunding)
CREATE TABLE support_tickets (
  ticket_id   INT AUTO_INCREMENT PRIMARY KEY,
  request_id  INT NULL,
  user_id     INT NOT NULL,
  category    ENUM('FARE','DRIVER','PASSENGER','PAYMENT','SAFETY','OTHER') NOT NULL,
  message     VARCHAR(1000) NOT NULL,
  status      ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  admin_reply VARCHAR(1000),
  resolved_by INT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  FOREIGN KEY (request_id)  REFERENCES ride_requests(request_id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)     REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE ratings_reviews (
  review_id        INT AUTO_INCREMENT PRIMARY KEY,
  trip_id          INT NOT NULL,
  reviewer_id      INT NOT NULL,
  reviewed_user_id INT NOT NULL,
  rating           TINYINT NOT NULL,
  comment          VARCHAR(500),
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review (trip_id, reviewer_id),      -- one review per trip per reviewer
  FOREIGN KEY (trip_id)          REFERENCES trips(trip_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id)      REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE admin_permissions (
  permission_id   INT AUTO_INCREMENT PRIMARY KEY,
  admin_id        INT NOT NULL,
  permission_name ENUM('MANAGE_PASSENGERS','MANAGE_DRIVERS','MANAGE_VEHICLES','MANAGE_TRIPS',
                       'MANAGE_FARES','VIEW_REPORTS','VIEW_LOGS') NOT NULL,
  UNIQUE KEY uq_admin_perm (admin_id, permission_name),
  FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE system_logs (
  log_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  action      VARCHAR(50) NOT NULL,
  description VARCHAR(500),
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_logs_created (created_at)
);

-- key/value settings the Super Admin manages
CREATE TABLE system_settings (
  setting_key   VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description   VARCHAR(255),
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('app_name',               'CabGo',  'Name shown in the site header'),
  ('avg_speed_kmph',         '25',     'Average city speed used for trip time estimates'),
  ('road_factor',            '1.3',    'Road distance / straight-line distance'),
  ('platform_commission_pct','20',     'Percent of each fare kept by the platform'),
  ('surge_multiplier',       '1.0',    'Fare multiplier for peak demand (1.0 = off, max 3.0)'),
  ('allow_registrations',    'true',   'Allow new passenger/driver sign-ups'),
  ('maintenance_mode',       'false',  'Block bookings while true');

INSERT INTO service_areas (area_name, city, state, latitude, longitude) VALUES
  ('T. Nagar',        'Chennai', 'Tamil Nadu', 13.041800, 80.234100),
  ('Adyar',           'Chennai', 'Tamil Nadu', 13.001200, 80.256500),
  ('Anna Nagar',      'Chennai', 'Tamil Nadu', 13.085000, 80.210100),
  ('Velachery',       'Chennai', 'Tamil Nadu', 12.981500, 80.218000),
  ('Guindy',          'Chennai', 'Tamil Nadu', 13.006700, 80.220600),
  ('Tambaram',        'Chennai', 'Tamil Nadu', 12.924900, 80.100000),
  ('Egmore',          'Chennai', 'Tamil Nadu', 13.073200, 80.260900),
  ('Mylapore',        'Chennai', 'Tamil Nadu', 13.036800, 80.267600),
  ('Chennai Airport', 'Chennai', 'Tamil Nadu', 12.994100, 80.170900),
  ('Porur',           'Chennai', 'Tamil Nadu', 13.038200, 80.156500);

INSERT INTO fare_rules (vehicle_type, base_fare, per_km_rate, per_minute_rate, cancellation_fee) VALUES
  ('BIKE',  20, 6,  0.8, 15),
  ('AUTO',  30, 10, 1.0, 20),
  ('MINI',  40, 12, 1.5, 30),
  ('SEDAN', 60, 15, 2.0, 50),
  ('SUV',   90, 20, 2.5, 80);

CREATE TABLE password_reset_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token_hash  CHAR(64) NOT NULL,            -- SHA-256 hex digest of the raw token
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP NULL DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_hash (token_hash),
  INDEX idx_prt_user (user_id),
  INDEX idx_prt_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

INSERT INTO promo_codes (code, discount_pct, max_discount, valid_until, usage_limit) VALUES
  ('WELCOME50', 50, 100, DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 500),
  ('RIDE10',    10, 50,  DATE_ADD(CURDATE(), INTERVAL 6 MONTH), 1000);
