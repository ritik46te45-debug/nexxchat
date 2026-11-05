import { useState, useEffect } from 'react';
import { Phone, ShieldCheck, ArrowRight, Loader2, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function PhoneVerificationModal() {
  const { user, sendPhoneOTP, verifyPhoneOTP } = useAuthStore();

  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // If user already has a verified phone, NEVER display this modal
  if (!user || (user.phone && user.isPhoneVerified)) {
    return null;
  }

  // Pre-fill existing phone if user has one saved but not verified
  useEffect(() => {
    if (user?.phone && !phoneNumber) {
      const clean = user.phone.replace(/[^\d+]/g, '');
      if (clean.startsWith('+91')) {
        setCountryCode('+91');
        setPhoneNumber(clean.slice(3));
      } else if (clean.startsWith('+')) {
        setCountryCode(clean.slice(0, 3));
        setPhoneNumber(clean.slice(3));
      } else {
        setPhoneNumber(clean);
      }
    }
  }, [user]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOTP = async (e) => {
    e?.preventDefault?.();
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (cleanDigits.length < 8) {
      toast.error('Please enter a valid phone number (at least 8 digits)');
      return;
    }

    const fullNumber = `${countryCode}${cleanDigits}`;
    setIsSending(true);
    try {
      const res = await sendPhoneOTP(fullNumber);
      setOtpSent(true);
      setCountdown(60);
      toast.success(res.message || 'OTP sent! Please check your phone.');
      if (res.devOtp) {
        toast(`OTP Code: ${res.devOtp}`, { icon: '🔑', duration: 9000 });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to send OTP. Please check your number.');
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e?.preventDefault?.();
    if (otpCode.trim().length !== 6) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    const cleanDigits = phoneNumber.replace(/\D/g, '');
    const fullNumber = `${countryCode}${cleanDigits}`;
    setIsVerifying(true);
    try {
      await verifyPhoneOTP(fullNumber, otpCode.trim());
      toast.success('Phone verified successfully! Welcome to NexChat! 🎉');
    } catch (err) {
      toast.error(err.message || 'Invalid or expired OTP code');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-md p-6 sm:p-7 rounded-3xl bg-dark-card/95 border border-primary-500/40 shadow-2xl backdrop-blur-2xl text-white select-none animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-primary-500/30">
            <Phone className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Verify Phone Number</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent-green/20 text-accent-green border border-accent-green/30">
                Required
              </span>
            </div>
            <p className="text-xs text-surface-400">
              Mandatory to secure your account and match friends
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-3.5 rounded-2xl bg-dark-input border border-dark-border mb-5 text-xs text-surface-300 leading-relaxed flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
          <span>
            NexChat requires a verified mobile number so your contacts can discover and message you directly.
          </span>
        </div>

        {!otpSent ? (
          /* Step 1: Enter Phone Number */
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                Mobile Number
              </label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-28 px-2.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-xs text-white input-focus font-medium cursor-pointer"
                >
                  <option value="+91">🇮🇳 +91 (IN)</option>
                  <option value="+1">🇺🇸 +1 (US/CA)</option>
                  <option value="+44">🇬🇧 +44 (UK)</option>
                  <option value="+971">🇦🇪 +971 (UAE)</option>
                  <option value="+61">🇦🇺 +61 (AU)</option>
                  <option value="+49">🇩🇪 +49 (DE)</option>
                  <option value="+33">🇫🇷 +33 (FR)</option>
                  <option value="+81">🇯🇵 +81 (JP)</option>
                  <option value="+65">🇸🇬 +65 (SG)</option>
                </select>

                <div className="relative flex-1">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="98765 43210"
                    maxLength={14}
                    className="w-full px-3.5 py-2.5 bg-dark-input border border-dark-border rounded-xl text-sm text-white placeholder-surface-500 input-focus font-mono tracking-wider"
                    required
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSending || phoneNumber.length < 8}
              className="w-full py-3 rounded-2xl gradient-primary hover:opacity-95 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending Free OTP...</span>
                </>
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: Enter 6-digit OTP */
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-surface-300">
                  Enter 6-digit Code
                </label>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-primary-400 hover:underline cursor-pointer"
                >
                  Change number
                </button>
              </div>

              <p className="text-[11px] text-surface-400 mb-2">
                Sent to <span className="font-mono text-white font-semibold">{countryCode} {phoneNumber}</span>
              </p>

              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="000000"
                className="w-full py-3 text-center text-2xl tracking-[0.5em] bg-dark-input border border-dark-border rounded-2xl text-white font-mono input-focus"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying || otpCode.length !== 6}
              className="w-full py-3 rounded-2xl gradient-primary hover:opacity-95 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify & Unlock NexChat</span>
                </>
              )}
            </button>

            <div className="text-center pt-1">
              {countdown > 0 ? (
                <p className="text-xs text-surface-500">
                  Resend code in <span className="font-mono text-primary-400 font-bold">{countdown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOTP}
                  disabled={isSending}
                  className="text-xs text-primary-400 hover:text-primary-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resend Free OTP</span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
