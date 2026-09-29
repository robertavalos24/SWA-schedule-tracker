import { useEffect, useState, useCallback } from 'react';
import { auth, db, googleProvider, signInWithPopup, signOut, initAuth, googleSignInWithToken, googleSignInForSheets } from '../firebase';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { LogsState, MidCountsState, FmlaCase, Settings, CardPrefs } from '../types';
import { getOrCreateBackupSpreadsheet, writeBackupToSheets } from '../utils/googleSheetsBackup';
import firebaseConfig from '../../firebase-applet-config.json';

// Helper to serialize JavaScript objects into Firestore REST API value formats
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Helper to deserialize Firestore REST API values back to JavaScript objects
export function fromFirestoreValue(valObj: any): any {
  if (!valObj) return null;
  if ('nullValue' in valObj) return null;
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return valObj.doubleValue;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('arrayValue' in valObj) {
    return (valObj.arrayValue?.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in valObj) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(valObj.mapValue?.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

export async function directRestSync(user: User, data: any): Promise<boolean> {
  try {
    const token = await user.getIdToken(true);
    const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/users/${user.uid}`;
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });
    if (resp.ok) {
      console.log('[Firestore Direct Sync] Cloud REST write succeeded.');
      return true;
    }
    const errData = await resp.json().catch(() => ({}));
    console.warn('[Firestore Direct Sync] Cloud REST write response:', resp.status, errData);
    return false;
  } catch (err) {
    console.warn('[Firestore Direct Sync] Cloud REST write error:', err);
    return false;
  }
}

export async function directRestPull(user: User): Promise<any | null> {
  try {
    const token = await user.getIdToken(true);
    const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    
    // Potential URLs to search in order: custom DB by UID, custom DB by email, default DB by UID, default DB by email
    const candidateUrls: string[] = [
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/users/${user.uid}`
    ];
    if (user.email) {
      candidateUrls.push(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/users/${encodeURIComponent(user.email)}`);
    }
    if (databaseId !== '(default)') {
      candidateUrls.push(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${user.uid}`);
      if (user.email) {
        candidateUrls.push(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${encodeURIComponent(user.email)}`);
      }
    }

    for (const url of candidateUrls) {
      try {
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) {
          const docData = await resp.json();
          const fields = docData.fields || {};
          const result: Record<string, any> = {};
          for (const [k, v] of Object.entries(fields)) {
            result[k] = fromFirestoreValue(v);
          }
          if (Object.keys(result).length > 0) {
            console.log('[Firestore Direct Pull] Found existing data at:', url);
            // If pulled from a legacy fallback location, migrate to primary custom DB
            if (url !== candidateUrls[0]) {
              console.log('[Firestore Direct Pull] Auto-migrating data to primary custom database.');
              await directRestSync(user, result);
            }
            return result;
          }
        }
      } catch (e) {
        console.warn('[Firestore Direct Pull] Candidate check error:', url, e);
      }
    }
    return null;
  } catch (err) {
    console.warn('[Firestore Direct Pull] Cloud REST pull error:', err);
    return null;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isPermissionError = errMessage.toLowerCase().includes('permission') || errMessage.toLowerCase().includes('insufficient');
  const isOfflineError = errMessage.toLowerCase().includes('offline') || 
                         errMessage.toLowerCase().includes('network') || 
                         errMessage.toLowerCase().includes('unavailable') ||
                         (error as any)?.code === 'unavailable';

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isPermissionError) {
    console.warn('Firestore Permission Warning: ', JSON.stringify(errInfo));
    // Dispatch permission error event so components can show a friendly banner or toast
    const event = new CustomEvent('firestore-permission-error', { detail: { message: errMessage } });
    window.dispatchEvent(event);
  } else if (isOfflineError) {
    console.warn('Firestore is Offline/Disconnected. Operating in local offline mode: ', errMessage);
    // Dispatch offline event so components can show a friendly banner or toast
    const event = new CustomEvent('firestore-offline', { detail: { message: errMessage } });
    window.dispatchEvent(event);
  } else {
    console.warn('Firestore Non-Fatal Warning: ', JSON.stringify(errInfo));
  }
}

export const useFirebaseSync = () => {
  const [user, setUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isInitializingAuth, setIsInitializingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setGoogleAccessToken(token);
        setIsInitializingAuth(false);
      },
      () => {
        setUser(null);
        setGoogleAccessToken(null);
        setIsInitializingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const res = await googleSignInWithToken();
      if (res) {
        setUser(res.user);
        setGoogleAccessToken(res.accessToken);
      }
    } catch (e) {
      console.error('Login error:', e);
      throw e;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleAccessToken(null);
  };

  const syncToFirebase = useCallback(async (data: any): Promise<boolean> => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) {
      throw new Error('Please sign in with Google to push to cloud.');
    }
    const pathForWrite = `users/${activeUser.uid}`;
    try {
      // Ensure the authentication token is fresh and attached to Firestore requests
      try {
        await activeUser.getIdToken(false);
      } catch (tokenErr) {
        console.warn('Pre-sync token check notice:', tokenErr);
      }

      // Remove any undefined values which Firestore rejects
      const sanitizedData = JSON.parse(JSON.stringify(data));
      await setDoc(doc(db, 'users', activeUser.uid), sanitizedData, { merge: true });
      return true;
    } catch (e: any) {
      console.warn('Firestore SDK sync error, attempting direct Cloud REST fallback...', e);

      // Attempt token force-refresh with direct Cloud REST fallback
      try {
        const sanitizedData = JSON.parse(JSON.stringify(data));
        const restOk = await directRestSync(activeUser, sanitizedData);
        if (restOk) {
          return true;
        }
      } catch (restErr) {
        console.warn('Direct REST fallback error:', restErr);
      }

      // If both SDK and REST encounters issues, report clean error
      handleFirestoreError(e, OperationType.WRITE, pathForWrite);
      console.warn('Failed to sync to firebase:', e);
      throw e;
    }
  }, [user]);

  const syncToGoogleSheets = async (data: any) => {
    let token = googleAccessToken;
    if (!token) {
      // If no token in memory, request Sheets permission via dedicated provider
      try {
        const res = await googleSignInForSheets();
        if (res) {
          token = res.accessToken;
          setGoogleAccessToken(res.accessToken);
          if (res.user) setUser(res.user);
        }
      } catch (e) {
        console.error(e);
      }
      
      if (!token) {
        throw new Error('Google Sheets permission required. Please grant access to save backup.');
      }
    }
    const spreadsheetId = await getOrCreateBackupSpreadsheet(token);
    await writeBackupToSheets(token, spreadsheetId, data);
  };

  return { 
    user, 
    googleAccessToken,
    isInitializingAuth, 
    login, 
    logout, 
    syncToFirebase, 
    syncToGoogleSheets,
    db, 
    handleFirestoreError, 
    OperationType 
  };
};
