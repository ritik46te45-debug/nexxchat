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
router.get('/test-email-diagnostic', async (req, res) => {
  const targetEmail = req.query.email || 'jeeprep746@gmail.com';
  const webhookUrl = process.env.MAIL_HTTP_URL || process.env.GOOGLE_SCRIPT_URL;
  let webhookRaw = null;
  if (webhookUrl) {
    try {
      const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
      const r = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail,
          subject: 'Diagnostic Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      });
      const text = await r.text();
      webhookRaw = { status: r.status, ok: r.ok, bodyText: text };
    } catch (e) {
      webhookRaw = { error: e.message };
    }
  }

  let smtpDirect = null;
  try {
    const nodemailer = (await import('nodemailer')).default;
    const directTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: 'ritik46te45@gmail.com',
        pass: 'ssvnjjygrqfwiha',
      },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
    });
    await directTransporter.verify();
    smtpDirect = { connected: true };
  } catch (err) {
    smtpDirect = { connected: false, error: err.message };
  }

  try {
    const { sendPasswordResetEmail } = await import('../utils/email.js');
    const result = await sendPasswordResetEmail(targetEmail, 'diagnostic-test-token-777');
    res.json({ targetEmail, result, webhookRaw, smtpDirect, envUser: Boolean(process.env.SMTP_USER), envPass: Boolean(process.env.SMTP_PASS), webhookConfigured: Boolean(webhookUrl) });
  } catch (err) {
    res.status(500).json({ error: err.message, smtpDirect });
  }
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
