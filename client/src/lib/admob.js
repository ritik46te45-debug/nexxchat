import { Capacitor } from '@capacitor/core';

// User AdMob Configuration
export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-7458210699598859~4596153803',
  bannerAdUnitId: 'ca-app-pub-7458210699598859/2180697273',
};

let isAdMobInitialized = false;
let isBannerShowing = false;

export const initAdMob = async () => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const { AdMob } = await import('@capacitor-community/admob');
    if (!isAdMobInitialized) {
      await AdMob.initialize({
        requestTrackingAuthorization: true,
        testingDevices: [],
        initializeForTesting: false,
      });
      isAdMobInitialized = true;
      console.log('[ADMOB] Initialized successfully');
    }
    return true;
  } catch (err) {
    console.warn('[ADMOB] Initialization note:', err.message);
    return false;
  }
};

export const showBannerAd = async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const ok = await initAdMob();
    if (!ok) return;

    const { AdMob, BannerAdPosition, BannerAdSize } = await import('@capacitor-community/admob');
    if (isBannerShowing) return;

    await AdMob.showBanner({
      adId: ADMOB_CONFIG.bannerAdUnitId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 60, // Above the mobile bottom navigation bar
      isTesting: false,
    });

    isBannerShowing = true;
    console.log('[ADMOB] Banner ad displayed');
  } catch (err) {
    console.warn('[ADMOB] Show banner note:', err.message);
  }
};

export const hideBannerAd = async () => {
  if (!Capacitor.isNativePlatform() || !isBannerShowing) return;

  try {
    const { AdMob } = await import('@capacitor-community/admob');
    await AdMob.hideBanner();
    isBannerShowing = false;
  } catch (err) {
    console.warn('[ADMOB] Hide banner note:', err.message);
  }
};
