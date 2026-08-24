import nodemailer from 'nodemailer';

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendVerificationEmail = async (email, token) => {
  try {
    const transporter = createTransporter();
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${token}`;

    await transporter.sendMail({
      from: `"NexChat" <${process.env.SMTP_USER}>`,
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
    });
    console.log(`✅ Verification email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send verification email:', error.message);
  }
};

export const sendPasswordResetEmail = async (email, token) => {
  try {
    const transporter = createTransporter();
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;

    await transporter.sendMail({
      from: `"NexChat" <${process.env.SMTP_USER}>`,
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
          <p style="text-align: center; color: #888; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    console.log(`✅ Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error.message);
  }
};
