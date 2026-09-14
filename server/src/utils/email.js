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

const createTransporter = () => {
  const { user, pass } = getSmtpCredentials();
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';

  // If using Gmail (either explicit host or @gmail.com address), use Gmail service preset (direct SSL port 465)
  if (host.includes('gmail.com') || user.endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
  }

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
};

export const sendVerificationEmail = async (email, token) => {
  if (!hasSmtpConfig()) {
    console.warn('⚠️  SMTP not configured — skipping verification email to', email);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const transporter = createTransporter();
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${token}`;

    await Promise.race([
      transporter.sendMail({
        from: `"NexChat" <${process.env.SMTP_USER || 'support@nexchat.app'}>`,
        to: email,
        subject: 'Verify your NexChat account',
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', sans-serif; background: #0f0f23; color: #e0e0e0; padding: 40px; border-radius: 12px;">
            <h1 style="color: #8b5cf6; text-align: center;">Welcome to NexChat</h1>
            <p style="text-align: center; font-size: 16px;">Click the button below to verify your email address.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Verify Email
              </a>
            </div>
            <p style="text-align: center; color: #888; font-size: 13px;">This link expires in 24 hours.</p>
          </div>
        `,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Verification email dispatch timeout')), 6000)),
    ]);
    console.log(`✅ Verification email sent to ${email}`);
    return { sent: true };
  } catch (error) {
    console.error('Failed to send verification email:', error.message);
    return { sent: false, reason: error.message };
  }
};

export const sendPasswordResetEmail = async (email, token, clientOrigin = null) => {
  if (!hasSmtpConfig()) {
    console.warn('⚠️  SMTP not configured — cannot send password reset email to', email);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const transporter = createTransporter();
    const baseUrl = (clientOrigin || process.env.CLIENT_URL || 'https://nexxchat-zeta.vercel.app').replace(/\/+$/, '');
    const resetUrl = `${baseUrl}/reset-password/${token}`;

    await Promise.race([
      transporter.sendMail({
        from: `"NexChat Support" <${process.env.SMTP_USER || 'support@nexchat.app'}>`,
        to: email,
        subject: 'Reset your NexChat password',
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', sans-serif; background: #0f0f23; color: #e0e0e0; padding: 40px; border-radius: 12px;">
            <h1 style="color: #8b5cf6; text-align: center;">Password Reset</h1>
            <p style="text-align: center; font-size: 16px;">Click the button below to reset your password.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            <p style="text-align: center; color: #888; font-size: 13px;">This link expires in 2 hours. If you didn't request this, ignore this email.</p>
          </div>
        `,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email dispatch timeout')), 6000)),
    ]);
    console.log(`✅ Password reset email sent to ${email}`);
    return { sent: true };
  } catch (error) {
    console.error('Failed to send password reset email:', error.message);
    return { sent: false, reason: error.message };
  }
};
