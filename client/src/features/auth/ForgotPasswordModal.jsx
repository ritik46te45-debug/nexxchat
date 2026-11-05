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
      const { data } = await api.post('/auth/forgot-password', { email }, { timeout: 10000 });
      setResetData(data);
      if (data.emailSent) {
        toast.success('Reset link prepared! Check your email or click below.');
      } else if (data.resetUrl) {
        toast.success('Reset link ready — click below to set password');
      } else {
        toast.success(data.message || 'Recovery instructions prepared');
      }
    } catch (err) {
      const msg = err.code === 'ECONNABORTED'
        ? 'Request timed out. Please check your connection and try again.'
        : (err.response?.data?.error || 'Failed to request password reset');
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToReset = () => {
    onClose();
    if (resetData?.resetToken) {
      navigate(`/reset-password/${resetData.resetToken}`);
    } else if (resetData?.resetUrl) {
      window.location.href = resetData.resetUrl;
    }
  };

  const handleCopyLink = () => {
    if (resetData?.resetUrl) {
      navigator.clipboard.writeText(resetData.resetUrl);
      setCopied(true);
      toast.success('Reset link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
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
                Enter your registered email address and we'll help you reset your password.
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
                    <span>Preparing Reset Link...</span>
                  </>
                ) : (
                  <>
                    Send Recovery Link
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
            <h3 className="text-lg font-bold text-white">
              {resetData.emailSent ? 'Check Your Email' : 'Reset Link Ready'}
            </h3>
            <p className="text-xs text-surface-300">
              {resetData.emailSent
                ? `A password reset link was dispatched to ${email}. You can also open the reset page immediately below:`
                : (resetData.message || 'Your password reset link is ready. Use the button below to set your new password.')}
            </p>

            {/* Direct Action Button */}
            {(resetData.resetUrl || resetData.resetToken) && (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleGoToReset}
                  className="w-full py-3 px-4 rounded-xl gradient-primary text-white font-semibold text-xs shadow-lg shadow-primary-500/25 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Click Here to Set New Password <ExternalLink className="w-4 h-4" />
                </button>

                {resetData.resetUrl && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full py-2 px-3 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-xs text-surface-300 hover:text-white flex items-center justify-center gap-1.5 transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Link Copied!' : 'Copy Direct Reset Link'}
                  </button>
                )}
                <p className="text-[11px] text-surface-500">Link expires in 2 hours.</p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-xs font-medium text-surface-300 hover:text-white transition-all cursor-pointer"
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
