import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, MessageCircle, ArrowRight, Loader2, Sparkles, HelpCircle } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import { triggerGoogleAuth } from '../../lib/googleAuth';
import ForgotPasswordModal from './ForgotPasswordModal';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const { login, googleLogin, verify2FALogin, error, clearError } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    clearError();
    try {
      const res = await login(email, password);
      if (res?.requires2FA) {
        setRequires2FA(true);
        setTempToken(res.tempToken);
        toast('Two-Factor Authentication required', { icon: '🔐' });
        return;
      }
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (!totpCode.trim() || !tempToken) return;
    setIsSubmitting(true);
    clearError();
    try {
      await verify2FALogin(tempToken, totpCode.trim());
      toast.success('2FA verification successful!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    clearError();
    try {
      toast.loading('Connecting with Google...', { id: 'google-auth' });
      const authResult = await triggerGoogleAuth();
      await googleLogin(authResult);
      toast.success('Signed in with Google!', { id: 'google-auth' });
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed', { id: 'google-auth' });
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 py-8 bg-dark-bg relative overflow-y-auto">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-glow" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 my-auto animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-3 shadow-lg shadow-primary-500/30">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Welcome back</h1>
          <p className="text-surface-400 text-sm">Sign in to continue to NexChat</p>
        </div>

        {/* Form Card */}
        <div className="glass-card p-6 sm:p-8">
          {requires2FA ? (
            <form onSubmit={handleVerify2FA} className="space-y-4 animate-scale-in">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-accent-green/20 text-accent-green flex items-center justify-center mx-auto mb-2 border border-accent-green/30">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-white">Two-Factor Authentication</h2>
                <p className="text-xs text-surface-400 mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>

              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  className="w-full py-3 text-center text-2xl tracking-[0.5em] bg-dark-input border border-dark-border rounded-xl text-white font-mono"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2 animate-fade-in">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || totpCode.length !== 6}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  setTempToken(null);
                  setTotpCode('');
                }}
                className="w-full text-center text-xs text-surface-400 hover:text-white transition-colors"
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus transition-all"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-surface-300">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors font-medium cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus transition-all"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2 animate-fade-in">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl font-semibold text-sm text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 cursor-pointer active:scale-98"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-dark-border" />
                <span className="text-[11px] text-surface-500 uppercase tracking-wider font-medium">or continue with</span>
                <div className="flex-1 h-px bg-dark-border" />
              </div>

              {/* Google Login Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleSubmitting}
                className="w-full py-2.5 rounded-xl font-medium text-xs text-surface-200 bg-dark-input border border-dark-border hover:bg-dark-hover hover:border-primary-500/40 hover:text-white transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer active:scale-98"
              >
                {isGoogleSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              {/* Sign up link */}
              <p className="text-center mt-5 text-xs text-surface-400">
                Don&apos;t have an account?{' '}
                <Link to="/register" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                  Create account
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
      )}
    </div>
  );
}
