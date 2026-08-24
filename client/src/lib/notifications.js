// Cross-platform Notification & Sound Engine for Windows, Android, iOS & Mac

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

// Play customizable cross-platform incoming message chime
export const playIncomingMessageSound = (customTone) => {
  try {
    const isMasterEnabled = localStorage.getItem('nexchat_sound_enabled') !== 'false';
    if (!isMasterEnabled) return;

    const tone = customTone || localStorage.getItem('nexchat_receive_tone') || 'classic';
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (tone === 'pluck') {
      // 3-note cheerful marimba (C5 -> E5 -> G5)
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.07;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.26);
      });
    } else if (tone === 'crystal') {
      // High bell crystal sparkle
      [1046.5, 1318.5, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.05;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.36);
      });
    } else if (tone === 'ping') {
      // Clean subtle glass ping (987.77Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.29);
    } else {
      // Classic smooth double chime (880Hz -> 1320Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
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
    if (!isMasterEnabled || !isSentEnabled) return;

    const tone = customTone || localStorage.getItem('nexchat_sent_tone') || 'swoosh';
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (tone === 'pop') {
      // Bubble Pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.06);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (tone === 'click') {
      // Crisp soft click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } else {
      // Smooth Swoosh / Send Tone (440Hz -> 880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.21);
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
