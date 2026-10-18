import { create } from 'zustand';
import api from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

// Helper to retrieve initial cached state synchronously on page refresh
const getInitialAuthState = () => {
  if (typeof localStorage === 'undefined') {
    return { user: null, isAuthenticated: false, isLoading: false };
  }
  const token = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  let cachedUser = null;
  try {
    const raw = localStorage.getItem('nexchat_user');
    if (raw) cachedUser = JSON.parse(raw);
  } catch (e) {
    cachedUser = null;
  }

  const hasTokens = Boolean(token || refreshToken);
  return {
    // If we have stored tokens AND a cached user profile, user is authenticated instantly on refresh!
    user: cachedUser,
    isAuthenticated: Boolean(hasTokens && cachedUser),
    isLoading: Boolean(hasTokens && !cachedUser),
  };
};

const persistAuth = (data) => {
  if (!data) return;
  if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
  if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
  if (data.user) {
    try {
      localStorage.setItem('nexchat_user', JSON.stringify(data.user));
    } catch (e) {}
  }
};

const clearAuth = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('nexchat_user');
  sessionStorage.removeItem('nexchat_unlocked_session');
};

const initial = getInitialAuthState();

const useAuthStore = create((set, get) => ({
  user: initial.user,
  isAuthenticated: initial.isAuthenticated,
  isLoading: initial.isLoading,
  error: null,

  // Initialize — check if user is already logged in with persistent session
  initialize: async () => {
    let token = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!token && !refreshToken) {
      clearAuth();
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }

    try {
      // If accessToken is missing but refreshToken exists, refresh immediately
      if (!token && refreshToken) {
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          token = data.accessToken;
          persistAuth(data);
        } catch (refreshErr) {
          // Only clear session if explicitly rejected with 401
          if (refreshErr.response?.status === 401) {
            clearAuth();
            set({ isLoading: false, isAuthenticated: false, user: null });
            return;
          }
          // On network/cold-start issues, retain cached session
          const cached = get().user;
          set({ isLoading: false, isAuthenticated: Boolean(cached) });
          return;
        }
      }

      // Verify and sync profile with server
      const { data } = await api.get('/auth/me');
      if (data?.user) {
        persistAuth(data);
        set({ user: data.user, isAuthenticated: true, isLoading: false });
        connectSocket(token);
      }
    } catch (error) {
      const status = error.response?.status;
      console.warn('[AUTH] Session verification note:', status || error.message);

      // ONLY on explicit 401 Unauthorized do we attempt silent recovery or logout
      if (status === 401) {
        try {
          const storedRefreshToken = localStorage.getItem('refreshToken');
          if (storedRefreshToken) {
            const { data } = await api.post('/auth/refresh', { refreshToken: storedRefreshToken });
            persistAuth(data);
            const meRes = await api.get('/auth/me');
            if (meRes.data?.user) {
              persistAuth(meRes.data);
              set({ user: meRes.data.user, isAuthenticated: true, isLoading: false });
              connectSocket(data.accessToken);
              return;
            }
          }
        } catch (refreshErr) {
          if (refreshErr.response?.status === 401) {
            // Both access and refresh tokens rejected by server
            clearAuth();
            set({ isLoading: false, isAuthenticated: false, user: null });
            return;
          }
        }
      }

      // For network errors, timeouts, 429, 500, 502, 503, 504:
      // NEVER delete tokens or log out the user!
      // Keep their session authenticated from cache and connect socket.
      const existingUser = get().user;
      set({ isLoading: false, isAuthenticated: Boolean(existingUser || token) });
      if (token) connectSocket(token);
    }
  },

  // Register
  register: async (formData) => {
    set({ error: null });
    try {
      const { data } = await api.post('/auth/register', formData);
      persistAuth(data);
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
      persistAuth(data);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(data.accessToken);
      return data;
    } catch (error) {
      let msg = error.response?.data?.error;
      if (!msg) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          msg = 'Server connection timed out. Please try again.';
        } else if (error.message?.includes('Network Error') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          msg = 'Unable to connect to server. Please check your internet connection.';
        } else {
          msg = error.message || 'Login failed. Please check your credentials.';
        }
      }
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  // Verify 2FA on login
  verify2FALogin: async (tempToken, token, backupCode) => {
    set({ error: null });
    try {
      const { data } = await api.post('/auth/2fa/verify-login', { tempToken, token, backupCode });
      persistAuth(data);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(data.accessToken);
      return data;
    } catch (error) {
      const msg = error.response?.data?.error || '2FA verification failed';
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
      persistAuth(data);
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
    clearAuth();
    disconnectSocket();
    set({ user: null, isAuthenticated: false, error: null, isLoading: false });
  },

  // Update user in store & cache
  updateUser: (updates) => {
    set((state) => {
      const updated = state.user ? { ...state.user, ...updates } : null;
      if (updated) {
        try {
          localStorage.setItem('nexchat_user', JSON.stringify(updated));
        } catch (e) {}
      }
      return { user: updated };
    });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
