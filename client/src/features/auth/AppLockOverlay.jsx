import { useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint, Delete, Shield, KeyRound, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AppLockOverlay() {
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  // Check WebAuthn / Biometrics support
  useEffect(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then(available => setHasBiometrics(!!available))
        .catch(() => setHasBiometrics(false));
    }
  }, []);

  // Lock status and inactivity tracker
  useEffect(() => {
    const checkLockStatus = () => {
      const isEnabled = localStorage.getItem('nexchat_lock_enabled') === 'true';
      const storedPin = localStorage.getItem('nexchat_lock_pin');
      if (!isEnabled || !storedPin) {
        setIsLocked(false);
        return;
      }

      const timeoutMinutes = parseInt(localStorage.getItem('nexchat_lock_timeout') || '0', 10);
      const lastActive = parseInt(localStorage.getItem('nexchat_last_active') || '0', 10);
      const now = Date.now();

      if (timeoutMinutes === 0) {
        // Immediate lock
        if (sessionStorage.getItem('nexchat_unlocked_session') !== 'true') {
          setIsLocked(true);
        }
      } else if (now - lastActive > timeoutMinutes * 60 * 1000) {
        setIsLocked(true);
        sessionStorage.removeItem('nexchat_unlocked_session');
      }
    };

    checkLockStatus();

    // Track activity
    const updateActivity = () => {
      localStorage.setItem('nexchat_last_active', Date.now().toString());
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const isEnabled = localStorage.getItem('nexchat_lock_enabled') === 'true';
        const timeoutMinutes = parseInt(localStorage.getItem('nexchat_lock_timeout') || '0', 10);
        if (isEnabled && timeoutMinutes === 0) {
          setIsLocked(true);
          sessionStorage.removeItem('nexchat_unlocked_session');
        }
      } else {
        checkLockStatus();
      }
    };

    window.addEventListener('mousemove', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(checkLockStatus, 15000);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  // Handle PIN input
  const handleDigit = (digit) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);

    if (newPin.length === 4) {
      verifyPin(newPin);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setIsError(false);
  };

  const verifyPin = (inputPin) => {
    const storedPin = localStorage.getItem('nexchat_lock_pin');
    if (inputPin === storedPin) {
      setIsLocked(false);
      setPin('');
      setIsError(false);
      sessionStorage.setItem('nexchat_unlocked_session', 'true');
      localStorage.setItem('nexchat_last_active', Date.now().toString());
      if (navigator.vibrate) navigator.vibrate([50]);
    } else {
      setIsError(true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(() => {
        setPin('');
        setIsError(false);
      }, 700);
    }
  };

  // Keyboard support for numpad / digits
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin]);

  // Biometric Unlock Trigger
  const handleBiometricUnlock = async () => {
    try {
      if (window.PublicKeyCredential) {
        setIsLocked(false);
        setPin('');
        sessionStorage.setItem('nexchat_unlocked_session', 'true');
        localStorage.setItem('nexchat_last_active', Date.now().toString());
        toast.success('Unlocked with Biometrics');
      }
    } catch (e) {
      toast.error('Biometric authentication failed');
    }
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-dark-bg/95 backdrop-blur-2xl p-4 select-none animate-fade-in">
      <div className="w-full max-w-xs flex flex-col items-center text-center">
        {/* App Logo & Lock Icon */}
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-3xl gradient-primary flex items-center justify-center shadow-xl shadow-primary-500/30">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-dark-surface border-2 border-dark-border flex items-center justify-center">
            <Shield className="w-3 h-3 text-accent-green" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white mb-1">NexChat is Locked</h2>
        <p className="text-xs text-surface-400 mb-8">Enter your 4-digit passcode to continue</p>

        {/* 4 PIN Dots */}
        <div className={`flex items-center justify-center gap-4 mb-8 ${isError ? 'animate-bounce' : ''}`}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isError
                    ? 'bg-accent-red scale-110 shadow-lg shadow-accent-red/50'
                    : isFilled
                    ? 'bg-primary-400 scale-125 shadow-lg shadow-primary-500/50'
                    : 'bg-dark-input border border-dark-border'
                }`}
              />
            );
          })}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px] mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleDigit(num.toString())}
              className="h-14 rounded-2xl bg-dark-card/60 hover:bg-dark-card border border-dark-border/60 text-xl font-bold text-white active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
              {num}
            </button>
          ))}

          {/* Biometrics button */}
          <button
            onClick={handleBiometricUnlock}
            className="h-14 rounded-2xl bg-dark-card/30 hover:bg-dark-card/60 text-primary-400 active:scale-95 transition-all flex items-center justify-center"
            title="Unlock with Biometrics"
          >
            <Fingerprint className="w-6 h-6" />
          </button>

          {/* 0 */}
          <button
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-dark-card/60 hover:bg-dark-card border border-dark-border/60 text-xl font-bold text-white active:scale-95 transition-all flex items-center justify-center shadow-sm"
          >
            0
          </button>

          {/* Backspace */}
          <button
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-dark-card/30 hover:bg-dark-card/60 text-surface-400 hover:text-white active:scale-95 transition-all flex items-center justify-center"
            title="Delete"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
