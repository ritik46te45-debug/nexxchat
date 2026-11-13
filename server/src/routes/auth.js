import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../middleware/validate.js';
import {
  register, login, googleAuth, refreshTokenHandler,
  logout, verifyEmail, forgotPassword, resetPassword,
  getMe, getSessions, revokeSession, revokeAllSessions,
  setup2FA, verifyAndEnable2FA, disable2FA, verify2FALogin,
} from '../controllers/authController.js';

const router = Router();

// Public routes
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  });
});
router.get('/mail-diagnostic', async (req, res) => {
  const targetEmail = req.query.email || 'jeeprep746@gmail.com';
  const brevoKey = (process.env.BREVO_API_KEY || '').trim();
  const brevoSender = (process.env.BREVO_SENDER_EMAIL || 'ritik46te45@gmail.com').trim();

  let brevoTest = null;
  if (brevoKey) {
    try {
      const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
      const bRes = await fetchFn('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'NexChat Diagnostic', email: brevoSender },
          to: [{ email: targetEmail }],
          subject: 'NexChat Brevo Diagnostic Test',
          htmlContent: '<p>Testing Brevo connection from live Render</p>',
          textContent: 'Testing Brevo connection from live Render',
        }),
      });
      const bText = await bRes.text();
      brevoTest = {
        status: bRes.status,
        ok: bRes.ok,
        body: bText,
      };
    } catch (e) {
      brevoTest = { error: e.message };
    }
  }

  // Also test Brevo SMTP if xsmtpsib is provided
  let brevoSmtpTest = null;
  if (brevoKey && brevoKey.startsWith('xsmtpsib')) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const trans = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: brevoSender,
          pass: brevoKey,
        },
        connectionTimeout: 4000,
      });
      await trans.verify();
      brevoSmtpTest = { connected: true };
    } catch (err) {
      brevoSmtpTest = { connected: false, error: err.message };
    }
  }

  res.json({
    hasBrevoKey: Boolean(brevoKey),
    brevoKeyPrefix: brevoKey ? brevoKey.substring(0, 8) + '...' : null,
    brevoKeyLen: brevoKey ? brevoKey.length : 0,
    brevoSender,
    hasWebhook: Boolean(process.env.MAIL_HTTP_URL || process.env.GOOGLE_SCRIPT_URL),
    brevoTest,
    brevoSmtpTest,
  });
});
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/2fa/verify-login', verify2FALogin);
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

// 2FA Protected endpoints
router.post('/2fa/setup', authenticate, setup2FA);
router.post('/2fa/enable', authenticate, verifyAndEnable2FA);
router.post('/2fa/disable', authenticate, disable2FA);

export default router;
