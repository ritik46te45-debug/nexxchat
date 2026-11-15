import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';

// Generate access token (supports sessionId and tokenVersion for immediate revocation)
export const generateAccessToken = (userId, extraPayload = {}) => {
  const expires = process.env.JWT_ACCESS_EXPIRES || '24h';
  return jwt.sign({ userId, ...extraPayload }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: expires,
  });
};

// Generate refresh token (90 days)
export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '90d',
  });
};

// Auth middleware — verify access token & active session
export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // Check Authorization header
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check query param (for direct browser file downloads and media streaming)
    else if (req.query?.token) {
      token = req.query.token;
    }
    // Check cookies
    else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Account has been banned', reason: user.banReason });
    }

    // Token version check (revokes all older tokens on password reset, logout all, etc.)
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion < user.tokenVersion) {
      return res.status(401).json({ error: 'Session invalidated. Please sign in again.', code: 'SESSION_REVOKED' });
    }

    // Session-specific revocation check
    if (decoded.sessionId) {
      const session = await Session.findById(decoded.sessionId);
      if (!session || session.isRevoked) {
        return res.status(401).json({ error: 'Session has been revoked. Please sign in again.', code: 'SESSION_REVOKED' });
      }
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional auth — doesn't fail if no token
export const optionalAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.split(' ')[1] || req.cookies?.accessToken || req.query?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.userId);
      if (user && !user.isBanned) {
        if (decoded.tokenVersion === undefined || user.tokenVersion === undefined || decoded.tokenVersion >= user.tokenVersion) {
          req.user = user;
          req.userId = user._id;
        }
      }
    }
  } catch (e) {
    // No-op: user stays undefined
  }
  next();
};

// Admin middleware
export const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Socket.IO auth middleware — STRICT: Access token only, no refresh token accepted
export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Security: Only accept valid access tokens signed with JWT_ACCESS_SECRET. Never accept refresh tokens.
    let decoded = null;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      return next(new Error('Authentication failed — invalid or expired access token'));
    }

    if (!decoded || !decoded.userId) {
      return next(new Error('Authentication failed'));
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.isBanned) {
      return next(new Error('Authentication failed'));
    }

    // Token version check
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion < user.tokenVersion) {
      return next(new Error('Authentication failed — session revoked'));
    }

    // Session revocation check
    if (decoded.sessionId) {
      const session = await Session.findById(decoded.sessionId);
      if (!session || session.isRevoked) {
        return next(new Error('Authentication failed — session revoked'));
      }
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication failed'));
  }
};
