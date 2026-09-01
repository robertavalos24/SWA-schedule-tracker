import { useEffect, useState } from 'react';
import { auth, db, googleProvider, signInWithPopup, signOut, initAuth, googleSignInWithToken } from '../firebase';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { LogsState, MidCountsState, FmlaCase, Settings, CardPrefs } from '../types';
import { getOrCreateBackupSpreadsheet, writeBackupToSheets } from '../utils/googleSheetsBackup';

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
    console.error('Firestore Permission Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
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

  const syncToFirebase = async (data: any) => {
    if (!user) return;
    const pathForWrite = `users/${user.uid}`;
    try {
      await setDoc(doc(db, 'users', user.uid), data, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, pathForWrite);
      throw e;
    }
  };

  const syncToGoogleSheets = async (data: any) => {
    let token = googleAccessToken;
    if (!token) {
      // If no token in memory, force login again
      try {
        const res = await googleSignInWithToken();
        if (res) token = res.accessToken;
      } catch (e) {
        console.error(e);
      }
      
      if (!token) {
        throw new Error('No Google Access Token available. Please log in again.');
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
