import { create } from 'zustand';
import api from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  // Initialize — check if user is already logged in with persistent session
  initialize: async () => {
    try {
      let token = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (!token && !refreshToken) {
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }

      // If accessToken is missing but refreshToken exists, refresh immediately
      if (!token && refreshToken) {
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          token = data.accessToken;
          localStorage.setItem('accessToken', token);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }
        } catch (refreshErr) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          set({ isLoading: false, isAuthenticated: false, user: null });
          return;
        }
      }

      const { data } = await api.get('/auth/me');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(token);
    } catch (error) {
      // Try one final refresh attempt if me failed
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          const newToken = data.accessToken;
          localStorage.setItem('accessToken', newToken);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }
          const meRes = await api.get('/auth/me');
          set({ user: meRes.data.user, isAuthenticated: true, isLoading: false });
          connectSocket(newToken);
          return;
        }
      } catch (e) {
        // Refresh failed, clean up
      }

      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ isLoading: false, isAuthenticated: false, user: null });
    }
  },

  // Register
  register: async (formData) => {
    set({ error: null });
    try {
      const { data } = await api.post('/auth/register', formData);
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(data.accessToken);
      return data;
    } catch (error) {
      const msg = error.response?.data?.error || 'Registration failed';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  // Login
  login: async (email, password) => {
    set({ error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.requires2FA) {
        return { requires2FA: true, tempToken: data.tempToken };
      }
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(data.accessToken);
      return data;
    } catch (error) {
      const msg = error.response?.data?.error || 'Login failed';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  // Google login
  googleLogin: async (authPayload) => {
    set({ error: null });
    try {
      const payload = typeof authPayload === 'string' ? { credential: authPayload } : authPayload;
      const { data } = await api.post('/auth/google', payload);
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(data.accessToken);
      return data;
    } catch (error) {
      const msg = error.response?.data?.error || 'Google login failed';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  // Logout
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await api.post('/auth/logout', { refreshToken });
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('nexchat_unlocked_session');
    disconnectSocket();
    set({ user: null, isAuthenticated: false, error: null, isLoading: false });
  },

  // Update user in store
  updateUser: (updates) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }));
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
