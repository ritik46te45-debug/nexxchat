import { Capacitor } from '@capacitor/core';

export const GOOGLE_CLIENT_ID = '981601345477-vohruribb3i07iegvas4dtsbqo5k9n7q.apps.googleusercontent.com';

let googleTokenClient = null;
let activeResolve = null;
let activeReject = null;

export const isNativeMobile = () => {
  return typeof window !== 'undefined' && Boolean(
    Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && Boolean(window.Capacitor))
  );
};

/**
 * Initializes Google OAuth2 Token Client ahead of time.
 * Calling this on page mount allows button click handlers to call
 * requestAccessToken() synchronously, which prevents browsers on laptops
 * from ever blocking the popup.
 */
export const initGoogleAuth = () => {
  if (typeof window === 'undefined') return;
  if (!window.google?.accounts?.oauth2) return;

  try {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: (response) => {
        if (response.error) {
          if (activeReject) {
            if (response.error === 'popup_closed_by_user') {
              activeReject(new Error('Google sign-in was closed'));
            } else {
              activeReject(new Error(response.error_description || response.error));
            }
          }
          return;
        }
        if (response.access_token) {
          if (activeResolve) activeResolve({ accessToken: response.access_token });
        } else if (activeReject) {
          activeReject(new Error('No token received from Google'));
        }
      },
      error_callback: (err) => {
        console.warn('Google Token Client error_callback:', err);
        if (activeReject) {
          if (err?.type === 'popup_failed_to_open') {
            activeReject(new Error('Popup blocked by browser. Please allow popups for this site in your browser URL bar.'));
          } else {
            activeReject(new Error(err?.message || 'Google sign-in popup failed to open'));
          }
        }
      },
    });
  } catch (err) {
    console.warn('Google Token Client init error:', err);
  }
};

/**
 * Synchronous Google authentication trigger.
 * Invokes requestAccessToken() with direct user activation.
 */
export const triggerGoogleAuth = () => {
  // 1. Electron Desktop Environment
  if (typeof window !== 'undefined' && window.electronAPI?.loginWithGoogle) {
    return window.electronAPI.loginWithGoogle();
  }

  // 2. Native Mobile APK (Capacitor)
  // Opens the authorized web bridge on Vercel which deep-links back into the APK
  if (isNativeMobile()) {
    const webAuthBridgeUrl = 'https://nexxchat-zeta.vercel.app/login?android=true';
    window.open(webAuthBridgeUrl, '_system');
    return Promise.resolve({ isExternalAuth: true });
  }

  // 3. Browser environment (Laptop or Mobile Browser)
  // Ensure Token Client is initialized
  if (!googleTokenClient && window.google?.accounts?.oauth2) {
    initGoogleAuth();
  }

  return new Promise((resolve, reject) => {
    activeResolve = resolve;
    activeReject = reject;

    if (googleTokenClient) {
      try {
        // SYNCHRONOUS: Preserves user click gesture so browser popup blocker never triggers!
        googleTokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        reject(err);
      }
      return;
    }

    // Fallback if Google library is still loading
    if (!window.google?.accounts) {
      reject(new Error('Google services are still initializing. Please tap again in 1 second.'));
      return;
    }

    // Secondary fallback: Google ID Token
    if (window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (res) => {
            if (res.credential) resolve({ credential: res.credential });
            else reject(new Error('No credential received from Google'));
          },
          auto_select: false,
        });
        window.google.accounts.id.prompt();
      } catch (e) {
        reject(e);
      }
    }
  });
};
