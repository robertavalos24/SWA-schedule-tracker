import { useEffect, useState, useCallback, useRef } from 'react';
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
  capCloudDeletedIds,
  MAX_CONFIRMED_TOMBSTONES,
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

function withRejectTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(timeoutMessage));
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
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
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

/**
 * Builds a Firestore REST v1 document URL for `users/{uid}` guaranteeing that NO query parameters
 * ever exist beyond `key` and (when non-authoritative) `updateMask.fieldPaths`.
 */
export function buildFirestoreUserDocUrl(uid: string, maskFieldPaths?: string[]): string {
  const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
  const apiKey = String((firebaseConfig as any).apiKey || '');
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}`;

  const params: string[] = [`key=${encodeURIComponent(apiKey)}`];
  if (Array.isArray(maskFieldPaths) && maskFieldPaths.length > 0) {
    for (const field of maskFieldPaths) {
      if (isValidFirestoreFieldKey(field)) {
        params.push(`updateMask.fieldPaths=${encodeURIComponent(escapeFirestoreFieldPath(field.trim()))}`);
      }
    }
  }

  return `${baseUrl}?${params.join('&')}`;
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
// Optionally notifies `onInvalidKey` if any empty "" or `__reserved__` key was present in the cloud copy
export function fromFirestoreValue(valObj: any, onInvalidKey?: (badKey: string) => void): any {
  if (!valObj) return null;
  if ('nullValue' in valObj) return null;
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return valObj.doubleValue;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('arrayValue' in valObj) {
    return (valObj.arrayValue?.values || []).map((item: any) => fromFirestoreValue(item, onInvalidKey));
  }
  if ('mapValue' in valObj) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(valObj.mapValue?.fields || {})) {
      if (isValidFirestoreFieldKey(k)) {
        res[k.trim()] = fromFirestoreValue(v, onInvalidKey);
      } else if (onInvalidKey) {
        onInvalidKey(k);
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
  let maskFields: string[] | undefined = undefined;
  if (!isAuthoritative) {
    const topKeys = Object.keys(sanitizedPayload).filter(
      k => sanitizedPayload[k] !== undefined && isValidFirestoreFieldKey(k)
    );
    if (topKeys.length > 0) {
      maskFields = topKeys;
    }
  }

  const url = buildFirestoreUserDocUrl(user.uid, maskFields);

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

  const rawBody = await resp.text().catch(() => '');
  let errData: any = null;
  try {
    errData = rawBody ? JSON.parse(rawBody) : null;
  } catch {}
  const serverMsg = errData?.error?.message || rawBody || `HTTP ${resp.status}`;

  if (resp.status === 400) {
    console.error(`[Firestore REST Push HTTP 400] Full server error.message: ${serverMsg}`, errData || rawBody);
  }

  throw new Error(`Cloud Push failed (HTTP ${resp.status}): ${serverMsg}`);
}

export async function directRestPull(user: User): Promise<any> {
  // Strictly uses ONLY ?key=... with zero extra query parameters
  const url = buildFirestoreUserDocUrl(user.uid);

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
    let hadInvalidCloudKeys = false;

    for (const [k, v] of Object.entries(fields)) {
      if (isValidFirestoreFieldKey(k)) {
        result[k.trim()] = fromFirestoreValue(v, () => {
          hadInvalidCloudKeys = true;
        });
      } else {
        hadInvalidCloudKeys = true;
      }
    }
    if ('logs' in result) {
      result.logs = normalizeLogs(result.logs, false);
    }
    Object.defineProperty(result, '_hadInvalidCloudKeys', {
      value: hadInvalidCloudKeys,
      enumerable: false,
      configurable: true,
    });
    return result;
  }

  const rawBody = await resp.text().catch(() => '');
  let errData: any = null;
  try {
    errData = rawBody ? JSON.parse(rawBody) : null;
  } catch {}
  const serverMsg = errData?.error?.message || rawBody || `HTTP ${resp.status}`;

  if (resp.status === 400) {
    console.error(`[Firestore REST Pull HTTP 400] Full server error.message: ${serverMsg}`, errData || rawBody);
  }

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
  freshCloudLogs: LogsState | null;
  cloudDeletedIds: Record<string, number>;
}

export const useFirebaseSync = () => {
  const [user, setUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isInitializingAuth, setIsInitializingAuth] = useState(true);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const lastAuthUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        const uidChanged = lastAuthUidRef.current !== currentUser.uid;
        lastAuthUidRef.current = currentUser.uid;
        setUser(currentUser);
        setGoogleAccessToken(token);
        setIsInitializingAuth(false);
        // Stay 'idle' on sign-in until pullFromCloud or syncToFirebase actually succeeds
        if (uidChanged) {
          setCloudSyncState('idle');
          setCloudSyncError(null);
        }
      },
      () => {
        lastAuthUidRef.current = null;
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
        lastAuthUidRef.current = res.user.uid;
        setUser(res.user);
        setGoogleAccessToken(res.accessToken);
        // Stay 'idle' on sign-in until the first real cloud Pull or Push succeeds
        setCloudSyncState('idle');
        setCloudSyncError(null);
      }
    } catch (e) {
      console.error('Login error:', e);
      throw e;
    }
  };

  const logout = async () => {
    lastAuthUidRef.current = null;
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
        // 1. Mandatory pre-push read: NEVER send a full-document write unless the current cloud copy
        // was read successfully (or confirmed 404 __notFound), so deletedShiftIds and other cloud fields are never wiped.
        const pulled = await withRejectTimeout(
          directRestPull(activeUser),
          8000,
          'Cloud pre-push read timed out. Changes stay saved locally and will retry.'
        );

        if (!pulled || typeof pulled !== 'object') {
          throw new Error('Could not read current cloud document before pushing. Changes stay queued locally.');
        }

        const cloudDoc = pulled.__notFound ? {} : pulled;

        // Cap deletedShiftIds stored in the cloud at the newest 400 so the document cannot keep growing
        const cloudDeletedIds: Record<string, number> = capCloudDeletedIds(
          {
            ...(cloudDoc?.deletedShiftIds && typeof cloudDoc.deletedShiftIds === 'object'
              ? cloudDoc.deletedShiftIds
              : {}),
            ...incomingDeletedIds,
          },
          MAX_CONFIRMED_TOMBSTONES
        );

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

        // 3. Authoritative server write via Firestore REST v1 (throws on HTTP 4xx/5xx or network error)
        await directRestSync(activeUser, finalPayload, isAuthoritative);

        // 4. Best-effort sync of in-memory Firestore SDK cache so local listeners remain aligned
        const docRef = doc(db, 'users', activeUser.uid);
        await withTimeout(setDoc(docRef, finalPayload), 2000, undefined);

        // 5. Perform a fresh read of the cloud copy to confirm tombstoned shifts are actually gone in Firestore
        let freshCloudLogs: LogsState | null = null;
        try {
          const freshRead = await withRejectTimeout(
            directRestPull(activeUser),
            6000,
            'Post-push cloud verification read timed out'
          );
          if (freshRead && !freshRead.__notFound) {
            freshCloudLogs = normalizeLogs(freshRead.logs, false);
          } else if (freshRead?.__notFound) {
            freshCloudLogs = {};
          }
        } catch (verifyErr) {
          console.warn('Post-push verification read skipped (tombstones will confirm on next read):', verifyErr);
        }

        reportSyncSuccess();
        return {
          ok: true,
          freshCloudLogs,
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
