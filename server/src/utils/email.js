import nodemailer from 'nodemailer';

const getSmtpCredentials = () => {
  const user = (process.env.SMTP_USER || 'ritik46te45@gmail.com').trim();
  const rawPass = process.env.SMTP_PASS || 'ssvn njjy grqf wiha';
  const pass = rawPass.replace(/\s+/g, '').trim();
  return { user, pass };
};

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
  if (clientOrigin && !clientOrigin.includes('localhost') && !clientOrigin.startsWith('capacitor:') && !clientOrigin.startsWith('file:')) {
    return clientOrigin.replace(/\/+$/, '');
  }
  if (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost')) {
    return process.env.CLIENT_URL.replace(/\/+$/, '');
  }
  return 'https://nexxchat-zeta.vercel.app';
};

/**
 * Provider 1: Brevo (Sendinblue) HTTPS REST API (Port 443)
 * Industry Standard for Transactional Email: 300 free emails/day forever.
 * Works natively from cloud platforms (Render, Vercel, AWS) without SMTP port blocking.
 */
const sendViaBrevo = async (to, subject, html, text, fromName, fromEmail) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  const senderEmail = process.env.BREVO_SENDER_EMAIL || fromEmail || getSmtpCredentials().user || 'ritik46te45@gmail.com';
  const senderName = fromName || 'NexChat Security';

  try {
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const res = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey.trim(),
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    const bodyText = await res.text();
    let data = null;
    try { data = JSON.parse(bodyText); } catch {}

    if (res.ok && (data?.messageId || res.status === 201)) {
      console.log(`✅ [BREVO-API] Email delivered to ${to} (MessageId: ${data?.messageId || 'ok'})`);
      return { sent: true, provider: 'brevo', messageId: data?.messageId };
    }

    console.warn(`[BREVO-API] Delivery rejected for ${to} (${res.status}):`, bodyText);
    return { sent: false, provider: 'brevo', reason: data?.message || bodyText };
  } catch (err) {
    console.warn(`[BREVO-API] Request error for ${to}:`, err.message);
    return { sent: false, provider: 'brevo', reason: err.message };
  }
};

/**
 * Provider 2: Resend HTTPS REST API (Port 443)
 */
const sendViaResend = async (to, subject, html, text, fromName, fromEmail) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const sender = process.env.RESEND_FROM || `${fromName || 'NexChat'} <onboarding@resend.dev>`;

  try {
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject: subject,
        html: html,
        text: text,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.id) {
      console.log(`✅ [RESEND-API] Email delivered to ${to} (ID: ${data.id})`);
      return { sent: true, provider: 'resend', id: data.id };
    }

    console.warn(`[RESEND-API] Delivery rejected for ${to}:`, data);
    return { sent: false, provider: 'resend', reason: data?.message || `HTTP ${res.status}` };
  } catch (err) {
    console.warn(`[RESEND-API] Request error for ${to}:`, err.message);
    return { sent: false, provider: 'resend', reason: err.message };
  }
};

/**
 * Provider 3: SendGrid HTTPS REST API (Port 443)
 */
const sendViaSendGrid = async (to, subject, html, text, fromName, fromEmail) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;

  const senderEmail = process.env.SENDGRID_FROM || fromEmail || getSmtpCredentials().user || 'ritik46te45@gmail.com';
  const senderName = fromName || 'NexChat';

  try {
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const res = await fetchFn('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: senderEmail, name: senderName },
        subject: subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (res.status === 202 || res.ok) {
      console.log(`✅ [SENDGRID-API] Email delivered to ${to}`);
      return { sent: true, provider: 'sendgrid' };
    }

    const errText = await res.text();
    console.warn(`[SENDGRID-API] Delivery rejected for ${to}:`, errText);
    return { sent: false, provider: 'sendgrid', reason: errText };
  } catch (err) {
    console.warn(`[SENDGRID-API] Request error for ${to}:`, err.message);
    return { sent: false, provider: 'sendgrid', reason: err.message };
  }
};

/**
 * Provider 4: Google Apps Script Webhook (Port 443 HTTPS Bridge)
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
    const textResponse = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(textResponse); } catch {}

    if (res.ok && (parsed?.sent === true || textResponse.includes('"sent":true') || textResponse.includes('"sent": true'))) {
      console.log(`✅ [WEBHOOK] Email dispatched via HTTPS Webhook to ${email}`);
      return { sent: true, provider: 'webhook' };
    }
    console.warn(`[WEBHOOK] Response note for ${email}:`, textResponse);
    return { sent: false, provider: 'webhook', reason: parsed?.reason || textResponse.substring(0, 200) || `HTTP status ${res.status}` };
  } catch (err) {
    console.warn('[WEBHOOK] Error:', err.message);
    return { sent: false, provider: 'webhook', reason: err.message };
  }
};

/**
 * Provider 5: Nodemailer Direct SMTP (Port 465 direct SSL)
 */
const createTransporter = () => {
  const { user, pass } = getSmtpCredentials();
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const isGmail = host.includes('gmail.com') || user.endsWith('@gmail.com');

  return nodemailer.createTransport({
    host: isGmail ? 'smtp.gmail.com' : host,
    port: isGmail ? 465 : parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

const sendViaSmtp = async (to, subject, html, text, fromName, fromEmail) => {
  if (!hasSmtpConfig()) {
    return { sent: false, provider: 'smtp', reason: 'SMTP credentials not configured' };
  }

  try {
    const { user } = getSmtpCredentials();
    const sender = `"${fromName || 'NexChat Security'}" <${fromEmail || user}>`;
    const transporter = createTransporter();

    await Promise.race([
      transporter.sendMail({
        from: sender,
        to: to,
        subject: subject,
        text: text,
        html: html,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 12000)),
    ]);

    console.log(`✅ [SMTP] Email sent via direct SMTP to ${to}`);
    return { sent: true, provider: 'smtp' };
  } catch (error) {
    console.warn(`[SMTP] Direct SMTP note for ${to}:`, error.message);
    return { sent: false, provider: 'smtp', reason: error.message };
  }
};

/**
 * Master Enterprise Dispatcher: Tries providers in priority order
 */
export const dispatchEmail = async ({ to, subject, html, text, fromName = 'NexChat Security', fromEmail = null }) => {
  // 1. Try Brevo REST API (Industry Standard, 300 free/day, zero port blocks)
  const brevoRes = await sendViaBrevo(to, subject, html, text, fromName, fromEmail);
  if (brevoRes && brevoRes.sent) return brevoRes;

  // 2. Try Resend REST API
  const resendRes = await sendViaResend(to, subject, html, text, fromName, fromEmail);
  if (resendRes && resendRes.sent) return resendRes;

  // 3. Try SendGrid REST API
  const sendgridRes = await sendViaSendGrid(to, subject, html, text, fromName, fromEmail);
  if (sendgridRes && sendgridRes.sent) return sendgridRes;

  // 4. Try HTTPS Webhook Bridge (Google Apps Script)
  const webhookRes = await sendViaHttpWebhook(to, subject, html, text);
  if (webhookRes && webhookRes.sent) return webhookRes;

  // 5. Fallback to Direct SMTP
  const smtpRes = await sendViaSmtp(to, subject, html, text, fromName, fromEmail);
  if (smtpRes && smtpRes.sent) return smtpRes;

  console.error(`❌ [MAIL-FAILED] All email providers exhausted for recipient: ${to}`);
  return {
    sent: false,
    reason: 'All configured mail providers failed or timed out',
  };
};

/**
 * 1. VERIFICATION EMAIL
 */
export const sendVerificationEmail = async (email, token) => {
  const baseUrl = getBaseUrl();
  const verifyUrl = `${baseUrl}/verify-email/${token}`;
  const subject = 'Verify your NexChat account';
  const text = `Welcome to NexChat!\n\nPlease verify your email by clicking the link below:\n${verifyUrl}\n\nThis link expires in 24 hours.`;
  const html = `
    <div style="max-width: 580px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f8fafc; padding: 40px 24px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background: linear-gradient(135deg, #6366f1, #8b5cf6); font-size: 26px; font-weight: 800; color: white;">N</div>
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 16px 0 6px 0; letter-spacing: -0.02em;">Welcome to NexChat</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Confirm your email address to activate your account</p>
      </div>

      <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 20px 0;">Tap the button below to verify your email:</p>
        <a href="${verifyUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; font-weight: 700; font-size: 14px; padding: 13px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);">
          Verify Email Address
        </a>
        <p style="color: #64748b; font-size: 12px; margin: 20px 0 6px 0;">Or copy and paste this link into your browser:</p>
        <p style="color: #a855f7; font-size: 12px; word-break: break-all; margin: 0;">${verifyUrl}</p>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.6; text-align: center; margin: 20px 0 0 0;">
        This verification link expires in <strong>24 hours</strong>.<br/>
        NexChat Messenger • Secure Real-Time Communication
      </p>
    </div>
  `;

  return dispatchEmail({ to: email, subject, html, text, fromName: 'NexChat' });
};

/**
 * 2. PASSWORD RESET EMAIL
 */
export const sendPasswordResetEmail = async (email, token, clientOrigin = null) => {
  const baseUrl = getBaseUrl(clientOrigin);
  const resetUrl = `${baseUrl}/reset-password/${token}`;
  const subject = 'Reset your NexChat password';
  const text = `Hi,\n\nYou requested a password reset for your NexChat account (${email}).\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link expires in 2 hours.\nIf you did not request a password reset, please ignore this email — your account is safe.`;
  const html = `
    <div style="max-width: 580px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f8fafc; padding: 40px 24px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background: linear-gradient(135deg, #6366f1, #8b5cf6); font-size: 26px; font-weight: 800; color: white;">N</div>
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 16px 0 6px 0; letter-spacing: -0.02em;">Password Reset Request</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Reset your NexChat account password</p>
      </div>

      <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 20px 0;">Tap the button below to choose a new password for <strong style="color: #ffffff;">${email}</strong>:</p>
        <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; font-weight: 700; font-size: 14px; padding: 13px 34px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);">
          Set New Password
        </a>
        <p style="color: #64748b; font-size: 12px; margin: 20px 0 6px 0;">Or copy and paste this link into your browser:</p>
        <p style="color: #a855f7; font-size: 12px; word-break: break-all; margin: 0;">${resetUrl}</p>
      </div>

      <div style="background: rgba(100, 116, 139, 0.08); border: 1px solid #1e293b; border-radius: 10px; padding: 14px; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0;">
          🔒 <strong>Security Notice:</strong> This reset link will expire in <strong>2 hours</strong>. If you did not request this, you can safely ignore this email — your account remains completely secure.
        </p>
      </div>

      <p style="text-align: center; color: #64748b; font-size: 11px; margin: 24px 0 0 0;">
        NexChat Messenger • Account Security & Protection
      </p>
    </div>
  `;

  return dispatchEmail({ to: email, subject, html, text, fromName: 'NexChat Security' });
};

/**
 * 3. LOGIN ALERT EMAIL
 */
export const sendLoginAlertEmail = async (email, { displayName, deviceName, browser, os, ip, time, method = 'Password' } = {}) => {
  const formattedTime = (time ? new Date(time) : new Date()).toUTCString();
  const cleanDevice = deviceName || `${browser || 'Web Browser'} on ${os || 'Device'}`;
  const cleanIp = ip ? ip.replace('::ffff:', '') : 'Unknown';
  const subject = `Security Alert: New login to NexChat (${cleanDevice})`;
  const text = `Hi ${displayName || 'User'},\n\nA new login was detected on your NexChat account:\n\n- Device: ${cleanDevice}\n- Browser: ${browser || 'Unknown'}\n- Operating System: ${os || 'Unknown'}\n- IP Address: ${cleanIp}\n- Login Method: ${method}\n- Time: ${formattedTime}\n\nIf this was you, you can safely ignore this email.\nIf you did not sign in, please reset your password immediately at https://nexxchat-zeta.vercel.app/`;
  const html = `
    <div style="max-width: 580px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f8fafc; padding: 40px 24px; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 56px; height: 56px; line-height: 56px; border-radius: 16px; background: linear-gradient(135deg, #10b981, #06b6d4); font-size: 26px; font-weight: 800; color: white;">🛡️</div>
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 16px 0 6px 0;">New Sign-In Detected</h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">We noticed a new sign-in to your account</p>
      </div>

      <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #1e293b;">Account</td>
            <td style="color: #f8fafc; font-weight: 600; text-align: right; padding: 8px 0; border-bottom: 1px solid #1e293b;">${email}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #1e293b;">Device</td>
            <td style="color: #f8fafc; font-weight: 600; text-align: right; padding: 8px 0; border-bottom: 1px solid #1e293b;">${cleanDevice}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #1e293b;">Login Method</td>
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

      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px; padding: 14px; margin: 20px 0;">
        <p style="color: #fca5a5; font-size: 12px; margin: 0; line-height: 1.5;">
          <strong>Was this you?</strong> If yes, you can safely ignore this alert.<br/>
          If you did <strong>NOT</strong> initiate this login, reset your password immediately at <a href="https://nexxchat-zeta.vercel.app/" style="color: #ef4444; font-weight: bold;">nexxchat-zeta.vercel.app</a>.
        </p>
      </div>

      <p style="text-align: center; color: #64748b; font-size: 11px; margin: 24px 0 0 0;">
        NexChat Messenger • Account Security & Protection
      </p>
    </div>
  `;

  return dispatchEmail({ to: email, subject, html, text, fromName: 'NexChat Security' });
};
