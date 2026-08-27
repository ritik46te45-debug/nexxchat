import { io } from 'socket.io-client';

let socket = null;

const getSocketURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('vercel.app')) {
      return 'https://nexxchat-5d29.onrender.com';
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `http://${window.location.hostname}:5000`;
    }
  }
  return window.location.origin;
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
    reconnectionDelayMax: 10000,
    timeout: 20000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('🔗 Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket connection error:', error.message);
  });

  socket.on('reconnect', (attempt) => {
    console.log('🔄 Socket reconnected after', attempt, 'attempts');
  });

  return socket;
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

export default { connectSocket, disconnectSocket, getSocket };
