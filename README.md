# Uber Spatial ETA & Routing Engine 🚗

A production-grade, asynchronous spatial routing platform. This system calculates exact street-network distances using OpenStreetMap data and predicts arrival times using an ensemble Machine Learning model, all orchestrated through a distributed asynchronous queue.

## 🏗 System Architecture

Unlike standard API CRUD apps, this engine is built to handle heavy, CPU-bound matrix mathematics without blocking the main event loop.

1. **FastAPI (The Gateway):** Receives the coordinate payload, writes a pending row to the PostGIS database, drops a message into Redis, and immediately returns a `202 Accepted` to keep the UI responsive.
2. **Redis (The Broker):** Acts as the high-speed message broker holding the queue of ride requests.
3. **Celery (The Muscle):** Background worker nodes pick up tasks from Redis. They dynamically download and cache localized OpenStreetMap bounding boxes, execute Dijkstra's algorithm for street snapping, and run the ML inference engine to predict ETA.
4. **PostGIS (The Memory):** PostgreSQL with the PostGIS extension stores the resulting path as a mathematically queryable `LINESTRING` geometry. 
5. **WebSockets:** A real-time socket connection streams simulated driver coordinates at 1Hz to the client.

## 💻 Tech Stack

* **Frontend:** React, Vite, TailwindCSS, React-Leaflet, Uber H3-js (Spatial Hexagons)
* **Backend:** FastAPI, Uvicorn, SQLAlchemy, GeoAlchemy2
* **Distributed Queue:** Celery, Redis
* **Database:** PostgreSQL + PostGIS (Hosted on Supabase)
* **Spatial/ML Engine:** OSMnx, NetworkX, Scikit-Learn, XGBoost, Pandas

## ✨ Key Features

* **Dynamic Bounding-Box Caching:** The engine automatically calculates the Haversine distance of a trip, downloads a custom OpenStreetMap chunk with a 30% safety buffer, and caches it to disk. Future rides in that grid load in sub-seconds.
* **Silent Failure Prevention:** Explicit type casting from C-level NumPy datatypes to native Python prevents database serialization crashes.
* **Live Driver Streaming:** WebSockets push location updates to the client without aggressive HTTP polling.
* **Dynamic Pricing Engine:** React calculates base fares and time multipliers natively based on exact spatial kilometers.

## 🚀 Local Development Setup

**1. Clone the repository**
```bash
git clone [https://github.com/yourusername/uber-graph-recommender.git](https://github.com/yourusername/uber-graph-recommender.git)
cd uber-graph-recommender
2. Start the Message Broker (Docker Required)

Bash
docker run -d -p 6379:6379 redis
3. Configure Environment Variables
Create a .env file in the root directory and add your PostGIS database URL:

Code snippet
DATABASE_URL="postgresql://user:password@host:port/dbname"
4. Start the Backend API & Worker
Open two separate terminal windows.

Bash
# Terminal 1: The FastAPI Server
pip install -r requirements.txt
uvicorn src.app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: The Celery Worker
celery -A src.worker.celery_app worker --loglevel=info
5. Start the React Frontend
Open a third terminal window.

Bash
cd frontend
npm install
npm run dev
🧠 Machine Learning Pipeline
The historical EDA, feature engineering, and model training pipelines are preserved in the notebooks/ directory. The production engine uses a pre-trained joblib artifact to execute sub-second inference inside the Celery worker.

Built by Jeeva Pravin.