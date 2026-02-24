# Uber Graph Recommender

A FastAPI application that uses OSMnx and an ensemble of ML models (XGBoost, LightGBM, Random Forest) to calculate optimal routing and ETA scores for rides.

## Structure
- `src/`: Application source code (`app.py`, `matcher.py`, `simulator.py`).
- `data/`: Datasets.
- `models/`: Pre-trained ML models.
- `notebooks/`: Jupyter notebooks for data analysis.
- `scripts/`: Helper scripts.

## Setup
1. Use Python 3.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Ensure you have the `models/` directory correctly populated with your `.pkl` files.

## Running the API
From the root directory, start the server:
```bash
.venv/bin/python src/app.py
```
Or with uvicorn directly:
```bash
.venv/bin/uvicorn src.app:app --reload
```

## Running the Simulator
To test the API, run the simulator script while the FastAPI server is active:
```bash
.venv/bin/python src/simulator.py
```
