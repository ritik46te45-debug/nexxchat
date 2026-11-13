import nodemailer from 'nodemailer';

const getSmtpCredentials = () => {
  const user = (process.env.SMTP_USER || 'ritik46te45@gmail.com').trim();
  const rawPass = process.env.SMTP_PASS || 'ssvn njjy grqf wiha';
  const pass = rawPass.replace(/\s+/g, '').trim();
  return { user, pass };
};

/**
 * Check if SMTP credentials are configured.
 */
const hasSmtpConfig = () => {
  const { user, pass } = getSmtpCredentials();
  return Boolean(
    user && pass &&
    user !== 'your-email@gmail.com' &&
    !user.includes('your-') &&
    pass !== 'your-app-password' &&
    !pass.includes('your-')
  );
};

const getBaseUrl = (clientOrigin) => {
  // If clientOrigin is provided and is a public web origin (not localhost, not capacitor, not file), use it
  if (clientOrigin && !clientOrigin.includes('localhost') && !clientOrigin.startsWith('capacitor:') && !clientOrigin.startsWith('file:')) {
    return clientOrigin.replace(/\/+$/, '');
  }
  // If CLIENT_URL is set in environment and is not localhost, use it
  if (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost')) {
    return process.env.CLIENT_URL.replace(/\/+$/, '');
  }
  // Default to live production Vercel deployment so reset links work from any device
  return 'https://nexxchat-zeta.vercel.app';
};

/**
 * Dispatch email via HTTPS REST Webhook (bypasses Render Free Tier SMTP port 25/465/587 blocks)
 */
const sendViaHttpWebhook = async (email, subject, html, text) => {
  const webhookUrl = process.env.MAIL_HTTP_URL || process.env.GOOGLE_SCRIPT_URL;
  if (!webhookUrl) return null;

  try {
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const res = await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject,
        html,
        text,
      }),
    });
    if (res.ok) {
      console.log(`✅ Email dispatched via HTTPS Webhook (Port 443) to ${email}`);
      return { sent: true };
    }
    const errText = await res.text();
    console.warn(`[HTTP-MAIL] Webhook returned status ${res.status}:`, errText);
    return { sent: false, reason: `HTTP status ${res.status}` };
  } catch (err) {
    console.warn('[HTTP-MAIL] Webhook error:', err.message);
    return { sent: false, reason: err.message };
  }
};

const createTransporter = () => {
  const { user, pass } = getSmtpCredentials();
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const isGmail = host.includes('gmail.com') || user.endsWith('@gmail.com');

  return nodemailer.createTransport({
    host: isGmail ? 'smtp.gmail.com' : host,
    port: isGmail ? 465 : parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // Port 465 direct SSL
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    // Generous timeouts (15s) so SMTP handshakes to external email domains succeed without false-positive timeouts
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
};

export const sendVerificationEmail = async (email, token) => {
  const baseUrl = getBaseUrl();
  const verifyUrl = `${baseUrl}/verify-email/${token}`;
  const subject = 'Verify your NexChat account';
  const text = `Welcome to NexChat! Please verify your email by clicking: ${verifyUrl}\n\nThis link expires in 24 hours.`;
  const html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f17; color: #f1f5f9; padding: 40px 24px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background: linear-gradient(135deg, #8b5cf6, #6366f1); font-size: 26px; font-weight: bold; color: white;">N</div>
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 16px 0 6px 0;">Welcome to NexChat</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Confirm your email address to activate all features</p>
      </div>
      <div style="background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="color: #e2e8f0; font-size: 15px; margin: 0 0 20px 0;">Tap the button below to verify your email account:</p>
        <a href="${verifyUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
          Verify My Email
        </a>
        <p style="color: #64748b; font-size: 12px; margin: 20px 0 0 0;">Or copy and paste this link into your browser:</p>
        <p style="color: #a855f7; font-size: 12px; word-break: break-all; margin: 6px 0 0 0;">${verifyUrl}</p>
      </div>
      <p style="text-align: center; color: #64748b; font-size: 12px; margin: 0;">This verification link will expire in 24 hours.</p>
    </div>
  `;

  // 1. Try HTTPS Webhook first if configured (Port 443 — works 100% on Render free tier)
  const webhookResult = await sendViaHttpWebhook(email, subject, html, text);
  if (webhookResult && webhookResult.sent) return webhookResult;

  // 2. Fallback to direct SMTP (works on local machine, VPS, or when port 465 is open)
  if (!hasSmtpConfig()) {
    console.warn('⚠️  SMTP not configured — skipping verification email to', email);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const { user } = getSmtpCredentials();
    const transporter = createTransporter();

    await Promise.race([
      transporter.sendMail({
        from: `"NexChat" <${user}>`,
        to: email,
        subject,
        text,
        html,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 15000)),
    ]);
    console.log(`✅ Verification email sent via SMTP to ${email}`);
    return { sent: true };
  } catch (error) {
    console.warn('Verification email note:', error.message);
    return { sent: false, reason: error.message };
  }
};

export const sendPasswordResetEmail = async (email, token, clientOrigin = null) => {
  const baseUrl = getBaseUrl(clientOrigin);
  const resetUrl = `${baseUrl}/reset-password/${token}`;
  const subject = 'Reset your NexChat password';
  const text = `You requested a password reset for your NexChat account.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link expires in 2 hours. If you did not request this, please ignore this email.`;
  const html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f17; color: #f1f5f9; padding: 40px 24px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background: linear-gradient(135deg, #8b5cf6, #6366f1); font-size: 26px; font-weight: bold; color: white;">N</div>
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 16px 0 6px 0;">Reset Your Password</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">We received a request to reset your NexChat account password.</p>
      </div>
      <div style="background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="color: #e2e8f0; font-size: 15px; margin: 0 0 20px 0;">Tap the button below to choose a new password:</p>
        <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
          Reset Password
        </a>
        <p style="color: #64748b; font-size: 12px; margin: 20px 0 0 0;">Or copy and paste this link into your browser:</p>
        <p style="color: #a855f7; font-size: 12px; word-break: break-all; margin: 6px 0 0 0;">${resetUrl}</p>
      </div>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 12px 0;">
        <strong>Security Note:</strong> This reset link will expire in <strong>2 hours</strong>. If you did not request a password reset, no action is needed — your account remains completely secure.
      </p>
      <p style="text-align: center; color: #64748b; font-size: 12px; margin: 24px 0 0 0;">
        NexChat Messenger • Secure Real-Time Communication
      </p>
    </div>
  `;

  // 1. Try HTTPS Webhook first if configured (Port 443 — works 100% on Render free tier)
  const webhookResult = await sendViaHttpWebhook(email, subject, html, text);
  if (webhookResult && webhookResult.sent) return webhookResult;

  // 2. Fallback to direct SMTP (works on local machine, VPS, or when port 465 is open)
  if (!hasSmtpConfig()) {
    console.warn('⚠️  SMTP not configured — cannot send password reset email to', email);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const { user } = getSmtpCredentials();
    const transporter = createTransporter();

    await Promise.race([
      transporter.sendMail({
        from: `"NexChat Security" <${user}>`,
        to: email,
        subject,
        text,
        html,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 15000)),
    ]);
    console.log(`✅ Password reset email sent via SMTP to ${email}`);
    return { sent: true };
  } catch (error) {
    console.warn('Password reset email note:', error.message);
    return { sent: false, reason: error.message };
  }
};

/**
 * Dispatch an instant security alert email whenever a login occurs
 */
export const sendLoginAlertEmail = async (email, { displayName, deviceName, browser, os, ip, time, method = 'Password' } = {}) => {
  const formattedTime = (time ? new Date(time) : new Date()).toUTCString();
  const cleanDevice = deviceName || `${browser || 'Web Browser'} on ${os || 'Device'}`;
  const cleanIp = ip ? ip.replace('::ffff:', '') : 'Unknown';
  const subject = `Security Alert: New login to NexChat (${cleanDevice})`;
  const text = `Hi ${displayName || 'User'},\n\nA new login was detected on your NexChat account:\n\n- Device: ${cleanDevice}\n- Browser: ${browser || 'Unknown'}\n- Operating System: ${os || 'Unknown'}\n- IP Address: ${cleanIp}\n- Login Method: ${method}\n- Time: ${formattedTime}\n\nIf this was you, you can safely ignore this email.\nIf you did not sign in, please reset your password and revoke all sessions immediately in your Settings.`;
  const html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f17; color: #f1f5f9; padding: 40px 24px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background: linear-gradient(135deg, #10b981, #06b6d4); font-size: 26px; font-weight: bold; color: white;">🛡️</div>
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 16px 0 6px 0;">New Login Detected</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">We noticed a new sign-in to your NexChat account</p>
      </div>

      <div style="background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #1e293b;">Device</td>
            <td style="color: #f8fafc; font-weight: 600; text-align: right; padding: 8px 0; border-bottom: 1px solid #1e293b;">${cleanDevice}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #1e293b;">Method</td>
            <td style="color: #a855f7; font-weight: 600; text-align: right; padding: 8px 0; border-bottom: 1px solid #1e293b;">${method}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #1e293b;">IP Address</td>
            <td style="color: #f8fafc; font-family: monospace; text-align: right; padding: 8px 0; border-bottom: 1px solid #1e293b;">${cleanIp}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 8px 0;">Time (UTC)</td>
            <td style="color: #f8fafc; text-align: right; padding: 8px 0;">${formattedTime}</td>
          </tr>
        </table>
      </div>

      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 16px; margin: 20px 0;">
        <p style="color: #fca5a5; font-size: 13px; margin: 0; line-height: 1.5;">
          <strong>Was this you?</strong> If yes, no action is needed.<br/>
          If you did <strong>NOT</strong> initiate this login, reset your password and revoke other sessions immediately from your <a href="https://nexxchat-zeta.vercel.app/" style="color: #ef4444; font-weight: bold;">Account Settings</a>.
        </p>
      </div>

      <p style="text-align: center; color: #64748b; font-size: 12px; margin: 24px 0 0 0;">
        NexChat Messenger • Account Security & Protection
      </p>
    </div>
  `;

  // 1. Try HTTPS Webhook first if configured (Port 443 — works 100% on Render free tier)
  const webhookResult = await sendViaHttpWebhook(email, subject, html, text);
  if (webhookResult && webhookResult.sent) return webhookResult;

  // 2. Fallback to direct SMTP
  if (!hasSmtpConfig()) {
    console.warn('⚠️  SMTP not configured — skipping login alert email to', email);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const { user } = getSmtpCredentials();
    const transporter = createTransporter();

    await Promise.race([
      transporter.sendMail({
        from: `"NexChat Security" <${user}>`,
        to: email,
        subject,
        text,
        html,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 15000)),
    ]);
    console.log(`✅ Login alert email sent via SMTP to ${email}`);
    return { sent: true };
  } catch (error) {
    console.warn('Login alert email note:', error.message);
    return { sent: false, reason: error.message };
  }
};

