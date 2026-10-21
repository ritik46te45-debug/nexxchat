import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Trigger subtle tactile feedback on mobile devices
 * @param {'light'|'medium'|'heavy'} type
 */
export const triggerHaptic = async (type = 'light') => {
  try {
    const isNative = typeof window !== 'undefined' && Boolean(
      window.Capacitor?.isNativePlatform?.() ||
      window.location.protocol === 'capacitor:'
    );

    if (isNative) {
      const style = type === 'medium' ? ImpactStyle.Medium : type === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light;
      await Haptics.impact({ style });
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'medium' ? 25 : 15);
    }
  } catch {}
};

export const triggerSelectionHaptic = async () => {
  try {
    const isNative = typeof window !== 'undefined' && Boolean(
      window.Capacitor?.isNativePlatform?.() ||
      window.location.protocol === 'capacitor:'
    );

    if (isNative) {
      await Haptics.selectionStart();
      return;
    }
  } catch {}
};
