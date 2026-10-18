import api from './api';
import { Capacitor } from '@capacitor/core';

export const GOOGLE_CLIENT_ID = '981601345477-vohruribb3i07iegvas4dtsbqo5k9n7q.apps.googleusercontent.com';
let cachedClientId = GOOGLE_CLIENT_ID;

export const getGoogleClientIdSync = () => cachedClientId;

export const isNativeMobile = () => {
  return typeof window !== 'undefined' && Boolean(
    Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && Boolean(window.Capacitor))
  );
};

export const getGoogleClientId = async () => {
  if (cachedClientId) return cachedClientId;
  try {
    const { data } = await api.get('/auth/config');
    cachedClientId = data.googleClientId || GOOGLE_CLIENT_ID;
    return cachedClientId;
  } catch (e) {
    return GOOGLE_CLIENT_ID;
  }
};

/**
 * Ensures Google Identity Services (GSI) library is loaded into the page.
 */
export const ensureGoogleLoaded = (timeoutMs = 6000) => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
      return resolve(true);
    }

    let script = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
};

/**
 * Renders official Google Sign-In button into a DOM container element.
 * This native button is completely immune to browser popup blockers.
 */
export const renderGoogleSignInButton = async (containerElement, onCredentialReceived, onError) => {
  if (!containerElement) return;
  const isLoaded = await ensureGoogleLoaded();
  if (!isLoaded || !window.google?.accounts?.id) return;

  const clientId = getGoogleClientIdSync();
  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          onCredentialReceived({ credential: response.credential });
        } else if (onError) {
          onError(new Error('No credential received from Google'));
        }
      },
      auto_select: false,
    });

    containerElement.innerHTML = '';
    window.google.accounts.id.renderButton(containerElement, {
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: Math.min(320, window.innerWidth - 64),
    });
  } catch (err) {
    console.warn('Failed to render official Google button:', err);
  }
};

/**
 * Triggers Google Sign-In using OAuth2 popup flow with automatic fallbacks
 */
export const triggerGoogleAuth = async () => {
  // 1. In Desktop Electron environment, use native OAuth popup flow
  if (typeof window !== 'undefined' && window.electronAPI?.loginWithGoogle) {
    const res = await window.electronAPI.loginWithGoogle();
    if (res && (res.accessToken || res.credential)) {
      return res;
    }
    throw new Error('Google sign-in was cancelled or closed');
  }

  // 2. In Native Mobile (Capacitor Android APK)
  if (isNativeMobile()) {
    const webAuthBridgeUrl = 'https://nexxchat-zeta.vercel.app/login?android=true';
    window.open(webAuthBridgeUrl, '_system');
    return { isExternalAuth: true };
  }

  // 3. Ensure Google GSI Script is ready
  const isLoaded = await ensureGoogleLoaded();
  if (!isLoaded || !window.google?.accounts) {
    throw new Error('Google Sign-In is blocked or could not load. Please check your internet, disable ad-blockers, or sign in with email/password.');
  }

  const clientId = getGoogleClientIdSync();

  return new Promise((resolve, reject) => {
    let handled = false;

    // A. Try Google OAuth2 Token Client (Popup)
    if (window.google.accounts.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: (response) => {
            if (handled) return;
            handled = true;
            if (response.error) {
              if (response.error === 'popup_closed_by_user') {
                reject(new Error('Google sign-in popup was closed'));
              } else {
                reject(new Error(response.error_description || response.error));
              }
              return;
            }
            if (response.access_token) {
              resolve({ accessToken: response.access_token });
            } else {
              reject(new Error('No token received from Google'));
            }
          },
          error_callback: (error) => {
            console.warn('Google OAuth error_callback:', error);
            if (!handled) {
              handled = true;
              if (error?.type === 'popup_failed_to_open') {
                reject(new Error('Popup was blocked by your browser. Please allow popups or tap the official Google button.'));
              } else {
                reject(new Error(error?.message || 'Google popup failed to open'));
              }
            }
          },
        });

        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        console.warn('OAuth2 client init failed, trying ID token fallback:', err);
      }
    }

    // B. Fallback: Google Identity Services ID Token
    if (window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (handled) return;
            handled = true;
            if (response.credential) {
              resolve({ credential: response.credential });
            } else {
              reject(new Error('No credential received'));
            }
          },
          auto_select: false,
        });

        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            if (!handled) {
              handled = true;
              reject(new Error('Google popup was suppressed by your browser. Please use the official Google button below or allow popups.'));
            }
          }
        });
        return;
      } catch (err) {
        if (!handled) {
          handled = true;
          reject(err);
        }
        return;
      }
    }

    if (!handled) {
      handled = true;
      reject(new Error('Google Sign-In is unavailable in this browser. Please use Email and Password to sign in.'));
    }
  });
};
