// src/services/api.js
// Centralized axios instance. ALL API calls go through here.
// Never write raw fetch() calls scattered across components — that's chaos.
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request automatically
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handler — logout and redirect
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authAPI = {
  registerRider:  (data) => api.post('/auth/rider/register',  data),
  loginRider:     (data) => api.post('/auth/rider/login',     data),
  registerDriver: (data) => api.post('/auth/driver/register', data),
  loginDriver:    (data) => api.post('/auth/driver/login',    data),
};

// ─── Matching ────────────────────────────────────────────────────────────────
export const matchAPI = {
  findDrivers: (data) => api.post('/match/', data),
  updateLocation: (lat, lng) =>
    api.patch('/match/driver/location', null, { params: { lat, lng } }),
};

// ─── Rides ───────────────────────────────────────────────────────────────────
export const ridesAPI = {
  create:          (data)           => api.post('/rides/', data),
  accept:          (rideId)         => api.patch(`/rides/${rideId}/accept`),
  arrived:         (rideId)         => api.patch(`/rides/${rideId}/arrived`),
  start:           (rideId)         => api.patch(`/rides/${rideId}/start`),
  complete:        (rideId)         => api.patch(`/rides/${rideId}/complete`),
  cancelByRider:   (rideId, reason) => api.patch(`/rides/${rideId}/cancel/rider`,  { reason }),
  cancelByDriver:  (rideId, reason) => api.patch(`/rides/${rideId}/cancel/driver`, { reason }),
  rate:            (rideId, data)   => api.post(`/rides/${rideId}/rate`, data),
  history:         (params)         => api.get('/rides/history', { params }),
};

// ─── WebSocket factory ───────────────────────────────────────────────────────
const WS_BASE = API_BASE.replace('http', 'ws');

export const createRideSocket = (rideId) =>
  new WebSocket(`${WS_BASE}/rides/ws/ride/${rideId}`);

export const createDriverSocket = (driverId) =>
  new WebSocket(`${WS_BASE}/rides/ws/driver/${driverId}`);