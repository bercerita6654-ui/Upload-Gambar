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

const clearStoredAccessToken = () => {
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
    localStorage.removeItem(STORAGE_KEY_USER_EMAIL);
  } catch (err) {
    console.warn('Failed to clear access token from localStorage:', err);
  }
};

let isSigningIn = false;
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
  }
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
