import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, MessageCircle, ArrowRight, Loader2, Check, X } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import { triggerGoogleAuth, initGoogleAuth } from '../../lib/googleAuth';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, googleLogin, error, clearError } = useAuthStore();

  useEffect(() => {
    initGoogleAuth();
  }, []);

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
    <div className="min-h-screen w-full flex items-center justify-center p-4 py-8 bg-[#0B0F17] relative overflow-y-auto selection:bg-indigo-500/30">
      {/* Subtle top ambient sheen */}
      <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(99,102,241,0.12),transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 my-auto animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-indigo-500 to-indigo-600 mb-3 shadow-lg shadow-indigo-950/50 ring-1 ring-white/20">
            <MessageCircle className="w-7 h-7 text-white stroke-[2.2]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1">Create account</h1>
          <p className="text-surface-400 text-sm">Join NexChat and start messaging</p>
        </div>

        {/* Form Card */}
        <div className="glass-card p-6 sm:p-8 relative">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-xs font-semibold">@</span>
                <input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="johndoe"
                  className="w-full h-11 pl-8 pr-4 bg-[#151D2C] border border-white/[0.08] rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                />
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Display Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  name="displayName"
                  value={form.displayName}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full h-11 pl-10 pr-4 bg-[#151D2C] border border-white/[0.08] rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                  required
                  maxLength={50}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full h-11 pl-10 pr-4 bg-[#151D2C] border border-white/[0.08] rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-10 bg-[#151D2C] border border-white/[0.08] rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <div className="grid grid-cols-2 gap-1.5 mt-2 px-0.5">
                  <PasswordCheck met={passwordChecks.length} label="8+ characters" />
                  <PasswordCheck met={passwordChecks.upper} label="Uppercase" />
                  <PasswordCheck met={passwordChecks.lower} label="Lowercase" />
                  <PasswordCheck met={passwordChecks.number} label="Number" />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5 animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !allPasswordChecks}
              className="w-full h-11 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-4"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/[0.08]" />
            <span className="text-[11px] text-surface-500 uppercase tracking-wider font-semibold">or continue with</span>
            <div className="flex-1 h-px bg-white/[0.08]" />
          </div>

          {/* Google Login Button */}
          <button
            type="button"
            onClick={async () => {
              try {
                const authPromise = triggerGoogleAuth();
                toast.loading('Connecting with Google...', { id: 'google-auth' });
                const authResult = await authPromise;
                if (authResult?.isExternalAuth) {
                  toast.dismiss('google-auth');
                  return;
                }
                await googleLogin(authResult);
                toast.success('Signed in with Google!', { id: 'google-auth' });
              } catch (err) {
                toast.error(err.message || 'Google sign-in failed', { id: 'google-auth' });
              }
            }}
            className="w-full h-11 rounded-xl font-medium text-xs text-surface-200 bg-[#161F2E] hover:bg-[#1C2638] border border-white/[0.08] hover:border-white/[0.15] hover:text-white transition-colors flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99]"
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
          <p className="text-center mt-5 text-xs text-surface-400">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
