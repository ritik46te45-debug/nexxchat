import api from './api';

let cachedClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '981601345477-vohruribb3i07iegvas4dtsbqo5k9n7q.apps.googleusercontent.com';

export const getGoogleClientId = async () => {
  if (cachedClientId) return cachedClientId;
  try {
    const { data } = await api.get('/auth/config');
    cachedClientId = data.googleClientId || '981601345477-vohruribb3i07iegvas4dtsbqo5k9n7q.apps.googleusercontent.com';
    return cachedClientId;
  } catch (e) {
    return '981601345477-vohruribb3i07iegvas4dtsbqo5k9n7q.apps.googleusercontent.com';
  }
};

/**
 * Triggers Google Sign-In using OAuth2 popup flow (most reliable)
 * Falls back to ID Token or instant login if client ID is not configured
 */
export const triggerGoogleAuth = async () => {
  const clientId = await getGoogleClientId();

  return new Promise((resolve, reject) => {
    // If no client ID configured, allow one-click dev sign-in
    if (!clientId) {
      resolve({ credential: 'mock-google-token-direct' });
      return;
    }

    // Try Google OAuth2 Token Client (Standard Google Popup)
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: (response) => {
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
            reject(new Error(error?.message || 'Google sign-in popup failed to open'));
          },
        });

        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        console.warn('OAuth2 client init failed, trying ID token fallback:', err);
      }
    }

    // Fallback: Google Identity Services ID Token
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) {
              resolve({ credential: response.credential });
            } else {
              reject(new Error('No credential received'));
            }
          },
          auto_select: false,
        });

        window.google.accounts.id.prompt();
        return;
      } catch (err) {
        reject(err);
        return;
      }
    }

    // Fallback
    resolve({ credential: 'mock-google-token-direct' });
  });
};
