import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../middleware/validate.js';
import {
  register, login, googleAuth, refreshTokenHandler,
  logout, verifyEmail, forgotPassword, resetPassword,
  getMe, getSessions, revokeSession, revokeAllSessions,
} from '../controllers/authController.js';

const router = Router();

// Public routes
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
});
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/google', googleAuth);
router.post('/refresh', refreshTokenHandler);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Protected routes
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
router.get('/sessions', authenticate, getSessions);
router.delete('/sessions/:sessionId', authenticate, revokeSession);
router.delete('/sessions', authenticate, revokeAllSessions);

export default router;
