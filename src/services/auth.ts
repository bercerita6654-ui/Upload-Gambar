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

/**
 * Helper to get cached token from localStorage if not expired
 */
export const getStoredAccessToken = (): string | null => {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const expiryStr = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (!token) return null;

    if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      // If token expired, clear it and return null
      if (Date.now() > expiry) {
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
 * Safe fallback for silent refresh that avoids origin_mismatch and popup loops.
 * Checks whether valid stored token exists.
 */
export const refreshAccessTokenSilently = async (): Promise<string | null> => {
  const stored = getStoredAccessToken();
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

// Factory function to create provider with smart parameters (login_hint and scopes)
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
 * Initializes Firebase auth state change listener.
 * Does not fire any rogue background popup requests or GIS origin_mismatch requests.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onTokenNeedRefresh?: (user: User) => void,
  onLoggedOut?: () => void
) => {
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
        // Token is not present or has expired, notify caller so UI can prompt when needed
        if (onTokenNeedRefresh) {
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
 * Triggered explicitly by user clicks (e.g. login button or ReauthModal action button).
 * Automatically uses Firebase authDomain (no origin_mismatch error).
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
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const stored = getStoredAccessToken();
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  clearStoredAccessToken();
  localStorage.removeItem(STORAGE_KEY_USER_EMAIL);
};
