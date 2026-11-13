import { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Shield, Fingerprint, Eye, EyeOff, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export default function AppLockOverlay({ children }) {
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [hasCustomPin, setHasCustomPin] = useState(() => {
    return !!localStorage.getItem('nexchat_app_pin');
  });
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newPin, setNewPin] = useState('');

  const timerRef = useRef(null);

  const resetTimer = () => {
    if (isLocked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    
    // Only lock automatically if user has PIN lock enabled
    const enabled = localStorage.getItem('nexchat_pin_lock_enabled') === 'true';
    if (!enabled) return;

    timerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, INACTIVITY_TIMEOUT_MS);
  };

  useEffect(() => {
    const handleActivity = () => resetTimer();
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const enabled = localStorage.getItem('nexchat_pin_lock_enabled') === 'true';
        if (enabled) {
          setIsLocked(true);
        }
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocked]);

  const handleUnlock = (enteredPin) => {
    const savedPin = localStorage.getItem('nexchat_app_pin') || '0000';
    if (enteredPin === savedPin) {
      setIsLocked(false);
      setPin('');
      resetTimer();
      toast.success('App Unlocked', { id: 'app-unlocked', icon: '🔓' });
    } else {
      toast.error('Incorrect Security PIN', { id: 'wrong-pin' });
      setPin('');
    }
  };

  const handleDigit = (digit) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        handleUnlock(next);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <>
      {children}

      {isLocked && (
        <div className="fixed inset-0 z-[9999] bg-[#080b11]/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4 select-none animate-fade-in">
          {/* Security Shield Card */}
          <div className="w-full max-w-xs flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-600/20 border border-primary-500/40 flex items-center justify-center text-primary-400 mb-4 shadow-lg shadow-primary-500/10">
              <Lock className="w-8 h-8 text-primary-400 animate-pulse" />
            </div>

            <h2 className="text-xl font-bold text-white mb-1 tracking-tight">NexChat Locked</h2>
            <p className="text-xs text-surface-400 mb-6">Enter your 4-digit PIN to access messages</p>

            {/* PIN Dots Display */}
            <div className="flex items-center gap-4 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                    pin.length > i
                      ? 'bg-primary-500 scale-125 shadow-md shadow-primary-500/50'
                      : 'border-2 border-surface-600 bg-transparent'
                  }`}
                />
              ))}
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleDigit(num.toString())}
                  className="h-14 rounded-2xl bg-dark-card/80 hover:bg-dark-hover active:bg-primary-600/30 border border-dark-border/80 text-white font-medium text-xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  {num}
                </button>
              ))}

              {/* Biometrics / Quick unlock button */}
              <button
                onClick={() => {
                  toast('Biometric check ready', { icon: '👆' });
                }}
                className="h-14 rounded-2xl bg-dark-card/40 hover:bg-dark-hover border border-dark-border/50 text-surface-400 flex items-center justify-center transition-all active:scale-95"
                title="Biometric Fingerprint"
              >
                <Fingerprint className="w-5 h-5 text-primary-400" />
              </button>

              <button
                onClick={() => handleDigit('0')}
                className="h-14 rounded-2xl bg-dark-card/80 hover:bg-dark-hover active:bg-primary-600/30 border border-dark-border/80 text-white font-medium text-xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
              >
                0
              </button>

              <button
                onClick={handleDelete}
                className="h-14 rounded-2xl bg-dark-card/40 hover:bg-dark-hover border border-dark-border/50 text-surface-400 hover:text-white flex items-center justify-center transition-all active:scale-95 text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
