import { create } from 'zustand';
import api from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  // Initialize — check if user is already logged in
  initialize: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }
      const { data } = await api.get('/auth/me');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(token);
    } catch (error) {
      localStorage.removeItem('accessToken');
      set({ isLoading: false, isAuthenticated: false, user: null });
    }
  },

  // Register
  register: async (formData) => {
    set({ error: null });
    try {
      const { data } = await api.post('/auth/register', formData);
      localStorage.setItem('accessToken', data.accessToken);
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
      await api.post('/auth/logout');
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('accessToken');
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
