import { useEffect, useState, useCallback } from 'react';
import { auth, db, signOut, initAuth, googleSignInWithToken, googleSignInForSheets } from '../firebase';
import { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { CloudSyncState, LogsState } from '../types';
import { getOrCreateBackupSpreadsheet, writeBackupToSheets } from '../utils/googleSheetsBackup';
import {
  normalizeLogs,
  filterLogsWithTombstones,
  sanitizeForFirestore,
  isValidFirestoreFieldKey,
} from '../utils/shiftSync';
import firebaseConfig from '../../firebase-applet-config.json';

// Re-export cleanLogsObject for backward compatibility
export function cleanLogsObject(rawLogs: any): LogsState {
  return normalizeLogs(rawLogs, false);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue?: T): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallbackValue);
      }
    }, ms);
    promise
      .then((val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallbackValue);
        }
      });
  });
}

function escapeFirestoreFieldPath(fieldName: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
    return fieldName;
  }
  return '`' + fieldName.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
}

// Helper to serialize sanitized JavaScript objects into Firestore REST API value formats
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.filter(v => v !== undefined).map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined && k !== '_origIdx' && isValidFirestoreFieldKey(k)) {
        fields[k.trim()] = toFirestoreValue(v);
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
      if (isValidFirestoreFieldKey(k)) {
        res[k] = fromFirestoreValue(v);
      }
    }
    return res;
  }
  return null;
}

export function extractFriendlySyncError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown cloud sync error');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {}
  return raw;
}

export async function directRestSync(user: User, data: any, isAuthoritative = true): Promise<boolean> {
  const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
  const apiKey = (firebaseConfig as any).apiKey;
  let url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(user.uid)}?key=${encodeURIComponent(apiKey)}`;

  const sanitizedPayload = sanitizeForFirestore(data) || {};
  if ('logs' in sanitizedPayload) {
    sanitizedPayload.logs = normalizeLogs(sanitizedPayload.logs, false);
  }

  // Strip any Firestore REST document metadata fields if ever present
  delete sanitizedPayload.name;
  delete sanitizedPayload.createTime;
  delete sanitizedPayload.updateTime;

  // When isAuthoritative is true, omit updateMask.fieldPaths so Firestore REST PATCH
  // completely replaces the entire users/{uid} document on the server, removing any deleted shifts or days.
  if (!isAuthoritative) {
    const topKeys = Object.keys(sanitizedPayload).filter(
      k => sanitizedPayload[k] !== undefined && isValidFirestoreFieldKey(k)
    );
    if (topKeys.length > 0) {
      const maskParams = topKeys
        .map(k => `updateMask.fieldPaths=${encodeURIComponent(escapeFirestoreFieldPath(k))}`)
        .join('&');
      url += `&${maskParams}`;
    }
  }

  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(sanitizedPayload)) {
    if (v !== undefined && isValidFirestoreFieldKey(k)) {
      fields[k.trim()] = toFirestoreValue(v);
    }
  }

  const executePatch = async (forceRefreshToken: boolean) => {
    const token = await user.getIdToken(forceRefreshToken);
    return fetch(url, {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
  };

  let resp = await executePatch(false);
  if (resp.status === 401 || resp.status === 403) {
    resp = await executePatch(true);
  }

  if (resp.ok) {
    return true;
  }

  const errData = await resp.json().catch(() => ({}));
  const serverMsg = errData?.error?.message || `HTTP ${resp.status}`;
  throw new Error(`Cloud Push failed (HTTP ${resp.status}): ${serverMsg}`);
}

export async function directRestPull(user: User): Promise<any> {
  const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
  const apiKey = (firebaseConfig as any).apiKey;
  // IMPORTANT: Never append unknown query params like `&_t=...` to Firestore REST v1 URLs,
  // because google.firestore.v1.GetDocumentRequest rejects unknown query params with HTTP 400.
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(user.uid)}?key=${encodeURIComponent(apiKey)}`;

  const executeGet = async (forceRefreshToken: boolean) => {
    const token = await user.getIdToken(forceRefreshToken);
    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  };

  let resp = await executeGet(false);
  if (resp.status === 401 || resp.status === 403) {
    resp = await executeGet(true);
  }

  if (resp.status === 404) {
    return { __notFound: true };
  }

  if (resp.ok) {
    const docData = await resp.json();
    const fields = docData.fields || {};
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (isValidFirestoreFieldKey(k)) {
        result[k] = fromFirestoreValue(v);
      }
    }
    if ('logs' in result) {
      result.logs = normalizeLogs(result.logs, false);
    }
    return result;
  }

  const errData = await resp.json().catch(() => ({}));
  const serverMsg = errData?.error?.message || `HTTP ${resp.status}`;
  throw new Error(`Cloud Pull failed (HTTP ${resp.status}): ${serverMsg}`);
}

export enum OperationType {
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
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isPermissionError =
    errMessage.toLowerCase().includes('permission') || errMessage.toLowerCase().includes('insufficient');
  const isOfflineError =
    errMessage.toLowerCase().includes('offline') ||
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
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  if (isPermissionError) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    window.dispatchEvent(new CustomEvent('firestore-permission-error', { detail: { message: errMessage } }));
    throw new Error(JSON.stringify(errInfo));
  } else if (isOfflineError) {
    console.warn('Firestore is Offline/Disconnected. Operating in local offline mode: ', errMessage);
    window.dispatchEvent(new CustomEvent('firestore-offline', { detail: { message: errMessage } }));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
}

export interface SyncResult {
  ok: boolean;
  confirmedLogs: LogsState;
  cloudDeletedIds: Record<string, number>;
}

export const useFirebaseSync = () => {
  const [user, setUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isInitializingAuth, setIsInitializingAuth] = useState(true);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setGoogleAccessToken(token);
        setIsInitializingAuth(false);
        setCloudSyncState(prev => (prev === 'error' ? 'error' : 'synced'));
      },
      () => {
        setUser(null);
        setGoogleAccessToken(null);
        setIsInitializingAuth(false);
        setCloudSyncState('idle');
        setCloudSyncError(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const reportSyncSuccess = useCallback(() => {
    setCloudSyncState('synced');
    setCloudSyncError(null);
  }, []);

  const reportSyncError = useCallback((err: unknown) => {
    const friendly = extractFriendlySyncError(err);
    setCloudSyncState('error');
    setCloudSyncError(friendly);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cloud-sync-error', { detail: { message: friendly } }));
    }
  }, []);

  const login = async () => {
    try {
      const res = await googleSignInWithToken();
      if (res) {
        setUser(res.user);
        setGoogleAccessToken(res.accessToken);
        setCloudSyncState('synced');
        setCloudSyncError(null);
      }
    } catch (e) {
      console.error('Login error:', e);
      throw e;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleAccessToken(null);
    setCloudSyncState('idle');
    setCloudSyncError(null);
  };

  const syncToFirebase = useCallback(
    async (
      data: any,
      isAuthoritative = true,
      removedLogDates: string[] = []
    ): Promise<SyncResult> => {
      const activeUser = auth.currentUser || user;
      if (!activeUser) {
        throw new Error('Please sign in with Google to push to cloud.');
      }
      const pathForWrite = `users/${activeUser.uid}`;
      setCloudSyncState('syncing');

      const sanitizedData = sanitizeForFirestore(data) || {};
      const incomingDeletedIds: Record<string, number> =
        sanitizedData.deletedShiftIds && typeof sanitizedData.deletedShiftIds === 'object'
          ? sanitizedData.deletedShiftIds
          : {};

      try {
        // 1. Read existing cloud document to merge any tombstones from other devices and compare days
        let cloudDoc: any = null;
        try {
          const pulled = await withTimeout(directRestPull(activeUser), 3000, null);
          if (pulled && !pulled.__notFound) {
            cloudDoc = pulled;
          }
        } catch (pullCheckErr) {
          console.warn('Pre-push cloud check note:', pullCheckErr);
        }

        const cloudDeletedIds: Record<string, number> = {
          ...(cloudDoc?.deletedShiftIds && typeof cloudDoc.deletedShiftIds === 'object'
            ? cloudDoc.deletedShiftIds
            : {}),
          ...incomingDeletedIds,
        };

        // 2. Filter local logs through combined tombstones so deleted shifts can NEVER be written back
        const filteredLocalLogs = filterLogsWithTombstones(
          sanitizedData.logs || {},
          {},
          cloudDeletedIds
        );

        const cloudLogs: Record<string, any> =
          cloudDoc && typeof cloudDoc === 'object' && cloudDoc.logs && typeof cloudDoc.logs === 'object'
            ? cloudDoc.logs
            : {};

        const allKnownCloudDates = new Set<string>([
          ...Object.keys(cloudLogs),
          ...removedLogDates.filter(isValidFirestoreFieldKey),
        ]);

        const exactLogsToSave: LogsState = {};
        for (const [dateKey, shifts] of Object.entries(filteredLocalLogs)) {
          if (isValidFirestoreFieldKey(dateKey) && Array.isArray(shifts) && shifts.length > 0) {
            exactLogsToSave[dateKey] = shifts.map(s => ({ ...s }));
          }
        }

        // Ensure every day that became empty locally is completely absent from exactLogsToSave
        for (const dateKey of allKnownCloudDates) {
          if (!exactLogsToSave[dateKey] || exactLogsToSave[dateKey].length === 0) {
            delete exactLogsToSave[dateKey];
          }
        }

        const baseCloudFields =
          cloudDoc && typeof cloudDoc === 'object' ? sanitizeForFirestore(cloudDoc) : {};
        delete baseCloudFields.name;
        delete baseCloudFields.createTime;
        delete baseCloudFields.updateTime;

        const finalPayload: Record<string, any> = sanitizeForFirestore({
          ...baseCloudFields,
          ...sanitizedData,
          logs: exactLogsToSave,
          deletedShiftIds: cloudDeletedIds,
        });

        // 3. Authoritative server write via Firestore REST v1 (replaces document cleanly so deleted shifts/days vanish immediately)
        let restError: unknown = null;
        let restSucceeded = false;
        try {
          restSucceeded = await directRestSync(activeUser, finalPayload, isAuthoritative);
        } catch (err) {
          restError = err;
        }

        // 4. Keep in-memory Firestore SDK document aligned as well
        const docRef = doc(db, 'users', activeUser.uid);
        let sdkSucceeded = false;
        const sdkResult = await withTimeout(
          (async () => {
            await setDoc(docRef, finalPayload);
            return true;
          })(),
          2500,
          false
        );
        sdkSucceeded = !!sdkResult;

        if (!restSucceeded && !sdkSucceeded) {
          throw restError || new Error('Failed to write schedule changes to Firestore.');
        }

        // If REST failed with an explicit HTTP 4xx error (e.g., 400 or 403), surface it rather than masking it!
        if (!restSucceeded && restError) {
          const msg = extractFriendlySyncError(restError);
          if (msg.includes('HTTP 4')) {
            throw restError;
          }
        }

        reportSyncSuccess();
        return {
          ok: true,
          confirmedLogs: exactLogsToSave,
          cloudDeletedIds,
        };
      } catch (e: any) {
        reportSyncError(e);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
          handleFirestoreError(e, OperationType.WRITE, pathForWrite);
        }
        throw e;
      }
    },
    [user, reportSyncSuccess, reportSyncError]
  );

  const syncToGoogleSheets = async (data: any) => {
    let token = googleAccessToken;

    const executeBackup = async (tok: string) => {
      const spreadsheetId = await getOrCreateBackupSpreadsheet(tok);
      await writeBackupToSheets(tok, spreadsheetId, data);
    };

    if (!token) {
      try {
        const res = await googleSignInForSheets();
        if (res?.accessToken) {
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

    try {
      await executeBackup(token);
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('401') || errMsg.includes('UNAUTHORIZED')) {
        console.warn('Google Sheets token expired (401). Refreshing token...');
        setGoogleAccessToken(null);
        try {
          sessionStorage.removeItem('luv_gtoken');
        } catch (_) {}

        const freshRes = await googleSignInForSheets();
        if (freshRes?.accessToken) {
          setGoogleAccessToken(freshRes.accessToken);
          if (freshRes.user) setUser(freshRes.user);
          await executeBackup(freshRes.accessToken);
          return;
        }
        throw new Error('Google session expired (401). Please click "Google Sheets" again to re-authenticate.');
      }
      throw err;
    }
  };

  return {
    user,
    googleAccessToken,
    isInitializingAuth,
    cloudSyncState,
    cloudSyncError,
    setCloudSyncState,
    reportSyncSuccess,
    reportSyncError,
    login,
    logout,
    syncToFirebase,
    syncToGoogleSheets,
    db,
    handleFirestoreError,
    OperationType,
  };
};
