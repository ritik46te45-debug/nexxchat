// Cross-platform Notification Engine for Windows, Android, iOS & Mac

let audioCtx = null;

const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

// Play pleasant cross-platform message chime (no external mp3 needed)
export const playIncomingMessageSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Smooth high-tech double chime (880Hz -> 1320Hz)
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch (err) {
    console.warn('Audio notification note:', err);
  }
};

// Request Notification Permission on Windows/Phone
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (e) {
      return Notification.permission;
    }
  }

  return Notification.permission;
};

// Show Native Windows / Android / iOS System Notification
export const showSystemNotification = ({ title, body, icon, onClick, data }) => {
  // Mobile phone vibration
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([120, 80, 120]);
    } catch (e) {}
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const options = {
      body: body || 'New message received',
      icon: icon || '/favicon.ico',
      badge: '/favicon.ico',
      tag: data?.conversationId || 'nexchat-message',
      renotify: true,
      silent: false,
      data,
    };

    const notif = new Notification(title || 'NexChat', options);

    notif.onclick = (event) => {
      event.preventDefault();
      window.focus();
      if (typeof onClick === 'function') {
        onClick();
      }
      notif.close();
    };

    // Auto-close after 6 seconds
    setTimeout(() => {
      try {
        notif.close();
      } catch (e) {}
    }, 6000);

    return notif;
  } catch (err) {
    console.warn('System notification note:', err);
    return null;
  }
};
