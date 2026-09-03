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

export const getOrCreateDeviceId = () => {
  if (typeof localStorage === 'undefined') return 'server-env';
  let deviceId = localStorage.getItem('nexchat_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    localStorage.setItem('nexchat_device_id', deviceId);
  }
  return deviceId;
};

export const connectSocket = (token) => {
  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null);
  const deviceId = getOrCreateDeviceId();

  if (socket) {
    if (authToken && socket.auth?.token !== authToken) {
      socket.auth = { token: authToken, deviceId };
      if (!socket.connected) {
        socket.connect();
      }
    }
    return socket;
  }

  socket = io(getSocketURL(), {
    auth: { token: authToken, deviceId },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    const transport = socket.io?.engine?.transport?.name || 'unknown';
    console.log(`[REALTIME] SOCKET CONNECTED | ID: ${socket.id} | Transport: ${transport} | URL: ${getSocketURL()}`);
  });

  socket.onAny((event, ...args) => {
    console.log(`[SOCKET EVENT RECEIVED: ${event}]`, args);
  });

  socket.on('disconnect', (reason) => {
    console.log('[REALTIME] SOCKET DISCONNECTED:', reason);
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
              const deviceId = getOrCreateDeviceId();
              socket.auth = { token: data.accessToken, deviceId };
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
    const deviceId = getOrCreateDeviceId();
    socket.auth = { token: newToken, deviceId };
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
