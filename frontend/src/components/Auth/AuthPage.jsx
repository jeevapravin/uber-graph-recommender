// src/components/Auth/AuthPage.jsx
// Single page handles both Login and Register for both roles.
// No separate files for each permutation — that's bootcamp thinking.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const VEHICLE_TYPES = ['Moto', 'UberX', 'UberXL'];

export default function AuthPage() {
  const navigate = useNavigate();
  const login    = useAuthStore((s) => s.login);

  const [mode,   setMode]   = useState('login');    // 'login' | 'register'
  const [role,   setRole]   = useState('rider');    // 'rider' | 'driver'
  const [error,  setError]  = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name:          '',
    email:         '',
    password:      '',
    phone:         '',
    vehicle_type:  'UberX',
    vehicle_plate: '',
    vehicle_model: '',
  });

  const patch = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let res;
      if (mode === 'login') {
        res = role === 'rider'
          ? await authAPI.loginRider({ email: form.email, password: form.password })
          : await authAPI.loginDriver({ email: form.email, password: form.password });
      } else {
        const payload = {
          name:     form.name,
          email:    form.email,
          password: form.password,
          phone:    form.phone || undefined,
          ...(role === 'driver' && {
            vehicle_type:  form.vehicle_type,
            vehicle_plate: form.vehicle_plate,
            vehicle_model: form.vehicle_model || undefined,
          }),
        };
        res = role === 'rider'
          ? await authAPI.registerRider(payload)
          : await authAPI.registerDriver(payload);
      }

      login(res.data);
      navigate(role === 'driver' ? '/driver' : '/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D14] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal-400 flex items-center justify-center">
              <span className="text-black font-black text-sm">U</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">RideClone</span>
          </div>
          <p className="text-gray-500 text-sm">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Role Toggle */}
        <div className="flex bg-gray-900 rounded-xl p-1 mb-6 border border-gray-800">
          {['rider', 'driver'].map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                role === r
                  ? 'bg-teal-400 text-black shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r === 'rider' ? '🧍 Rider' : '🚗 Driver'}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur">
          <form onSubmit={submit} className="flex flex-col gap-4">

            {/* Register-only fields */}
            {mode === 'register' && (
              <Field label="Full Name" value={form.name}
                onChange={(v) => patch('name', v)} placeholder="Priya Sharma" />
            )}

            <Field label="Email" type="email" value={form.email}
              onChange={(v) => patch('email', v)} placeholder="you@example.com" />

            <Field label="Password" type="password" value={form.password}
              onChange={(v) => patch('password', v)} placeholder="Min. 8 characters" />

            {mode === 'register' && (
              <Field label="Phone (optional)" value={form.phone}
                onChange={(v) => patch('phone', v)} placeholder="+91 98765 43210" />
            )}

            {/* Driver-specific fields */}
            {mode === 'register' && role === 'driver' && (
              <>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Vehicle Type
                  </label>
                  <div className="flex gap-2">
                    {VEHICLE_TYPES.map((vt) => (
                      <button
                        type="button"
                        key={vt}
                        onClick={() => patch('vehicle_type', vt)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                          form.vehicle_type === vt
                            ? 'border-teal-400 bg-teal-400/10 text-teal-300'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {vt}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="License Plate" value={form.vehicle_plate}
                  onChange={(v) => patch('vehicle_plate', v.toUpperCase())}
                  placeholder="KA01AB1234" />
                <Field label="Vehicle Model (optional)" value={form.vehicle_model}
                  onChange={(v) => patch('vehicle_model', v)} placeholder="Honda City" />
              </>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full bg-teal-400 hover:bg-teal-300 disabled:opacity-50
                disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl
                transition-all text-sm tracking-wide"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-teal-400 hover:text-teal-300 font-medium transition-colors"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable field ──────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={!label.includes('optional')}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
          text-gray-100 text-sm placeholder-gray-600 outline-none
          focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 transition-all"
      />
    </div>
  );
}