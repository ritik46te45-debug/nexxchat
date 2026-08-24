import { io } from 'socket.io-client';

let socket = null;

const getSocketURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return 'https://nexxchat-5d29.onrender.com';
  }
  return window.location.origin;
};

export const connectSocket = (token) => {
  if (socket?.connected) return socket;

  socket = io(getSocketURL(), {
    auth: { token },
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
  if (!socket || !socket.connected) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      return connectSocket(token);
    }
  }
  return socket;
};

export default { connectSocket, disconnectSocket, getSocket };
