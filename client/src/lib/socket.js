import { io } from 'socket.io-client';

let socket = null;

export const getSocketURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return `http://${host}:5000`;
    }
    if (host.includes('vercel.app') || host.includes('netlify.app') || host.includes('onrender.com') || host.includes('github.io')) {
      return 'https://nexxchat-5d29.onrender.com';
    }
  }
  return 'https://nexxchat-5d29.onrender.com';
};

export const connectSocket = (token) => {
  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null);

  if (socket) {
    if (authToken && socket.auth?.token !== authToken) {
      socket.auth = { token: authToken };
      if (!socket.connected) {
        socket.connect();
      }
    }
    return socket;
  }

  socket = io(getSocketURL(), {
    auth: { token: authToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[SOCKET] Connected to real-time server:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Disconnected:', reason);
  });

  socket.on('connect_error', async (error) => {
    console.error('[SOCKET] Connection error:', error.message);
    // If token expired, attempt automatic silent refresh using refreshToken
    if (error.message?.includes('Authentication') || error.message?.includes('jwt') || error.message?.includes('token')) {
      const storedRefreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('refreshToken') : null;
      if (storedRefreshToken) {
        try {
          const res = await fetch(`${getSocketURL()}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedRefreshToken }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.accessToken) {
              localStorage.setItem('accessToken', data.accessToken);
              if (data.refreshToken) {
                localStorage.setItem('refreshToken', data.refreshToken);
              }
              socket.auth = { token: data.accessToken };
              socket.connect();
            }
          }
        } catch (e) {
          console.warn('[SOCKET] Auto token refresh failed:', e.message);
        }
      }
    }
  });

  socket.on('reconnect', (attempt) => {
    console.log('[SOCKET] Reconnected after attempt:', attempt);
  });

  return socket;
};

export const updateSocketToken = (newToken) => {
  if (socket && newToken) {
    socket.auth = { token: newToken };
    if (!socket.connected) {
      socket.connect();
    }
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => {
  if (!socket) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;
    return connectSocket(token);
  }
  return socket;
};

export default { connectSocket, disconnectSocket, getSocket, updateSocketToken, getSocketURL };
