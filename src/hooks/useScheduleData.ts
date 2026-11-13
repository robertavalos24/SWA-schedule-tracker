import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings,
  CardPrefs,
  FmlaCase,
  LogsState,
  MidCountsState,
  ThemeType,
  TombstoneMap,
  DeletedKeyMap,
} from '../types';
import { autoAssignWorkedHolidays } from '../utils/calculations';
import {
  useFirebaseSync,
  directRestPull,
  cleanLogsObject,
  extractFriendlySyncError,
} from './useFirebaseSync';
import {
  normalizeLogs,
  hasEntriesMissingIds,
  filterLogsWithTombstones,
  logsContainDeletedShift,
  recordDeletedShifts,
  collectShiftIdsAndKeys,
  collectNewlyAddedIdsAndKeys,
  removeItemsFromDeleteLists,
  mergeCloudTombstones,
  mergeCloudDeletedKeys,
  confirmAndPruneTombstones,
  pruneDeletedShiftKeys,
  buildCloudDeletedIdsMap,
  buildCloudDeletedKeysMap,
  hasInvalidFirestoreKeys,
  sanitizeForFirestore,
} from '../utils/shiftSync';
import { doc, onSnapshot, getDocFromServer } from 'firebase/firestore';
import { auth } from '../firebase';
import { useToast } from '../contexts/ToastContext';

const themes: ThemeType[] = ['light', 'dark', 'ocean', 'sunset', 'forest'];

// Clean default template: no personal salary, raises, or logs hardcoded
const defaultSettings: Settings = {
  hireDate: '',
  asOfDate: '',
  startPto: '0',
  correctionDate: '',
  correctionStartPto: '0',
  accrualChangeDate: '',
  customAccrualRate: '',
  customAccrualCap: '',
  salary: '',
  pctIncrease: '3.0',
  attOverride: 'auto',
  empLevel: 'P1',
  stiBonusPct: '4',
  stiCompanyPct: '125',
  stiPersonalPct: '100',
  stiBonus: '0',
  promoDate: '',
  promoSalary: '',
  promoLevel: '',
  adjDate: '',
  adjValue: '',
  perfLetters: '[]',
  k401Pct: '0',
  insuranceDed: '0',
  monthlyDeductions: '{}',
  baseYear: new Date().getFullYear().toString(),
  enableTaxes: 'false',
  taxFilingStatus: 'single',
  taxDependents: '0',
  fedTaxExempt: 'false',
  payHistory: []
};

const defaultCardPrefs: CardPrefs = {
  timeoff: true,
  att: true,
  mid: true,
  pay: true,
  cardOrder: ['timeoff', 'att', 'mid', 'pay']
};

// Scoped key generator to isolate authenticated user data from guest sessions
export const getScopedKey = (baseKey: string, uid?: string | null): string => {
  return uid ? `swa_u_${uid}_${baseKey}` : `swa_guest_${baseKey}`;
};

// One-time cleanup of legacy un-scoped storage keys that leaked data across browser sessions
if (typeof window !== 'undefined') {
  try {
    const legacyKeys = [
      'swa_salary',
      'swa_payHistory',
      'swa_logs_main',
      'swa_midCounts_main',
      'swa_fmlaCases',
      'swa_hireDate',
      'swa_asOfDate',
      'swa_startPto',
      'swa_correctionDate',
      'swa_correctionStartPto',
      'swa_initialSalary',
      'swa_initialYear'
    ];
    legacyKeys.forEach(k => localStorage.removeItem(k));
  } catch {
    // Ignore storage access restrictions in certain sandboxes
  }
}

export interface UpdateLogsOptions {
  isRestore?: boolean;
  reAddedKeys?: string[];
}

export const useScheduleData = () => {
  const {
    user,
    googleAccessToken,
    isInitializingAuth,
    cloudSyncState,
    cloudSyncError,
    setCloudSyncState,
    reportSyncSuccess,
    reportSyncError,
    login,
    logout: firebaseLogout,
    syncToFirebase,
    syncToGoogleSheets,
    db,
    handleFirestoreError,
    OperationType
  } = useFirebaseSync();

  const { showToast } = useToast();

  const [logs, setLogs] = useState<LogsState>({});
  const [logsHistory, setLogsHistory] = useState<LogsState[]>([]);
  const [midCounts, setMidCounts] = useState<MidCountsState>({});
  const [fmlaCases, setFmlaCases] = useState<FmlaCase[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [cardPrefs, setCardPrefs] = useState<CardPrefs>(defaultCardPrefs);
  const [theme, setTheme] = useState<ThemeType>('light');
  const [isLocked, setIsLocked] = useState(false);
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);

  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [isYearView, setIsYearView] = useState(false);
  const [direction, setDirection] = useState(0);

  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const savedTimeoutRef = useRef<any>(null);
  const isLocalMutationRef = useRef<number>(0);
  const syncVersionRef = useRef<number>(0);
  const inFlightSyncCountRef = useRef<number>(0);
  const knownCloudDatesRef = useRef<Set<string>>(new Set());
  const tombstonesRef = useRef<TombstoneMap>({});
  const deletedKeysRef = useRef<DeletedKeyMap>({});
  const pendingRestoredIdsRef = useRef<Set<string>>(new Set());
  const needsOneTimeLegacyIdSyncRef = useRef<boolean>(false);

  const latestStateRef = useRef({
    logs,
    midCounts,
    fmlaCases,
    cardPrefs,
    settings,
    lockedMonths
  });

  useEffect(() => {
    latestStateRef.current = {
      logs,
      midCounts,
      fmlaCases,
      cardPrefs,
      settings,
      lockedMonths
    };
    Object.keys(logs || {}).forEach(d => knownCloudDatesRef.current.add(d));
  }, [logs, midCounts, fmlaCases, cardPrefs, settings, lockedMonths]);

  const triggerSavedIndicator = useCallback(() => {
    setShowSavedIndicator(true);
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
    }
    savedTimeoutRef.current = setTimeout(() => {
      setShowSavedIndicator(false);
    }, 1500);
  }, []);

  // Save helper scoped by the current user UID
  const saveToStorage = useCallback((key: string, data: any) => {
    try {
      const activeUid = auth.currentUser?.uid || user?.uid;
      const storageKey = getScopedKey(key, activeUid);
      localStorage.setItem(storageKey, typeof data === 'object' ? JSON.stringify(data) : String(data));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [user]);

  const hasPendingLocalSync = useCallback((uid?: string | null): boolean => {
    try {
      const activeUid = uid ?? auth.currentUser?.uid ?? user?.uid;
      return localStorage.getItem(getScopedKey('pendingSync', activeUid)) === 'true';
    } catch {
      return false;
    }
  }, [user]);

  const hasCompletedLegacyIdMigration = useCallback((uid?: string | null): boolean => {
    try {
      const activeUid = uid ?? auth.currentUser?.uid ?? user?.uid;
      if (!activeUid) return true;
      return localStorage.getItem(getScopedKey('legacyIdsMigratedV3', activeUid)) === 'true';
    } catch {
      return false;
    }
  }, [user]);

  const markLegacyIdMigrationComplete = useCallback((uid?: string | null) => {
    try {
      const activeUid = uid ?? auth.currentUser?.uid ?? user?.uid;
      if (activeUid) {
        localStorage.setItem(getScopedKey('legacyIdsMigratedV3', activeUid), 'true');
      }
      needsOneTimeLegacyIdSyncRef.current = false;
    } catch {}
  }, [user]);

  const runBackgroundSync = useCallback(
    async (
      payload: any,
      removedDates: string[],
      version: number,
      showSavedOnSuccess = true,
      restoredShiftIds: string[] = [],
      notifyShiftToast = false
    ): Promise<boolean> => {
      inFlightSyncCountRef.current += 1;
      const effectiveRestored = Array.from(
        new Set<string>([
          ...restoredShiftIds,
          ...Array.from(pendingRestoredIdsRef.current),
        ])
      );

      try {
        const safeLogs = filterLogsWithTombstones(
          payload.logs || {},
          tombstonesRef.current,
          null,
          deletedKeysRef.current,
          null
        );
        const enrichedPayload = {
          ...payload,
          logs: safeLogs,
          deletedShiftIds: buildCloudDeletedIdsMap(tombstonesRef.current),
          deletedShiftKeys: buildCloudDeletedKeysMap(deletedKeysRef.current, tombstonesRef.current),
        };

        const res = await syncToFirebase(
          enrichedPayload,
          true,
          removedDates,
          effectiveRestored,
          notifyShiftToast
        );

        if (res.ok) {
          // Do NOT merge restoredShiftIds back in through mergeCloudTombstones / mergeCloudDeletedKeys
          const mergedTombstones = mergeCloudTombstones(
            tombstonesRef.current,
            res.cloudDeletedIds,
            effectiveRestored
          );
          const prunedTombstones = confirmAndPruneTombstones(mergedTombstones, res.freshCloudLogs);
          tombstonesRef.current = prunedTombstones;
          saveToStorage('deletedShifts', prunedTombstones);

          const mergedDeletedKeys = mergeCloudDeletedKeys(
            deletedKeysRef.current,
            res.cloudDeletedKeys,
            effectiveRestored
          );
          const prunedDeletedKeys = pruneDeletedShiftKeys(mergedDeletedKeys, res.freshCloudLogs);
          deletedKeysRef.current = prunedDeletedKeys;
          saveToStorage('deletedShiftKeys', prunedDeletedKeys);

          // Clear synced restored IDs now that Firestore removed them
          for (const rk of effectiveRestored) {
            pendingRestoredIdsRef.current.delete(rk);
          }
          saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current));

          if (syncVersionRef.current === version) {
            knownCloudDatesRef.current = new Set(Object.keys(res.freshCloudLogs || safeLogs || {}));
            saveToStorage('pendingSync', 'false');
          }
          if (showSavedOnSuccess) {
            triggerSavedIndicator();
          }
          if (notifyShiftToast) {
            showToast('Changes Saved', 'success');
          }
          return true;
        }
        setShowSavedIndicator(false);
        if (notifyShiftToast) {
          showToast('Sync failed: Unable to save changes to cloud.', 'error');
        }
        return false;
      } catch (err) {
        setShowSavedIndicator(false);
        console.warn('Background cloud sync failed (queued locally):', err);
        if (notifyShiftToast) {
          showToast(`Sync failed: ${extractFriendlySyncError(err)}`, 'error');
        }
        return false;
      } finally {
        inFlightSyncCountRef.current = Math.max(0, inFlightSyncCountRef.current - 1);
      }
    },
    [syncToFirebase, saveToStorage, triggerSavedIndicator, showToast]
  );

  // Load helper for a specific user ID or guest
  const loadScopedData = useCallback((uid: string | null) => {
    // 0. Load Deleted Shift Tombstones (IDs & Content Keys) and Pending Restored IDs FIRST
    let loadedTombstones: TombstoneMap = {};
    try {
      const storedTombstones = localStorage.getItem(getScopedKey('deletedShifts', uid));
      if (storedTombstones && storedTombstones !== 'undefined' && storedTombstones !== 'null') {
        const parsed = JSON.parse(storedTombstones);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          loadedTombstones = parsed;
        }
      }
    } catch {
      loadedTombstones = {};
    }
    tombstonesRef.current = loadedTombstones;

    let loadedDeletedKeys: DeletedKeyMap = {};
    try {
      const storedDeletedKeys = localStorage.getItem(getScopedKey('deletedShiftKeys', uid));
      if (storedDeletedKeys && storedDeletedKeys !== 'undefined' && storedDeletedKeys !== 'null') {
        const parsed = JSON.parse(storedDeletedKeys);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          loadedDeletedKeys = pruneDeletedShiftKeys(parsed, null);
        }
      }
    } catch {
      loadedDeletedKeys = {};
    }
    deletedKeysRef.current = loadedDeletedKeys;

    const loadedRestored = new Set<string>();
    try {
      const storedRestored = localStorage.getItem(getScopedKey('pendingRestoredIds', uid));
      if (storedRestored && storedRestored !== 'undefined' && storedRestored !== 'null') {
        const parsed = JSON.parse(storedRestored);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (typeof item === 'string' && item.trim()) loadedRestored.add(item.trim());
          });
        }
      }
    } catch {}
    pendingRestoredIdsRef.current = loadedRestored;

    // 1. Logs (filtered against BOTH ID tombstones and content-key tombstones)
    let loadedLogs: LogsState = {};
    try {
      const storedLogs = localStorage.getItem(getScopedKey('logs', uid));
      if (storedLogs && storedLogs !== 'undefined' && storedLogs !== 'null') {
        const parsedLogs = JSON.parse(storedLogs);
        if (uid && !hasCompletedLegacyIdMigration(uid) && hasEntriesMissingIds(parsedLogs)) {
          needsOneTimeLegacyIdSyncRef.current = true;
        }
        const filtered = filterLogsWithTombstones(
          parsedLogs,
          loadedTombstones,
          null,
          loadedDeletedKeys,
          null
        );
        loadedLogs = normalizeLogs(autoAssignWorkedHolidays(filtered), false);
        setLogs(loadedLogs);
        Object.keys(loadedLogs).forEach(d => knownCloudDatesRef.current.add(d));
        // Persist stable IDs back to localStorage so later loads never mint new IDs
        localStorage.setItem(getScopedKey('logs', uid), JSON.stringify(loadedLogs));
      } else {
        setLogs({});
      }
    } catch {
      setLogs({});
    }

    // 2. MidCounts
    let loadedMids: MidCountsState = {};
    try {
      const storedMids = localStorage.getItem(getScopedKey('mids', uid));
      if (storedMids && storedMids !== 'undefined' && storedMids !== 'null') {
        loadedMids = JSON.parse(storedMids);
        setMidCounts(loadedMids);
      } else {
        setMidCounts({});
      }
    } catch {
      setMidCounts({});
    }

    // 3. CardPrefs
    let loadedPrefs: CardPrefs = defaultCardPrefs;
    try {
      const storedPrefs = localStorage.getItem(getScopedKey('cardPrefs', uid));
      if (storedPrefs && storedPrefs !== 'undefined' && storedPrefs !== 'null') {
        loadedPrefs = JSON.parse(storedPrefs);
        setCardPrefs(loadedPrefs);
      } else {
        setCardPrefs(defaultCardPrefs);
      }
    } catch {
      setCardPrefs(defaultCardPrefs);
    }

    // 4. FmlaCases
    let loadedFmla: FmlaCase[] = [];
    try {
      const storedFmla = localStorage.getItem(getScopedKey('fmla', uid));
      if (storedFmla && storedFmla !== 'undefined' && storedFmla !== 'null') {
        loadedFmla = JSON.parse(storedFmla);
        setFmlaCases(loadedFmla);
      } else {
        setFmlaCases([]);
      }
    } catch {
      setFmlaCases([]);
    }

    // 5. LockedMonths
    let loadedLocked: string[] = [];
    try {
      const storedLockedMonths = localStorage.getItem(getScopedKey('lockedMonths', uid));
      if (storedLockedMonths && storedLockedMonths !== 'undefined' && storedLockedMonths !== 'null') {
        loadedLocked = JSON.parse(storedLockedMonths);
        setLockedMonths(loadedLocked);
      } else {
        setLockedMonths([]);
      }
    } catch {
      setLockedMonths([]);
    }

    // 6. Settings
    const loadedSettings = { ...defaultSettings };
    try {
      const storedSettings = localStorage.getItem(getScopedKey('settings', uid));
      if (storedSettings && storedSettings !== 'undefined' && storedSettings !== 'null') {
        Object.assign(loadedSettings, JSON.parse(storedSettings));
      }
    } catch {}
    setSettings(loadedSettings);

    latestStateRef.current = {
      logs: loadedLogs,
      midCounts: loadedMids,
      fmlaCases: loadedFmla,
      cardPrefs: loadedPrefs,
      settings: loadedSettings,
      lockedMonths: loadedLocked
    };
  }, [hasCompletedLegacyIdMigration]);

  // Sync state lifecycle across authentication state changes
  const currentUserUid = user?.uid || null;
  const prevUserUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Initial mount
    if (prevUserUid.current === undefined) {
      prevUserUid.current = currentUserUid;
      loadScopedData(currentUserUid);
      return;
    }

    // Auth state transition
    if (prevUserUid.current !== currentUserUid) {
      prevUserUid.current = currentUserUid;
      knownCloudDatesRef.current.clear();
      syncVersionRef.current = 0;
      needsOneTimeLegacyIdSyncRef.current = false;
      if (currentUserUid) {
        loadScopedData(currentUserUid);
      } else {
        tombstonesRef.current = {};
        deletedKeysRef.current = {};
        pendingRestoredIdsRef.current.clear();
        setLogs({});
        setLogsHistory([]);
        setMidCounts({});
        setFmlaCases([]);
        setSettings({ ...defaultSettings });
        setLockedMonths([]);
        setCardPrefs(defaultCardPrefs);
      }
    }
  }, [currentUserUid, loadScopedData]);

  // Load theme and global lock status
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('swa_theme') as ThemeType;
      if (storedTheme && themes.includes(storedTheme)) setTheme(storedTheme);

      const storedLocked = localStorage.getItem('swa_isLocked');
      if (storedLocked === 'true') setIsLocked(true);
    } catch {}
  }, []);

  // Fetch real-time data from Firestore when user is present
  useEffect(() => {
    if (!user) return;

    let isSubscribed = true;
    let unsubscribe: (() => void) | null = null;

    const unconfirmedCount = Object.values(tombstonesRef.current).filter(t => !t.cloudConfirmed).length;
    const shouldPushOneTimeIds = needsOneTimeLegacyIdSyncRef.current && !hasCompletedLegacyIdMigration(user.uid);

    // Push pending local mutations, unconfirmed tombstones, or one-time migrated legacy IDs
    if (hasPendingLocalSync(user.uid) || unconfirmedCount > 0 || shouldPushOneTimeIds) {
      if (shouldPushOneTimeIds) {
        markLegacyIdMigrationComplete(user.uid);
      }
      const v = ++syncVersionRef.current;
      const filteredLocal = normalizeLogs(
        autoAssignWorkedHolidays(
          filterLogsWithTombstones(
            latestStateRef.current.logs,
            tombstonesRef.current,
            null,
            deletedKeysRef.current,
            null
          )
        ),
        false
      );
      const removed = Array.from(knownCloudDatesRef.current).filter(d => !(d in filteredLocal));
      runBackgroundSync(
        {
          ...latestStateRef.current,
          logs: filteredLocal
        },
        removed,
        v,
        false,
        Array.from(pendingRestoredIdsRef.current),
        false
      );
    }

    const handleDocSnapshot = (docSnap: any) => {
      if (docSnap.metadata?.hasPendingWrites || docSnap.metadata?.fromCache) {
        return;
      }

      if (!docSnap.exists()) {
        return;
      }

      const data = docSnap.data();
      const hasExistingLocalLogs = localStorage.getItem(getScopedKey('logs', user.uid)) !== null;
      const activeRestored = pendingRestoredIdsRef.current;

      // 1. Always merge deletedShiftIds AND deletedShiftKeys from other devices and immediately remove
      // any tombstoned shifts (by ID or content key) from the logs on screen without replacing other local data.
      if (data.deletedShiftIds && typeof data.deletedShiftIds === 'object') {
        const merged = mergeCloudTombstones(tombstonesRef.current, data.deletedShiftIds, activeRestored);
        tombstonesRef.current =
          data.logs && typeof data.logs === 'object'
            ? confirmAndPruneTombstones(merged, data.logs)
            : merged;
        saveToStorage('deletedShifts', tombstonesRef.current);
      }

      if (data.deletedShiftKeys && typeof data.deletedShiftKeys === 'object') {
        const mergedKeys = mergeCloudDeletedKeys(deletedKeysRef.current, data.deletedShiftKeys, activeRestored);
        deletedKeysRef.current =
          data.logs && typeof data.logs === 'object'
            ? pruneDeletedShiftKeys(mergedKeys, data.logs)
            : mergedKeys;
        saveToStorage('deletedShiftKeys', deletedKeysRef.current);
      }

      const hasAnyDeletes =
        Object.keys(tombstonesRef.current).length > 0 ||
        Object.keys(deletedKeysRef.current).length > 0 ||
        Boolean(data.deletedShiftIds && typeof data.deletedShiftIds === 'object') ||
        Boolean(data.deletedShiftKeys && typeof data.deletedShiftKeys === 'object');

      if (hasAnyDeletes) {
        const currentLocalLogs = latestStateRef.current.logs || {};
        const filteredLocal = filterLogsWithTombstones(
          currentLocalLogs,
          tombstonesRef.current,
          data.deletedShiftIds,
          deletedKeysRef.current,
          data.deletedShiftKeys
        );

        let beforeCount = 0;
        let afterCount = 0;
        Object.values(currentLocalLogs).forEach(arr => {
          if (Array.isArray(arr)) beforeCount += arr.filter(e => e.type !== 'HOL-W').length;
        });
        Object.values(filteredLocal).forEach(arr => {
          if (Array.isArray(arr)) afterCount += arr.filter(e => e.type !== 'HOL-W').length;
        });

        const nextLocalLogs =
          afterCount < beforeCount
            ? normalizeLogs(autoAssignWorkedHolidays(filteredLocal), false)
            : filteredLocal;

        latestStateRef.current.logs = nextLocalLogs;
        setLogs(nextLocalLogs);
        saveToStorage('logs', nextLocalLogs);
      }

      // 2. Never overwrite other local data when mutations are in-flight, recent, or happened in this session
      if (
        inFlightSyncCountRef.current > 0 ||
        syncVersionRef.current > 0 ||
        Date.now() - isLocalMutationRef.current < 10000 ||
        hasPendingLocalSync(user.uid)
      ) {
        return;
      }

      if (data.logs !== undefined) {
        const cloudMissingIds =
          !hasCompletedLegacyIdMigration(user.uid) && hasEntriesMissingIds(data.logs);

        const filtered = normalizeLogs(
          autoAssignWorkedHolidays(
            filterLogsWithTombstones(
              data.logs,
              tombstonesRef.current,
              data.deletedShiftIds,
              deletedKeysRef.current,
              data.deletedShiftKeys
            )
          ),
          false
        );
        Object.keys(filtered).forEach(d => knownCloudDatesRef.current.add(d));

        if (!hasExistingLocalLogs) {
          setLogs(filtered);
          latestStateRef.current.logs = filtered;
          saveToStorage('logs', filtered);

          // One time only, write any IDs created for old cloud shifts back to Firestore
          if (cloudMissingIds) {
            markLegacyIdMigrationComplete(user.uid);
            const v = ++syncVersionRef.current;
            runBackgroundSync(
              {
                ...latestStateRef.current,
                logs: filtered,
              },
              [],
              v,
              false,
              [],
              false
            );
          }
        } else if (cloudMissingIds) {
          markLegacyIdMigrationComplete(user.uid);
          const v = ++syncVersionRef.current;
          runBackgroundSync(
            {
              ...latestStateRef.current,
              logs: latestStateRef.current.logs,
            },
            [],
            v,
            false,
            [],
            false
          );
        }
      }

      if (data.midCounts !== undefined && !hasExistingLocalLogs) {
        const cleanMids = sanitizeForFirestore(data.midCounts) || {};
        setMidCounts(cleanMids);
        latestStateRef.current.midCounts = cleanMids;
        saveToStorage('mids', cleanMids);
      }

      if (data.fmlaCases && !hasExistingLocalLogs) {
        setFmlaCases(data.fmlaCases);
        latestStateRef.current.fmlaCases = data.fmlaCases;
        saveToStorage('fmla', data.fmlaCases);
      }

      if (data.cardPrefs && !hasExistingLocalLogs) {
        setCardPrefs(data.cardPrefs);
        latestStateRef.current.cardPrefs = data.cardPrefs;
        saveToStorage('cardPrefs', data.cardPrefs);
      }

      if (data.settings && Object.keys(data.settings).length > 0 && !hasExistingLocalLogs) {
        const merged = { ...defaultSettings, ...sanitizeForFirestore(data.settings) };
        setSettings(merged);
        latestStateRef.current.settings = merged;
        saveToStorage('settings', merged);
      }

      if (data.lockedMonths && !hasExistingLocalLogs) {
        setLockedMonths(data.lockedMonths);
        latestStateRef.current.lockedMonths = data.lockedMonths;
        saveToStorage('lockedMonths', data.lockedMonths);
      }
    };

    const startSnapshotListener = async () => {
      try {
        await user.getIdToken(false);
      } catch (tokenErr) {
        console.warn('Initial token verification warning:', tokenErr);
      }

      if (!isSubscribed) return;

      const docRef = doc(db, 'users', user.uid);
      unsubscribe = onSnapshot(docRef, handleDocSnapshot, async (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        const isPerm = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient');

        if (isPerm) {
          try {
            await user.getIdToken(true);
            if (isSubscribed) {
              if (unsubscribe) unsubscribe();
              unsubscribe = onSnapshot(docRef, handleDocSnapshot, (retryError) => {
                reportSyncError(retryError);
                handleFirestoreError(retryError, OperationType.GET, `users/${user.uid}`);
              });
              return;
            }
          } catch {
            // Token refresh failed
          }
        }
        reportSyncError(error);
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      });
    };

    startSnapshotListener();

    return () => {
      isSubscribed = false;
      if (unsubscribe) unsubscribe();
    };
  }, [
    user,
    db,
    saveToStorage,
    hasPendingLocalSync,
    hasCompletedLegacyIdMigration,
    markLegacyIdMigrationComplete,
    runBackgroundSync,
    reportSyncError,
    handleFirestoreError,
    OperationType,
  ]);

  // Automatically flush queued pending local deletes/mutations when browser comes back online
  useEffect(() => {
    const handleOnline = () => {
      const activeUser = auth.currentUser || user;
      if (!activeUser || inFlightSyncCountRef.current > 0) return;

      const hasUnconfirmedTombstones = Object.values(tombstonesRef.current).some(t => !t.cloudConfirmed);
      if (hasPendingLocalSync(activeUser.uid) || hasUnconfirmedTombstones) {
        const v = ++syncVersionRef.current;
        const filteredLocal = normalizeLogs(
          autoAssignWorkedHolidays(
            filterLogsWithTombstones(
              latestStateRef.current.logs,
              tombstonesRef.current,
              null,
              deletedKeysRef.current,
              null
            )
          ),
          false
        );
        const removed = Array.from(knownCloudDatesRef.current).filter(d => !(d in filteredLocal));
        runBackgroundSync(
          {
            ...latestStateRef.current,
            logs: filteredLocal,
          },
          removed,
          v,
          false,
          Array.from(pendingRestoredIdsRef.current),
          false
        );
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user, hasPendingLocalSync, runBackgroundSync]);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('swa_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('swa_isLocked', String(isLocked));
    } catch {}
  }, [isLocked]);

  const updateLogs = useCallback(
    (newLogs: LogsState, options?: UpdateLogsOptions) => {
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;

      // Assign unique fresh IDs to any newly created shifts lacking an ID (never replaces existing IDs)
      const normalizedWithFreshIds = normalizeLogs(newLogs, !options?.isRestore);

      let restoredShiftIds: string[] = [];

      if (options?.isRestore) {
        // Restore mode: collect ALL restored IDs and content keys as restoredShiftIds
        restoredShiftIds = collectShiftIdsAndKeys(normalizedWithFreshIds);
        const cleanedDeletes = removeItemsFromDeleteLists(
          restoredShiftIds,
          tombstonesRef.current,
          deletedKeysRef.current
        );
        tombstonesRef.current = cleanedDeletes.updatedTombstones;
        deletedKeysRef.current = cleanedDeletes.updatedDeletedKeys;
        restoredShiftIds.forEach(item => pendingRestoredIdsRef.current.add(item));
      } else {
        // Intentional re-add / import: remove re-added shift content keys (and IDs) from BOTH delete lists
        const newlyAdded = collectNewlyAddedIdsAndKeys(latestStateRef.current.logs, normalizedWithFreshIds);
        const explicitReAdded = Array.isArray(options?.reAddedKeys) ? options!.reAddedKeys! : [];
        const combinedReAdded = Array.from(new Set([...newlyAdded, ...explicitReAdded]));

        let workingTombstones = tombstonesRef.current;
        let workingDeletedKeys = deletedKeysRef.current;

        if (combinedReAdded.length > 0) {
          const cleaned = removeItemsFromDeleteLists(
            combinedReAdded,
            workingTombstones,
            workingDeletedKeys
          );
          workingTombstones = cleaned.updatedTombstones;
          workingDeletedKeys = cleaned.updatedDeletedKeys;
          combinedReAdded.forEach(item => pendingRestoredIdsRef.current.add(item));
          restoredShiftIds = combinedReAdded;
        }

        // Record any deleted shifts (both ID and shiftContentKey)
        const {
          updatedTombstones,
          updatedDeletedKeys,
          newlyDeletedIds,
          newlyDeletedKeys,
        } = recordDeletedShifts(
          latestStateRef.current.logs,
          normalizedWithFreshIds,
          workingTombstones,
          workingDeletedKeys
        );
        tombstonesRef.current = updatedTombstones;
        deletedKeysRef.current = updatedDeletedKeys;

        // Any newly deleted shift is no longer pending restore
        newlyDeletedIds.forEach(id => pendingRestoredIdsRef.current.delete(id));
        newlyDeletedKeys.forEach(k => pendingRestoredIdsRef.current.delete(k));
      }

      saveToStorage('deletedShifts', tombstonesRef.current);
      saveToStorage('deletedShiftKeys', deletedKeysRef.current);
      saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current));

      const filteredLogs = filterLogsWithTombstones(
        normalizedWithFreshIds,
        tombstonesRef.current,
        null,
        deletedKeysRef.current,
        null
      );
      const processedLogs = normalizeLogs(autoAssignWorkedHolidays(filteredLogs), false);

      const prevDates = new Set([
        ...Object.keys(latestStateRef.current.logs || {}),
        ...Array.from(knownCloudDatesRef.current)
      ]);
      const removedDates = Array.from(prevDates).filter(d => !(d in processedLogs));

      const snapshotForUndo = latestStateRef.current.logs;
      setLogsHistory(hist => {
        const newHist = [...hist, snapshotForUndo];
        return newHist.slice(-20);
      });

      setLogs(processedLogs);
      latestStateRef.current.logs = processedLogs;
      saveToStorage('pendingSync', 'true');
      saveToStorage('logs', processedLogs);

      if (auth.currentUser || user) {
        // Show 'Changes Saved' toast on success, or 'Sync failed' toast on failure
        runBackgroundSync(
          {
            ...latestStateRef.current,
            logs: processedLogs
          },
          removedDates,
          version,
          true,
          restoredShiftIds,
          true
        );
      } else {
        triggerSavedIndicator();
        showToast('Changes Saved', 'success');
      }
    },
    [user, saveToStorage, triggerSavedIndicator, runBackgroundSync, showToast]
  );

  const undoLogs = useCallback(() => {
    if (logsHistory.length === 0) return;
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    const rawPrevious = cleanLogsObject(logsHistory[logsHistory.length - 1]);

    // Collect restored IDs and content keys as restoredShiftIds so Undo sticks locally and in Firestore
    const restoredShiftIds = collectShiftIdsAndKeys(rawPrevious);
    const cleanedAfterRestore = removeItemsFromDeleteLists(
      restoredShiftIds,
      tombstonesRef.current,
      deletedKeysRef.current
    );
    restoredShiftIds.forEach(item => pendingRestoredIdsRef.current.add(item));

    const {
      updatedTombstones,
      updatedDeletedKeys,
      newlyDeletedIds,
      newlyDeletedKeys,
    } = recordDeletedShifts(
      latestStateRef.current.logs,
      rawPrevious,
      cleanedAfterRestore.updatedTombstones,
      cleanedAfterRestore.updatedDeletedKeys
    );

    newlyDeletedIds.forEach(id => pendingRestoredIdsRef.current.delete(id));
    newlyDeletedKeys.forEach(k => pendingRestoredIdsRef.current.delete(k));

    tombstonesRef.current = updatedTombstones;
    deletedKeysRef.current = updatedDeletedKeys;
    saveToStorage('deletedShifts', tombstonesRef.current);
    saveToStorage('deletedShiftKeys', deletedKeysRef.current);
    saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current));

    const previous = normalizeLogs(
      autoAssignWorkedHolidays(
        filterLogsWithTombstones(
          rawPrevious,
          tombstonesRef.current,
          null,
          deletedKeysRef.current,
          null
        )
      ),
      false
    );

    const prevDates = new Set([
      ...Object.keys(latestStateRef.current.logs || {}),
      ...Array.from(knownCloudDatesRef.current)
    ]);
    const removedDates = Array.from(prevDates).filter(d => !(d in previous));

    setLogs(previous);
    latestStateRef.current.logs = previous;
    setLogsHistory(hist => hist.slice(0, -1));
    saveToStorage('pendingSync', 'true');
    saveToStorage('logs', previous);
    if (auth.currentUser || user) {
      runBackgroundSync(
        {
          ...latestStateRef.current,
          logs: previous
        },
        removedDates,
        version,
        true,
        restoredShiftIds,
        true
      );
    } else {
      triggerSavedIndicator();
      showToast('Changes Saved', 'success');
    }
  }, [logsHistory, user, saveToStorage, triggerSavedIndicator, runBackgroundSync, showToast]);

  const updateMidCounts = useCallback((newMids: MidCountsState) => {
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    setMidCounts(newMids);
    latestStateRef.current.midCounts = newMids;
    saveToStorage('pendingSync', 'true');
    saveToStorage('mids', newMids);
    if (auth.currentUser || user) {
      runBackgroundSync({ ...latestStateRef.current, midCounts: newMids }, [], version, true);
    } else {
      triggerSavedIndicator();
    }
  }, [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]);

  const updateFmlaCases = useCallback((newCases: FmlaCase[]) => {
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    setFmlaCases(newCases);
    latestStateRef.current.fmlaCases = newCases;
    saveToStorage('pendingSync', 'true');
    saveToStorage('fmla', newCases);
    if (auth.currentUser || user) {
      runBackgroundSync({ ...latestStateRef.current, fmlaCases: newCases }, [], version, true);
    } else {
      triggerSavedIndicator();
    }
  }, [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]);

  const updateSettings = useCallback(
    (
      newSettings: Partial<Settings>,
      options?: boolean | { silentIndicator?: boolean; localOnly?: boolean }
    ) => {
      const silentIndicator =
        typeof options === 'boolean' ? options : Boolean(options?.silentIndicator);
      const localOnly = typeof options === 'object' ? Boolean(options?.localOnly) : false;

      const updated = { ...latestStateRef.current.settings, ...newSettings };
      setSettings(updated);
      latestStateRef.current.settings = updated;
      saveToStorage('settings', updated);

      if (localOnly) {
        return;
      }

      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      saveToStorage('pendingSync', 'true');
      if (auth.currentUser || user) {
        runBackgroundSync({ ...latestStateRef.current, settings: updated }, [], version, !silentIndicator);
      } else if (!silentIndicator) {
        triggerSavedIndicator();
      }
    },
    [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const overwriteSettings = useCallback((allSettings: Settings) => {
    if (!allSettings || typeof allSettings !== 'object') return;
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    const mergedSettings = { ...defaultSettings, ...allSettings };
    setSettings(mergedSettings);
    latestStateRef.current.settings = mergedSettings;
    saveToStorage('pendingSync', 'true');
    saveToStorage('settings', mergedSettings);
    if (auth.currentUser || user) {
      runBackgroundSync({ ...latestStateRef.current, settings: mergedSettings }, [], version, true);
    } else {
      triggerSavedIndicator();
    }
  }, [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]);

  const updateCardPrefs = useCallback((newPrefs: CardPrefs) => {
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    setCardPrefs(newPrefs);
    latestStateRef.current.cardPrefs = newPrefs;
    saveToStorage('pendingSync', 'true');
    saveToStorage('cardPrefs', newPrefs);
    if (auth.currentUser || user) {
      runBackgroundSync({ ...latestStateRef.current, cardPrefs: newPrefs }, [], version, true);
    } else {
      triggerSavedIndicator();
    }
  }, [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]);

  const toggleTheme = (newTheme?: ThemeType) => {
    if (newTheme) {
      setTheme(newTheme);
    } else {
      setTheme(prev => {
        const currentIdx = themes.indexOf(prev);
        const nextIdx = (currentIdx + 1) % themes.length;
        return themes[nextIdx];
      });
    }
  };

  const clearLogs = useCallback(async () => {
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;

    const {
      updatedTombstones,
      updatedDeletedKeys,
      newlyDeletedIds,
      newlyDeletedKeys,
    } = recordDeletedShifts(
      latestStateRef.current.logs,
      {},
      tombstonesRef.current,
      deletedKeysRef.current
    );
    tombstonesRef.current = updatedTombstones;
    deletedKeysRef.current = updatedDeletedKeys;
    newlyDeletedIds.forEach(id => pendingRestoredIdsRef.current.delete(id));
    newlyDeletedKeys.forEach(k => pendingRestoredIdsRef.current.delete(k));
    saveToStorage('deletedShifts', tombstonesRef.current);
    saveToStorage('deletedShiftKeys', deletedKeysRef.current);
    saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current));

    const removedDates = Array.from(new Set([
      ...Object.keys(latestStateRef.current.logs || {}),
      ...Array.from(knownCloudDatesRef.current)
    ]));
    knownCloudDatesRef.current.clear();

    setLogs({});
    setMidCounts({});
    latestStateRef.current.logs = {};
    latestStateRef.current.midCounts = {};
    saveToStorage('pendingSync', 'true');
    saveToStorage('logs', {});
    saveToStorage('mids', {});

    if (auth.currentUser || user) {
      await runBackgroundSync(
        {
          ...latestStateRef.current,
          logs: {},
          midCounts: {}
        },
        removedDates,
        version,
        true,
        [],
        true
      );
    } else {
      triggerSavedIndicator();
      showToast('Changes Saved', 'success');
    }
  }, [user, saveToStorage, runBackgroundSync, triggerSavedIndicator, showToast]);

  // Navigation strictly changes view state only — NEVER calls setLogs, pullFromCloud, or syncToFirebase
  const changeMonth = (n: number) => {
    setDirection(n);
    let m = viewMonth + n;
    let y = viewYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setViewMonth(m);
    setViewYear(y);
  };

  const changeYear = (n: number) => {
    setDirection(n);
    setViewYear(viewYear + n);
  };

  const toggleLockMonth = useCallback((year: number, month: number) => {
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const prev = latestStateRef.current.lockedMonths || [];
    const updated = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
    setLockedMonths(updated);
    latestStateRef.current.lockedMonths = updated;
    saveToStorage('pendingSync', 'true');
    saveToStorage('lockedMonths', updated);
    if (auth.currentUser || user) {
      runBackgroundSync({ ...latestStateRef.current, lockedMonths: updated }, [], version, true);
    } else {
      triggerSavedIndicator();
    }
  }, [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]);

  const pullFromCloud = useCallback(async () => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) return false;

    setCloudSyncState('syncing');

    const waitStart = Date.now();
    while (inFlightSyncCountRef.current > 0 && Date.now() - waitStart < 3500) {
      await new Promise(r => setTimeout(r, 100));
    }

    const docRef = doc(db, 'users', activeUser.uid);
    try {
      let data: any = null;

      try {
        const restData = await directRestPull(activeUser);
        if (restData?.__notFound) {
          reportSyncSuccess();
          return false;
        }
        if (restData && typeof restData === 'object') {
          data = restData;
        }
      } catch (restErr: any) {
        const msg = restErr instanceof Error ? restErr.message : String(restErr);
        if (msg.includes('HTTP 4')) {
          throw restErr;
        }
        const docSnap = await getDocFromServer(docRef);
        if (!docSnap || !docSnap.exists()) {
          reportSyncSuccess();
          return false;
        }
        data = docSnap.data();
      }

      if (data && typeof data === 'object') {
        const cloudHadInvalidKeys =
          Boolean((data as any)?._hadInvalidCloudKeys) ||
          hasInvalidFirestoreKeys(data.logs) ||
          hasInvalidFirestoreKeys(data.midCounts) ||
          hasInvalidFirestoreKeys(data.deletedShiftIds) ||
          hasInvalidFirestoreKeys(data.deletedShiftKeys) ||
          hasInvalidFirestoreKeys(data.settings);

        const cloudMissingLegacyIds =
          !hasCompletedLegacyIdMigration(activeUser.uid) && hasEntriesMissingIds(data.logs);
        if (cloudMissingLegacyIds) {
          markLegacyIdMigrationComplete(activeUser.uid);
        }

        const sanitizedCloudDeletedIds =
          data.deletedShiftIds && typeof data.deletedShiftIds === 'object'
            ? sanitizeForFirestore(data.deletedShiftIds)
            : {};
        const sanitizedCloudDeletedKeys =
          data.deletedShiftKeys && typeof data.deletedShiftKeys === 'object'
            ? sanitizeForFirestore(data.deletedShiftKeys)
            : {};

        const rawCloudLogsSanitized = sanitizeForFirestore(data.logs) || {};
        const rawCloudLogsNormalized = normalizeLogs(rawCloudLogsSanitized, false);

        const activeRestored = pendingRestoredIdsRef.current;
        const mergedTombstones = mergeCloudTombstones(
          tombstonesRef.current,
          sanitizedCloudDeletedIds,
          activeRestored
        );
        const mergedDeletedKeys = mergeCloudDeletedKeys(
          deletedKeysRef.current,
          sanitizedCloudDeletedKeys,
          activeRestored
        );

        // Check whether the cloud copy still had ANY deleted shift (by ID OR by shiftContentKey)
        const cloudHadStaleDeletedShifts = logsContainDeletedShift(
          rawCloudLogsNormalized,
          mergedTombstones,
          sanitizedCloudDeletedIds,
          mergedDeletedKeys,
          sanitizedCloudDeletedKeys
        );

        const filteredCloudLogs = filterLogsWithTombstones(
          rawCloudLogsNormalized,
          mergedTombstones,
          sanitizedCloudDeletedIds,
          mergedDeletedKeys,
          sanitizedCloudDeletedKeys
        );
        const finalCloudLogs = normalizeLogs(autoAssignWorkedHolidays(filteredCloudLogs), false);

        // Confirm tombstones strictly against the fresh read of the cloud copy
        tombstonesRef.current = confirmAndPruneTombstones(mergedTombstones, rawCloudLogsNormalized);
        deletedKeysRef.current = pruneDeletedShiftKeys(mergedDeletedKeys, rawCloudLogsNormalized);
        saveToStorage('deletedShifts', tombstonesRef.current);
        saveToStorage('deletedShiftKeys', deletedKeysRef.current);

        knownCloudDatesRef.current = new Set(Object.keys(finalCloudLogs));

        const needsCloudCleanupPush =
          cloudHadStaleDeletedShifts || cloudHadInvalidKeys || cloudMissingLegacyIds;

        setLogs(finalCloudLogs);
        latestStateRef.current.logs = finalCloudLogs;
        saveToStorage('logs', finalCloudLogs);
        saveToStorage('pendingSync', needsCloudCleanupPush ? 'true' : 'false');

        const cloudMids =
          data.midCounts && typeof data.midCounts === 'object'
            ? sanitizeForFirestore(data.midCounts) || {}
            : {};
        setMidCounts(cloudMids);
        latestStateRef.current.midCounts = cloudMids;
        saveToStorage('mids', cloudMids);

        if (Array.isArray(data.fmlaCases)) {
          const cleanFmla = sanitizeForFirestore(data.fmlaCases) || [];
          setFmlaCases(cleanFmla);
          latestStateRef.current.fmlaCases = cleanFmla;
          saveToStorage('fmla', cleanFmla);
        }
        if (data.cardPrefs && typeof data.cardPrefs === 'object') {
          const cleanPrefs = sanitizeForFirestore(data.cardPrefs) || defaultCardPrefs;
          setCardPrefs(cleanPrefs);
          latestStateRef.current.cardPrefs = cleanPrefs;
          saveToStorage('cardPrefs', cleanPrefs);
        }
        if (data.settings && typeof data.settings === 'object' && Object.keys(data.settings).length > 0) {
          const cleanSettings = sanitizeForFirestore(data.settings) || {};
          const merged = { ...defaultSettings, ...cleanSettings };
          setSettings(merged);
          latestStateRef.current.settings = merged;
          saveToStorage('settings', merged);
        }
        if (Array.isArray(data.lockedMonths)) {
          setLockedMonths(data.lockedMonths);
          latestStateRef.current.lockedMonths = data.lockedMonths;
          saveToStorage('lockedMonths', data.lockedMonths);
        }

        reportSyncSuccess();

        // Never resurrect on Pull: if cloud copy still had any deleted shift (by ID or content key),
        // invalid keys, or un-migrated legacy shift IDs, push the cleaned copy back right away.
        if (needsCloudCleanupPush) {
          const v = ++syncVersionRef.current;
          const removedDates = Object.keys(rawCloudLogsNormalized).filter(d => !(d in finalCloudLogs));
          await runBackgroundSync(
            {
              ...latestStateRef.current,
              logs: finalCloudLogs
            },
            removedDates,
            v,
            false,
            Array.from(pendingRestoredIdsRef.current),
            false
          );
        }

        return true;
      }

      reportSyncSuccess();
      return false;
    } catch (e: any) {
      setShowSavedIndicator(false);
      reportSyncError(e);
      throw e;
    }
  }, [
    user,
    db,
    saveToStorage,
    setCloudSyncState,
    reportSyncSuccess,
    reportSyncError,
    runBackgroundSync,
    hasCompletedLegacyIdMigration,
    markLegacyIdMigrationComplete,
  ]);

  const forceSyncToCloud = useCallback(async () => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) return false;
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    inFlightSyncCountRef.current += 1;
    const effectiveRestored = Array.from(pendingRestoredIdsRef.current);

    try {
      const filteredLocal = filterLogsWithTombstones(
        latestStateRef.current.logs,
        tombstonesRef.current,
        null,
        deletedKeysRef.current,
        null
      );
      const cleanedLogs = normalizeLogs(autoAssignWorkedHolidays(filteredLocal), false);
      const removedDates = Array.from(knownCloudDatesRef.current).filter(d => !(d in cleanedLogs));

      const fullData = {
        logs: cleanedLogs,
        deletedShiftIds: buildCloudDeletedIdsMap(tombstonesRef.current),
        deletedShiftKeys: buildCloudDeletedKeysMap(deletedKeysRef.current, tombstonesRef.current),
        midCounts: latestStateRef.current.midCounts || {},
        fmlaCases: latestStateRef.current.fmlaCases || [],
        cardPrefs: latestStateRef.current.cardPrefs || defaultCardPrefs,
        settings: latestStateRef.current.settings || defaultSettings,
        lockedMonths: latestStateRef.current.lockedMonths || []
      };

      setLogs(cleanedLogs);
      latestStateRef.current.logs = cleanedLogs;
      saveToStorage('logs', cleanedLogs);

      const res = await syncToFirebase(fullData, true, removedDates, effectiveRestored, false);
      if (res.ok) {
        const mergedTombstones = mergeCloudTombstones(
          tombstonesRef.current,
          res.cloudDeletedIds,
          effectiveRestored
        );
        const prunedTombstones = confirmAndPruneTombstones(mergedTombstones, res.freshCloudLogs);
        tombstonesRef.current = prunedTombstones;
        saveToStorage('deletedShifts', prunedTombstones);

        const mergedDeletedKeys = mergeCloudDeletedKeys(
          deletedKeysRef.current,
          res.cloudDeletedKeys,
          effectiveRestored
        );
        const prunedDeletedKeys = pruneDeletedShiftKeys(mergedDeletedKeys, res.freshCloudLogs);
        deletedKeysRef.current = prunedDeletedKeys;
        saveToStorage('deletedShiftKeys', prunedDeletedKeys);

        for (const rk of effectiveRestored) {
          pendingRestoredIdsRef.current.delete(rk);
        }
        saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current));

        knownCloudDatesRef.current = new Set(Object.keys(res.freshCloudLogs || cleanedLogs));
        if (syncVersionRef.current === version) {
          saveToStorage('pendingSync', 'false');
        }
        triggerSavedIndicator();
        return true;
      }
      setShowSavedIndicator(false);
      return false;
    } catch (e) {
      setShowSavedIndicator(false);
      console.warn('Force sync to cloud failed:', e);
      throw e;
    } finally {
      inFlightSyncCountRef.current = Math.max(0, inFlightSyncCountRef.current - 1);
    }
  }, [user, syncToFirebase, saveToStorage, triggerSavedIndicator]);

  const logout = useCallback(async () => {
    knownCloudDatesRef.current.clear();
    tombstonesRef.current = {};
    deletedKeysRef.current = {};
    pendingRestoredIdsRef.current.clear();
    setLogs({});
    setLogsHistory([]);
    setMidCounts({});
    setFmlaCases([]);
    setSettings({ ...defaultSettings });
    setLockedMonths([]);
    setCardPrefs(defaultCardPrefs);
    await firebaseLogout();
  }, [firebaseLogout]);

  return {
    user, login, logout, isInitializingAuth,
    cloudSyncState, cloudSyncError,
    logs, updateLogs, undoLogs, logsHistory,
    midCounts, updateMidCounts,
    fmlaCases, updateFmlaCases,
    settings, updateSettings, overwriteSettings,
    cardPrefs, updateCardPrefs,
    theme, toggleTheme, setTheme,
    viewMonth, setViewMonth,
    viewYear, setViewYear,
    isYearView, setIsYearView,
    direction, setDirection,
    changeMonth, changeYear,
    clearLogs,
    isLocked, setIsLocked,
    lockedMonths, toggleLockMonth, setLockedMonths,
    showSavedIndicator, syncToGoogleSheets, googleAccessToken, forceSyncToCloud, pullFromCloud
  };
};
