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

// Helper to get cached token from localStorage if not expired
const getStoredAccessToken = (): string | null => {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const expiryStr = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (!token) return null;

    if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      // Give a 2-minute safety buffer before expiration
      if (Date.now() > expiry - 120000) {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
        return null;
      }
    }
    return token;
  } catch {
    return null;
  }
};

const storeAccessToken = (token: string, email?: string | null) => {
  try {
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    // Google OAuth access tokens typically expire in 3600 seconds (1 hour)
    localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, (Date.now() + 3500 * 1000).toString());
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
    localStorage.removeItem(STORAGE_KEY_USER_EMAIL);
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
    code === 'UNAUTHENTICATED'
  ) {
    return true;
  }

  return /invalid authentication credentials|Expected OAuth 2 access token|login cookie|devconsole-project|TOKEN_EXPIRED|UNAUTHENTICATED|unauthorized|invalid_token|401|kedaluwarsa|login ulang|Token otorisasi|akses ditolak/i.test(
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
      clearAuthToken();
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
};

let isSigningIn = false;
let signInPromise: Promise<{ user: User; accessToken: string } | null> | null = null;
let cachedAccessToken: string | null = getStoredAccessToken();

// Factory function to create provider with smart parameters (login_hint and no repeated consent prompt)
const createGoogleProvider = (loginHintEmail?: string | null, forceConsent = false): GoogleAuthProvider => {
  const prov = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach((scope) => prov.addScope(scope));

  const customParams: Record<string, string> = {};
  
  // Use login_hint if available to automatically select user account
  const emailToHint = loginHintEmail || localStorage.getItem(STORAGE_KEY_USER_EMAIL);
  if (emailToHint) {
    customParams.login_hint = emailToHint;
  }

  // Only prompt consent if explicitly forced, otherwise omit or use standard to avoid repeated popups
  if (forceConsent) {
    customParams.prompt = 'consent';
  }

  prov.setCustomParameters(customParams);
  return prov;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // Remember user email for login_hint
      if (user.email) {
        localStorage.setItem(STORAGE_KEY_USER_EMAIL, user.email);
      }

      // Check in-memory or persisted token
      const validToken = cachedAccessToken || getStoredAccessToken();
      if (validToken) {
        cachedAccessToken = validToken;
        if (onAuthSuccess) onAuthSuccess(user, validToken);
      } else if (!isSigningIn) {
        // Firebase user session exists, but access token expired or missing.
        // User is kept in session, ready for quick re-auth with login_hint
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      clearStoredAccessToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

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
};
