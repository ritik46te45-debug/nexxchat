// Robust Cross-platform Notification & Sound Engine for Windows, Android, iOS & Mac

let audioCtx = null;

export const getAudioContext = () => {
  try {
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
  } catch (e) {
    console.warn('AudioContext init error:', e);
    return null;
  }
};

// Automatically resume/unlock AudioContext on first user interaction in browser
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

// Play customizable incoming message chime
export const playIncomingMessageSound = (customTone) => {
  try {
    const isMasterEnabled = localStorage.getItem('nexchat_sound_enabled') !== 'false';
    if (!isMasterEnabled && !customTone) return;

    const tone = customTone || localStorage.getItem('nexchat_receive_tone') || 'classic';
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime + 0.01;

    if (tone === 'pluck') {
      // 3-note cheerful marimba (C5 -> E5 -> G5)
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.08;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.4, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.32);
      });
    } else if (tone === 'crystal') {
      // High bell crystal sparkle
      [1046.5, 1318.5, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.06;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } else if (tone === 'ping') {
      // Clean subtle glass ping (987.77Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } else {
      // Classic smooth double chime (880Hz -> 1320Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.09);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    }
  } catch (err) {
    console.warn('Incoming chime error:', err);
  }
};

// Play customizable outgoing / sent message sound
export const playSentMessageSound = (customTone) => {
  try {
    const isMasterEnabled = localStorage.getItem('nexchat_sound_enabled') !== 'false';
    const isSentEnabled = localStorage.getItem('nexchat_sent_sound_enabled') !== 'false';
    if ((!isMasterEnabled || !isSentEnabled) && !customTone) return;

    const tone = customTone || localStorage.getItem('nexchat_sent_tone') || 'swoosh';
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime + 0.01;

    if (tone === 'pop') {
      // Bubble Pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.07);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (tone === 'click') {
      // Crisp soft click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      // Smooth Swoosh / Send Tone (440Hz -> 880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.38, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  } catch (err) {
    console.warn('Sent sound error:', err);
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
  // 1. Electron Desktop Native Toast Notification (Windows 10/11)
  if (typeof window !== 'undefined' && window.electronAPI?.showNotification) {
    window.electronAPI.showNotification({
      title: title || 'NexChat',
      body: body || 'New message received',
      icon: icon || '/favicon.ico',
      conversationId: data?.conversationId,
    });
    return null;
  }

  // 2. Mobile phone vibration
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
