// src/store/authStore.js
// Zustand for global auth state. No Redux boilerplate — Zustand is production-standard.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      role: null,       // "rider" | "driver"
      userId: null,
      name: null,
      isAuthenticated: false,

      login: ({ access_token, role, user_id, name }) =>
        set({ token: access_token, role, userId: user_id, name, isAuthenticated: true }),

      logout: () =>
        set({ token: null, role: null, userId: null, name: null, isAuthenticated: false }),

      getAuthHeader: () => {
        const { token } = get();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
    {
      name: 'uber-clone-auth',   // localStorage key
      partialize: (s) => ({
        token: s.token,
        role: s.role,
        userId: s.userId,
        name: s.name,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
);