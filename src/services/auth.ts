import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DRIVE_SCOPES } from '../config/driveConfig';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const STORAGE_KEY_TOKEN = 'drive_access_token';
const STORAGE_KEY_USER_EMAIL = 'drive_user_email';
const STORAGE_KEY_TOKEN_EXPIRY = 'drive_token_expiry';

// Global token state
let cachedAccessToken: string | null = null;
let isSigningIn = false;
let signInPromise: Promise<{ user: User; accessToken: string } | null> | null = null;
let silentRefreshPromise: Promise<string | null> | null = null;
let keepAliveTimer: NodeJS.Timeout | null = null;

// Helper to get cached token from localStorage
export const getStoredAccessToken = (): string | null => {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const expiryStr = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (!token) return null;

    if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      // Only discard if past expiration by more than 5 minutes
      if (Date.now() > expiry + 300000) {
        return null;
      }
    }
    return token;
  } catch {
    return null;
  }
};

export const getTokenExpiryMs = (): number | null => {
  try {
    const expiryStr = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    return expiryStr ? parseInt(expiryStr, 10) : null;
  } catch {
    return null;
  }
};

export const storeAccessToken = (token: string, email?: string | null, expiresInSeconds = 3600) => {
  try {
    cachedAccessToken = token;
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    // Google OAuth access tokens typically expire in 3600 seconds (1 hour)
    localStorage.setItem(
      STORAGE_KEY_TOKEN_EXPIRY,
      (Date.now() + Math.max(expiresInSeconds - 60, 1800) * 1000).toString()
    );
    if (email) {
      localStorage.setItem(STORAGE_KEY_USER_EMAIL, email);
    }
  } catch (err) {
    console.warn('Failed to store access token in localStorage:', err);
  }
};

export const clearStoredAccessToken = () => {
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
    // Keep STORAGE_KEY_USER_EMAIL so we can remember account for login_hint
  } catch (err) {
    console.warn('Failed to clear access token from localStorage:', err);
  }
};

export const clearAuthToken = () => {
  cachedAccessToken = null;
  clearStoredAccessToken();
};

/**
 * Checks whether an error is caused by invalid, missing, or expired Google OAuth credentials.
 */
export const isAuthError = (err: unknown): boolean => {
  if (!err) return false;
  const message =
    typeof err === 'string'
      ? err
      : (err as any)?.message ||
        (err as any)?.error?.message ||
        (err as any)?.statusText ||
        String(err);
  const status = (err as any)?.status || (err as any)?.statusCode;
  const code = (err as any)?.code || (err as any)?.error?.code;

  if (
    status === 401 ||
    code === 401 ||
    code === 'UNAUTHORIZED' ||
    code === 'TOKEN_EXPIRED' ||
    code === 'UNAUTHENTICATED' ||
    code === 'auth/invalid-credential'
  ) {
    return true;
  }

  return /invalid authentication credentials|Expected OAuth 2 access token|login cookie|devconsole-project|TOKEN_EXPIRED|UNAUTHENTICATED|unauthorized|invalid_token|401|kedaluwarsa|login ulang|Token otorisasi|akses ditolak|oauth.*token/i.test(
    message
  );
};

/**
 * Validates whether the given Google OAuth access token is alive and functional against Google Drive API.
 */
export const validateToken = async (token?: string | null): Promise<boolean> => {
  if (!token) return false;
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user&supportsAllDrives=true', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401) {
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Attempts silent background token refresh via Google Identity Services (GIS).
 * If user already granted permission, GIS can renew access token without prompting.
 */
export const refreshAccessTokenSilently = async (): Promise<string | null> => {
  if (silentRefreshPromise) return silentRefreshPromise;

  silentRefreshPromise = (async () => {
    try {
      if (typeof window === 'undefined') return null;

      // Check if GIS library is available on window
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        return null;
      }

      const email =
        auth.currentUser?.email ||
        localStorage.getItem(STORAGE_KEY_USER_EMAIL) ||
        '';

      return await new Promise<string | null>((resolve) => {
        let isSettled = false;
        const timer = setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            resolve(null);
          }
        }, 5000);

        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: (firebaseConfig as any).oAuthClientId || '',
            scope: DRIVE_SCOPES.join(' '),
            hint: email || undefined,
            prompt: '', // Silent renew with existing consent
            callback: (res: any) => {
              if (isSettled) return;
              isSettled = true;
              clearTimeout(timer);

              if (res?.access_token) {
                console.log('[AUTH] Silent OAuth token refresh succeeded!');
                storeAccessToken(res.access_token, email, res.expires_in || 3600);
                resolve(res.access_token);
              } else {
                resolve(null);
              }
            },
            error_callback: (err: any) => {
              if (isSettled) return;
              isSettled = true;
              clearTimeout(timer);
              console.warn('[AUTH] Silent OAuth token refresh failed:', err);
              resolve(null);
            },
          });

          client.requestAccessToken({ prompt: '' });
        } catch (initErr) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            console.warn('[AUTH] Failed to initialize GIS client:', initErr);
            resolve(null);
          }
        }
      });
    } catch {
      return null;
    } finally {
      silentRefreshPromise = null;
    }
  })();

  return silentRefreshPromise;
};

// Factory function to create provider with smart parameters (login_hint and no repeated consent prompt)
const createGoogleProvider = (loginHintEmail?: string | null, forceConsent = false): GoogleAuthProvider => {
  const prov = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach((scope) => prov.addScope(scope));

  const customParams: Record<string, string> = {};

  const emailToHint = loginHintEmail || localStorage.getItem(STORAGE_KEY_USER_EMAIL);
  if (emailToHint) {
    customParams.login_hint = emailToHint;
  }

  if (forceConsent) {
    customParams.prompt = 'consent';
  }

  prov.setCustomParameters(customParams);
  return prov;
};

/**
 * Initializes Firebase auth state change listener and proactive token keep-alive.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onTokenNeedRefresh?: (user: User) => void,
  onLoggedOut?: () => void
) => {
  // Start Keep-Alive Background Heartbeat to prevent token from ever expiring
  if (!keepAliveTimer && typeof window !== 'undefined') {
    keepAliveTimer = setInterval(async () => {
      const expiry = getTokenExpiryMs();
      if (expiry && auth.currentUser) {
        // If token expires within 10 minutes, silently refresh it in background
        if (Date.now() > expiry - 600000) {
          console.log('[AUTH] Proactive background token refresh triggered...');
          const fresh = await refreshAccessTokenSilently();
          if (fresh && onAuthSuccess) {
            onAuthSuccess(auth.currentUser, fresh);
          }
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Also refresh on window focus / tab visibility change if nearing expiry
    window.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        const expiry = getTokenExpiryMs();
        if (expiry && Date.now() > expiry - 300000) {
          const fresh = await refreshAccessTokenSilently();
          if (fresh && onAuthSuccess) {
            onAuthSuccess(auth.currentUser, fresh);
          }
        }
      }
    });
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (user.email) {
        localStorage.setItem(STORAGE_KEY_USER_EMAIL, user.email);
      }

      // Check stored token
      const stored = cachedAccessToken || getStoredAccessToken();
      if (stored) {
        cachedAccessToken = stored;
        if (onAuthSuccess) onAuthSuccess(user, stored);
      } else {
        // Attempt silent refresh first
        const silentlyRenewed = await refreshAccessTokenSilently();
        if (silentlyRenewed) {
          cachedAccessToken = silentlyRenewed;
          if (onAuthSuccess) onAuthSuccess(user, silentlyRenewed);
        } else if (onTokenNeedRefresh) {
          onTokenNeedRefresh(user);
        }
      }
    } else {
      cachedAccessToken = null;
      clearStoredAccessToken();
      if (onLoggedOut) onLoggedOut();
    }
  });
};

/**
 * Interactive Google Sign-In with popup.
 * Automatically remembers email hint and stores credentials.
 */
export const googleSignIn = async (
  options: { forceConsent?: boolean; customEmail?: string } = {}
): Promise<{ user: User; accessToken: string } | null> => {
  if (signInPromise) {
    return signInPromise;
  }

  signInPromise = (async () => {
    try {
      isSigningIn = true;
      const currentUser = auth.currentUser;
      const hintEmail = options.customEmail || currentUser?.email || localStorage.getItem(STORAGE_KEY_USER_EMAIL);

      const prov = createGoogleProvider(hintEmail, options.forceConsent);
      const result = await signInWithPopup(auth, prov);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Gagal mendapatkan token otorisasi dari Google Auth');
      }

      cachedAccessToken = credential.accessToken;
      storeAccessToken(cachedAccessToken, result.user.email);

      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error: unknown) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      isSigningIn = false;
      signInPromise = null;
    }
  })();

  return signInPromise;
};

/**
 * Retrieves the currently active Google OAuth access token.
 * Proactively attempts silent refresh if expired or missing.
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const stored = getStoredAccessToken();
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }

  // Try silent refresh if user is still signed in with Firebase
  if (auth.currentUser) {
    const silent = await refreshAccessTokenSilently();
    if (silent) {
      cachedAccessToken = silent;
      return silent;
    }
  }

  return null;
};

export const logout = async () => {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  await signOut(auth);
  cachedAccessToken = null;
  clearStoredAccessToken();
  localStorage.removeItem(STORAGE_KEY_USER_EMAIL);
};
