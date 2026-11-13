import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Loader2, X, CheckCircle2, ExternalLink, AlertTriangle, Copy, Check } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function ForgotPasswordModal({ onClose }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetData, setResetData] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email }, { timeout: 15000 });
      setResetData(data);
      toast.success(data.message || 'Password reset email sent! Please check your inbox.');
    } catch (err) {
      const msg = err.code === 'ECONNABORTED'
        ? 'Request timed out. Please check your connection and try again.'
        : (err.response?.data?.error || 'Failed to request password reset');
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-2xl shadow-2xl p-6 sm:p-7 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-surface-400 hover:text-white p-1 rounded-lg hover:bg-dark-hover transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {!resetData ? (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-primary mb-3 text-white">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">Forgot Password?</h2>
              <p className="text-xs text-surface-400 mt-1">
                Enter your registered email address and we'll send a password reset link to your email app.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus transition-all"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Reset Email...</span>
                  </>
                ) : (
                  <>
                    Send Reset Link to Email
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-2 animate-fade-in space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-green/20 text-accent-green mb-1">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Check Your Email</h3>
            <p className="text-xs text-surface-300 leading-relaxed">
              A password reset link has been dispatched to <span className="font-semibold text-white">{email}</span>.
              Please open your email application (e.g. Gmail, Outlook) and click the link to set your new password.
            </p>

            <div className="p-3.5 rounded-xl bg-dark-input/60 border border-dark-border text-left space-y-1.5">
              <p className="text-[11px] text-surface-400">
                💡 <strong>Tip:</strong> If you don't see the email within 1–2 minutes, please check your <strong>Spam or Junk folder</strong>.
              </p>
              <p className="text-[11px] text-surface-500">
                The link will expire in 2 hours for security.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl gradient-primary text-xs font-semibold text-white shadow-lg shadow-primary-500/25 hover:opacity-95 transition-all cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
