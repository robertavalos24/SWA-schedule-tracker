import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore,
  Firestore,
} from 'firebase/firestore';
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication with Multi-Tiered Persistence:
// 1. indexedDBLocalPersistence (standard modern browser persistence)
// 2. browserLocalPersistence (localStorage fallback when IndexedDB is blocked or restricted by Safari ITP / iframes)
// 3. inMemoryPersistence (guaranteed fallback if storage is completely partitioned)
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch (err) {
  console.warn('Firebase initializeAuth note (already initialized or fallback):', err);
  auth = getAuth(app);
}

// Initialize Cloud Firestore with resilient multi-tab persistent cache and graceful fallbacks
const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  }, dbId);
} catch (err1) {
  console.warn('Firestore persistent cache init warning, falling back to memoryLocalCache:', err1);
  try {
    db = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    }, dbId);
  } catch (err2) {
    console.warn('Firestore memoryLocalCache warning, falling back to getFirestore:', err2);
    db = getFirestore(app, dbId);
  }
}

// Clean Google provider for Firebase Auth and Firestore Cloud Sync
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Dedicated provider with Drive and Sheets scopes for optional Google Sheets backup
const sheetsGoogleProvider = new GoogleAuthProvider();
sheetsGoogleProvider.addScope('https://www.googleapis.com/auth/drive.file');
sheetsGoogleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
sheetsGoogleProvider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = sessionStorage.getItem('luv_gtoken');
} catch (_) {}

const storeToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      sessionStorage.setItem('luv_gtoken', token);
    } else {
      sessionStorage.removeItem('luv_gtoken');
    }
  } catch (_) {}
};

/**
 * Detects if the current client environment is mobile Safari or an iframe context
 * where popups are aggressively blocked or restricted.
 */
const isMobileOrRestricted = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isIframe = window.self !== window.top;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  return isIframe || isMobile;
};

/**
 * Initializes authentication listener and immediately processes any redirect result
 * returning from mobile Safari's redirect flow.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  // Capture redirect sign-in result when returning from redirect flow in mobile Safari
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken || null;
        if (token) storeToken(token);
        if (onAuthSuccess) {
          onAuthSuccess(result.user, cachedAccessToken);
        }
      }
    })
    .catch((err) => {
      // Don't warn on routine page loads without a pending redirect
      if (err?.code !== 'auth/null-user') {
        console.warn('Firebase Auth getRedirectResult notice:', err);
      }
    });

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthSuccess) onAuthSuccess(user, null);
      }
    } else {
      storeToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Standard Google sign-in for Firebase & Firestore cloud synchronization.
 * Tries popup first; if blocked by mobile Safari or iframe restrictions, smoothly falls back to redirect.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      storeToken(credential?.accessToken || null);
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (popupErr: any) {
      const isBlocked =
        popupErr?.code === 'auth/popup-blocked' ||
        popupErr?.code === 'auth/cancelled-popup-request' ||
        popupErr?.code === 'auth/popup-closed-by-user' ||
        isMobileOrRestricted();

      if (isBlocked) {
        console.info('Popup sign-in blocked or restricted on mobile, redirecting via signInWithRedirect...');
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw popupErr;
    }
  } finally {
    isSigningIn = false;
  }
};

/**
 * Enhanced Google sign-in requested specifically for Google Sheets backup export.
 * Tries popup first; falls back to redirect on mobile Safari restrictions.
 */
export const googleSignInForSheets = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    try {
      const result = await signInWithPopup(auth, sheetsGoogleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      storeToken(credential?.accessToken || null);
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (popupErr: any) {
      const isBlocked =
        popupErr?.code === 'auth/popup-blocked' ||
        popupErr?.code === 'auth/cancelled-popup-request' ||
        popupErr?.code === 'auth/popup-closed-by-user' ||
        isMobileOrRestricted();

      if (isBlocked) {
        console.info('Sheets popup sign-in blocked on mobile, redirecting via signInWithRedirect...');
        await signInWithRedirect(auth, sheetsGoogleProvider);
        return null;
      }
      throw popupErr;
    }
  } finally {
    isSigningIn = false;
  }
};

export const signOut = async (authInstance?: Auth) => {
  storeToken(null);
  return firebaseSignOut(authInstance || auth);
};

export const googleSignInWithToken = googleSignIn;

export { app, db, auth, googleProvider, sheetsGoogleProvider, signInWithPopup, signInWithRedirect, getRedirectResult };
