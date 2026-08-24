import path from 'path';
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import connectDB from './config/db.js';
import { setupSocket } from './socket/index.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import friendRoutes from './routes/friends.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/upload.js';
import statusRoutes from './routes/status.js';
import callRoutes from './routes/calls.js';

const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8, // 100MB
});

// Make io accessible in controllers
app.set('io', io);

// ====== MIDDLEWARE ======

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Auth rate limiter (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ====== ROUTES ======
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/calls', callRoutes);

// Health check & Root
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'NexChat API Server',
    message: 'Backend server is running live and healthy!',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: Object.values(err.errors).map(e => e.message),
    });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ====== START SERVER ======
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    setupSocket(io);

    httpServer.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════╗
║     🚀 NexChat Server Running        ║
║     Port: ${PORT}                        ║
║     Mode: ${(process.env.NODE_ENV || 'development').padEnd(24)}║
╚═══════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n⚡ ${signal} received — shutting down gracefully...`);
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('⚠️  Forced exit after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, io };
