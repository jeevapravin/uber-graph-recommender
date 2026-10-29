# CabGo: Online Cab Booking System

Web Technology assignment: HTML/CSS, JavaScript + DOM, AJAX/Fetch, Node.js and MySQL.
No React, Angular, Vue or Express: the server is Node's built-in `http` module, and the pages are
plain HTML with JavaScript that calls the REST API with `fetch` and updates the DOM.

## Run it

Needs Docker.

```sh
cp .env.example .env    # optional: set APP_SECRET, DB passwords, an LLM key for AI ticket replies
docker compose up --build
```

Open http://localhost:3000. MySQL runs in its own container; `backend/sql/schema.sql` creates the tables on
first start and the app seeds demo data. `docker compose down -v` resets the database.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Passenger | priya@example.com | Pass@123 |
| Driver | ravi@example.com | Driver@123 |
| Admin (all permissions) | admin@cabgo.in | Admin@123 |
| Admin (trips + passengers only) | support@cabgo.in | Support@123 |
| Super Admin | superadmin@cabgo.in | Super@123 |

The login page has one-click buttons for each.

### Tests

```sh
docker compose exec app node --test   # fare unit tests + full API flow for all four roles
```

## What it does

| Role | Features |
|---|---|
| Passenger | search rides and fares, book with a promo code, follow the trip live, cancel (fee after a driver accepts), SOS, pay (UPI/card/cash/wallet), rate the driver, trip history, receipts, support tickets |
| Driver | go online/offline, accept or reject requests, start and complete trips, manage own vehicles, earnings after commission, ratings |
| Admin | passengers and drivers (approve, block), vehicles, trips (start, complete, cancel, refund), support tickets, fare rules, service areas, promo codes, reports with CSV export, logs (last 7 days) |
| Super Admin | create/update/deactivate/delete admins, assign permissions, full system logs with filters and CSV, system settings (surge, commission, maintenance mode…) |

Fare = (base + per-km × km + per-minute × minutes) × surge − promo, never below the base fare.
Distance between service areas is the straight-line distance × a road factor.

## Layout

```
backend/                 Node.js REST API (node:http, no Express)
  server.js              static files (../frontend) + REST API
  src/http.js            router, JSON body parsing, input validation
  src/auth.js            scrypt passwords, HMAC-signed tokens, roles and admin permissions, system logs
  src/fare.js            distance and fare model
  src/bookings.js        shared booking queries and trip state changes
  src/routes/*.js        REST endpoints per role
  sql/schema.sql         tables, keys and constraints
  test/                  node:test unit and API tests
  Dockerfile
frontend/                plain HTML/CSS/JS pages, served by the backend
  *.html                 one page per screen
  css/style.css, js/     styles, fetch + DOM helpers (js/common.js)
  figures/               animated isometric figures (taximeter, roof sign, trip route, receipt printer)
  figures-src/           build scripts for those figures
.github/workflows/ci.yml builds with docker compose and runs the tests
docker-compose.yml       MySQL + the app
```

`mysql2` (in `backend/package.json`) is the only npm dependency: Node has no built-in MySQL client.
