// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AuthPage from './components/Auth/AuthPage';
import RiderHome from './pages/RiderHome';
import DriverDashboard from './components/Driver/DriverDashboard';

// ─── Route guards ────────────────────────────────────────────────────────────
function RequireAuth({ children, requiredRole }) {
  const { isAuthenticated, role } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === 'driver' ? '/driver' : '/'} replace />;
  }
  return children;
}

function RedirectIfAuthed({ children }) {
  const { isAuthenticated, role } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to={role === 'driver' ? '/driver' : '/'} replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <AuthPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth requiredRole="rider">
              <RiderHome />
            </RequireAuth>
          }
        />
        <Route
          path="/driver"
          element={
            <RequireAuth requiredRole="driver">
              <DriverDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}