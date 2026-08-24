import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import UAParser from 'ua-parser-js';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';

// Create session and set cookies
const createSession = async (user, req, res) => {
  const ua = new UAParser(req.headers['user-agent']);
  const browser = ua.getBrowser();
  const os = ua.getOS();

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Store refresh token in DB (90 days)
  await Session.create({
    user: user._id,
    refreshToken,
    deviceName: `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`,
    browser: browser.name || 'Unknown',
    os: os.name || 'Unknown',
    ip: req.ip || req.connection?.remoteAddress || '',
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  const isProd = process.env.NODE_ENV === 'production';

  // Set HTTP-only cookies
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    path: '/api/auth/refresh',
  });

  return { accessToken, refreshToken };
};

// REGISTER
export const register = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    // Check existing user
    const existingUser = await User.findOne({ $or: [{ email }, { username: username.toLowerCase() }] });
    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      displayName,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verificationToken).catch(console.error);

    const tokens = await createSession(user, req, res);

    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// LOGIN
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to too many login attempts',
        lockUntil: user.lockUntil,
      });
    }

    // Check if user has a password (could be Google-only account)
    if (!user.password) {
      return res.status(401).json({ error: 'Please use Google login for this account' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if 2FA is enabled
    if (user.twoFactor?.enabled) {
      // Return a temporary token for 2FA verification
      const tempToken = jwt.sign(
        { userId: user._id, require2FA: true },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        requires2FA: true,
        tempToken,
      });
    }

    await user.resetLoginAttempts();
    const tokens = await createSession(user, req, res);

    res.json({
      message: 'Login successful',
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// GOOGLE AUTH
export const googleAuth = async (req, res) => {
  try {
    const { credential, accessToken: googleAccessToken } = req.body; // Google ID token, Access token, or dev token

    let googleId, email, name, picture;

    if (credential && (credential.startsWith('mock-') || credential === 'dev')) {
      // Dev / Quick login mode — generate a unique demo user per browser session
      const seed = credential === 'dev' ? crypto.randomBytes(8).toString('hex') : credential;
      const hash = crypto.createHash('md5').update(seed).digest('hex').slice(0, 8);
      googleId = `google_demo_${hash}`;
      email = `demo_${hash}@nexchat.dev`;
      name = `Demo User ${hash.slice(0, 4).toUpperCase()}`;
      picture = '';
    } else {
      let verified = false;

      // 1. Try Google ID token (JWT)
      if (credential && typeof credential === 'string' && credential.includes('.')) {
        try {
          const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
          if (response.ok) {
            const payload = await response.json();
            googleId = payload.sub;
            email = payload.email;
            name = payload.name;
            picture = payload.picture;
            verified = true;
          }
        } catch (e) {
          console.error('Google ID token check error:', e);
        }
      }

      // 2. Try Google UserInfo endpoint with access token or credential
      const tokenToTry = googleAccessToken || credential;
      if (!verified && tokenToTry) {
        try {
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenToTry}` },
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            googleId = userinfo.sub;
            email = userinfo.email;
            name = userinfo.name;
            picture = userinfo.picture;
            verified = true;
          }
        } catch (e) {
          console.error('Google Userinfo check error:', e);
        }
      }

      if (!verified || !email) {
        return res.status(401).json({ error: 'Google authentication failed. Please try again.' });
      }
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      let shouldSave = false;
      if (!user.userCode) {
        user.userCode = String(Math.floor(1000 + Math.random() * 9000));
        shouldSave = true;
      }
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.avatar?.url && picture) {
          user.avatar = { url: picture, publicId: '' };
        }
        shouldSave = true;
      }
      if (shouldSave) {
        await user.save();
      }
    } else {
      // Create new user
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20) + '_' + crypto.randomBytes(2).toString('hex');
      const userCode = String(Math.floor(1000 + Math.random() * 9000));
      user = await User.create({
        username,
        email,
        displayName: name || 'Google User',
        userCode,
        googleId,
        avatar: { url: picture || '', publicId: '' },
        isEmailVerified: true,
      });
    }

    const tokens = await createSession(user, req, res);

    res.json({
      message: 'Google login successful',
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
};

// REFRESH TOKEN
export const refreshTokenHandler = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Find session
    const session = await Session.findOne({ refreshToken, isRevoked: false });
    if (!session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (e) {
      // Revoke session if token is invalid
      session.isRevoked = true;
      await session.save();
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.isBanned) {
      return res.status(401).json({ error: 'User not found or banned' });
    }

    // Rotate refresh token
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update session
    session.refreshToken = newRefreshToken;
    session.lastActive = new Date();
    await session.save();

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

// LOGOUT
export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await Session.findOneAndUpdate({ refreshToken }, { isRevoked: true });
    }

    // Update user status
    await User.findByIdAndUpdate(req.userId, {
      isOnline: false,
      lastSeen: new Date(),
    });

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// VERIFY EMAIL
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
};

// REQUEST PASSWORD RESET
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Please enter your email address' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been prepared.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    sendPasswordResetEmail(user.email, resetToken).catch(console.error);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;

    res.json({
      success: true,
      message: 'Password reset link generated successfully.',
      resetToken,
      resetUrl,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password reset request failed' });
  }
};

// RESET PASSWORD
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token. Please request a new one.' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Revoke previous sessions
    await Session.updateMany({ user: user._id }, { isRevoked: true });

    res.json({ message: 'Password reset successfully! You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

// GET CURRENT USER
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'username displayName userCode avatar isOnline lastSeen');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.userCode) {
      user.userCode = String(Math.floor(1000 + Math.random() * 9000));
      await user.save();
    }
    res.json({ user: user.toSafeObject() });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// GET SESSIONS
export const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({
      user: req.userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).sort({ lastActive: -1 });

    res.json({
      sessions: sessions.map(s => ({
        id: s._id,
        deviceName: s.deviceName,
        browser: s.browser,
        os: s.os,
        lastActive: s.lastActive,
        createdAt: s.createdAt,
        isCurrent: s.refreshToken === req.cookies?.refreshToken,
      })),
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
};

// REVOKE SESSION
export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ _id: sessionId, user: req.userId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    session.isRevoked = true;
    await session.save();
    res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

// REVOKE ALL OTHER SESSIONS
export const revokeAllSessions = async (req, res) => {
  try {
    const currentRefreshToken = req.cookies?.refreshToken;
    await Session.updateMany(
      { user: req.userId, refreshToken: { $ne: currentRefreshToken } },
      { isRevoked: true }
    );
    res.json({ message: 'All other sessions revoked' });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};

// 2FA: SETUP (GENERATE QR CODE & SECRET)
export const setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'NexChat',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const uri = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(uri);

    // Generate 6 backup codes
    const backupCodes = Array.from({ length: 6 }, () => ({
      code: crypto.randomBytes(4).toString('hex').toUpperCase(),
      used: false,
    }));

    user.twoFactor = {
      enabled: false,
      secret: secret.base32,
      backupCodes,
    };
    await user.save();

    res.json({
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      backupCodes: backupCodes.map((b) => b.code),
    });
  } catch (error) {
    console.error('Setup 2FA error:', error);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
};

// 2FA: VERIFY & ENABLE
export const verifyAndEnable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: '6-digit code is required' });

    const user = await User.findById(req.userId);
    if (!user || !user.twoFactor?.secret) {
      return res.status(400).json({ error: '2FA has not been initiated' });
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'NexChat',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twoFactor.secret),
    });

    const delta = totp.validate({ token: token.trim(), window: 1 });
    if (delta === null) {
      return res.status(400).json({ error: 'Invalid 2FA verification code' });
    }

    user.twoFactor.enabled = true;
    await user.save();

    res.json({ message: '2FA enabled successfully', enabled: true });
  } catch (error) {
    console.error('Verify 2FA error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
};

// 2FA: DISABLE
export const disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.twoFactor = { enabled: false, secret: null, backupCodes: [] };
    await user.save();

    res.json({ message: '2FA disabled', enabled: false });
  } catch (error) {
    console.error('Disable 2FA error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
};

// 2FA: VERIFY ON LOGIN
export const verify2FALogin = async (req, res) => {
  try {
    const { tempToken, token, backupCode } = req.body;

    if (!tempToken) return res.status(400).json({ error: 'Temporary 2FA token required' });

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_ACCESS_SECRET);
    } catch {
      return res.status(401).json({ error: '2FA session expired, please login again' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.twoFactor?.enabled) {
      return res.status(400).json({ error: 'Invalid 2FA request' });
    }

    let isValid = false;

    if (token) {
      const totp = new OTPAuth.TOTP({
        issuer: 'NexChat',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.twoFactor.secret),
      });
      const delta = totp.validate({ token: token.trim(), window: 1 });
      isValid = delta !== null;
    } else if (backupCode) {
      const foundCode = user.twoFactor.backupCodes?.find(
        (b) => b.code.toUpperCase() === backupCode.trim().toUpperCase() && !b.used
      );
      if (foundCode) {
        foundCode.used = true;
        await user.save();
        isValid = true;
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA code or backup code' });
    }

    await user.resetLoginAttempts();
    const tokens = await createSession(user, req, res);

    res.json({
      message: '2FA verification successful',
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error('Verify 2FA login error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
};

