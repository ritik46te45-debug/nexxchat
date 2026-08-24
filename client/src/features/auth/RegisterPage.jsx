import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, MessageCircle, ArrowRight, Loader2, Check, X } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import { triggerGoogleAuth } from '../../lib/googleAuth';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, googleLogin, error, clearError } = useAuthStore();

  const passwordChecks = {
    length: form.password.length >= 8,
    upper: /[A-Z]/.test(form.password),
    lower: /[a-z]/.test(form.password),
    number: /[0-9]/.test(form.password),
  };
  const allPasswordChecks = Object.values(passwordChecks).every(Boolean);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allPasswordChecks) return;
    setIsSubmitting(true);
    clearError();
    try {
      await register(form);
      toast.success('Account created! 🎉');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const PasswordCheck = ({ met, label }) => (
    <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? 'text-accent-green' : 'text-surface-500'}`}>
      {met ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      {label}
    </div>
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 py-8 bg-dark-bg relative overflow-y-auto">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-glow" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 -left-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 my-auto animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-4 shadow-lg shadow-primary-500/30">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Create account</h1>
          <p className="text-surface-400">Join NexChat and start messaging</p>
        </div>

        {/* Form */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Username</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-sm font-medium">@</span>
                <input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="johndoe"
                  className="w-full pl-9 pr-4 py-3 bg-dark-input border border-dark-border rounded-xl text-white placeholder-surface-500 input-focus transition-all"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                />
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Display Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                <input
                  name="displayName"
                  value={form.displayName}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full pl-11 pr-4 py-3 bg-dark-input border border-dark-border rounded-xl text-white placeholder-surface-500 input-focus transition-all"
                  required
                  maxLength={50}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-dark-input border border-dark-border rounded-xl text-white placeholder-surface-500 input-focus transition-all"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3 bg-dark-input border border-dark-border rounded-xl text-white placeholder-surface-500 input-focus transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {form.password && (
                <div className="grid grid-cols-2 gap-1 mt-2">
                  <PasswordCheck met={passwordChecks.length} label="8+ characters" />
                  <PasswordCheck met={passwordChecks.upper} label="Uppercase" />
                  <PasswordCheck met={passwordChecks.lower} label="Lowercase" />
                  <PasswordCheck met={passwordChecks.number} label="Number" />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !allPasswordChecks}
              className="w-full py-3.5 rounded-xl font-semibold text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 mt-6 cursor-pointer active:scale-98"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-5 h-5" />
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
            onClick={async () => {
              try {
                toast.loading('Connecting with Google...', { id: 'google-auth' });
                const authResult = await triggerGoogleAuth();
                await googleLogin(authResult);
                toast.success('Signed in with Google!', { id: 'google-auth' });
              } catch (err) {
                toast.error(err.message || 'Google sign-in failed', { id: 'google-auth' });
              }
            }}
            className="w-full py-2.5 rounded-xl font-medium text-xs text-surface-200 bg-dark-input border border-dark-border hover:bg-dark-hover hover:border-primary-500/40 hover:text-white transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer active:scale-98"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* Sign in link */}
          <p className="text-center mt-6 text-sm text-surface-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
