import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, CardPrefs, FmlaCase, LogsState, MidCountsState, ThemeType, TombstoneMap } from '../types';
import { autoAssignWorkedHolidays } from '../utils/calculations';
import { useFirebaseSync, directRestPull, cleanLogsObject } from './useFirebaseSync';
import {
  normalizeLogs,
  filterLogsWithTombstones,
  recordDeletedShifts,
  removeRestoredIdsFromTombstones,
  mergeCloudTombstones,
  confirmAndPruneTombstones,
  buildCloudDeletedIdsMap,
  hasInvalidFirestoreKeys,
  sanitizeForFirestore,
} from '../utils/shiftSync';
import { doc, onSnapshot, getDocFromServer } from 'firebase/firestore';
import { auth } from '../firebase';

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

  const runBackgroundSync = useCallback(
    async (
      payload: any,
      removedDates: string[],
      version: number,
      showSavedOnSuccess = true
    ): Promise<boolean> => {
      inFlightSyncCountRef.current += 1;
      try {
        const safeLogs = filterLogsWithTombstones(payload.logs || {}, tombstonesRef.current);
        const enrichedPayload = {
          ...payload,
          logs: safeLogs,
          deletedShiftIds: buildCloudDeletedIdsMap(tombstonesRef.current),
        };

        const res = await syncToFirebase(enrichedPayload, true, removedDates);
        if (res.ok) {
          const mergedTombstones = mergeCloudTombstones(tombstonesRef.current, res.cloudDeletedIds);
          // Only mark tombstones confirmed when a fresh read of the cloud copy (res.freshCloudLogs) shows the shift is gone
          const prunedTombstones = confirmAndPruneTombstones(mergedTombstones, res.freshCloudLogs);
          tombstonesRef.current = prunedTombstones;
          saveToStorage('deletedShifts', prunedTombstones);

          if (syncVersionRef.current === version) {
            knownCloudDatesRef.current = new Set(Object.keys(res.freshCloudLogs || safeLogs || {}));
            saveToStorage('pendingSync', 'false');
          }
          if (showSavedOnSuccess) {
            triggerSavedIndicator();
          }
          return true;
        }
        setShowSavedIndicator(false);
        return false;
      } catch (err) {
        setShowSavedIndicator(false);
        console.warn('Background cloud sync failed (queued locally):', err);
        return false;
      } finally {
        inFlightSyncCountRef.current = Math.max(0, inFlightSyncCountRef.current - 1);
      }
    },
    [syncToFirebase, saveToStorage, triggerSavedIndicator]
  );

  // Load helper for a specific user ID or guest
  const loadScopedData = useCallback((uid: string | null) => {
    // 0. Load Deleted Shift Tombstones FIRST so deleted shifts never reappear on refresh or year switch
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

    // 1. Logs (filtered against tombstones)
    let loadedLogs: LogsState = {};
    try {
      const storedLogs = localStorage.getItem(getScopedKey('logs', uid));
      if (storedLogs && storedLogs !== 'undefined' && storedLogs !== 'null') {
        const parsedLogs = JSON.parse(storedLogs);
        const filtered = filterLogsWithTombstones(parsedLogs, loadedTombstones);
        loadedLogs = normalizeLogs(autoAssignWorkedHolidays(filtered), false);
        setLogs(loadedLogs);
        Object.keys(loadedLogs).forEach(d => knownCloudDatesRef.current.add(d));
        // Persist normalized IDs & tombstone filtering back to localStorage cleanly
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
  }, []);

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
      if (currentUserUid) {
        // Logged in: load user's scoped local data while Firestore attaches
        loadScopedData(currentUserUid);
      } else {
        // Logged out: immediately wipe in-memory state back to clean blank template
        tombstonesRef.current = {};
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

    // If user has unpushed local changes or unconfirmed tombstones (e.g., deleted a shift and reloaded immediately),
    // push local changes & tombstones to Firestore first so local deletes always win!
    if (hasPendingLocalSync(user.uid) || unconfirmedCount > 0) {
      const v = ++syncVersionRef.current;
      const filteredLocal = normalizeLogs(
        autoAssignWorkedHolidays(filterLogsWithTombstones(latestStateRef.current.logs, tombstonesRef.current)),
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
        false
      );
    }

    const handleDocSnapshot = (docSnap: any) => {
      // Never overwrite local state with cached snapshots or local pending writes
      if (docSnap.metadata?.hasPendingWrites || docSnap.metadata?.fromCache) {
        return;
      }

      if (!docSnap.exists()) {
        return;
      }

      const data = docSnap.data();
      const hasExistingLocalLogs = localStorage.getItem(getScopedKey('logs', user.uid)) !== null;

      // 1. Always merge deletedShiftIds from other devices and immediately remove any tombstoned shifts
      // from the logs on screen, even when local logs already exist — without replacing other local data.
      if (data.deletedShiftIds && typeof data.deletedShiftIds === 'object') {
        const merged = mergeCloudTombstones(tombstonesRef.current, data.deletedShiftIds);
        tombstonesRef.current =
          data.logs && typeof data.logs === 'object'
            ? confirmAndPruneTombstones(merged, data.logs)
            : merged;
        saveToStorage('deletedShifts', tombstonesRef.current);
      }

      if (Object.keys(tombstonesRef.current).length > 0 || (data.deletedShiftIds && typeof data.deletedShiftIds === 'object')) {
        const currentLocalLogs = latestStateRef.current.logs || {};
        const filteredLocal = filterLogsWithTombstones(
          currentLocalLogs,
          tombstonesRef.current,
          data.deletedShiftIds
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

      // Only hydrate initial cloud state if local storage had not already been populated for this user

      if (data.logs !== undefined) {
        const filtered = normalizeLogs(
          autoAssignWorkedHolidays(
            filterLogsWithTombstones(data.logs, tombstonesRef.current, data.deletedShiftIds)
          ),
          false
        );
        Object.keys(filtered).forEach(d => knownCloudDatesRef.current.add(d));
        if (!hasExistingLocalLogs) {
          setLogs(filtered);
          latestStateRef.current.logs = filtered;
          saveToStorage('logs', filtered);
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
  }, [user, db, saveToStorage, hasPendingLocalSync, runBackgroundSync, reportSyncError, handleFirestoreError, OperationType]);

  // Automatically flush queued pending local deletes/mutations when browser comes back online
  useEffect(() => {
    const handleOnline = () => {
      const activeUser = auth.currentUser || user;
      if (!activeUser || inFlightSyncCountRef.current > 0) return;

      const hasUnconfirmedTombstones = Object.values(tombstonesRef.current).some(t => !t.cloudConfirmed);
      if (hasPendingLocalSync(activeUser.uid) || hasUnconfirmedTombstones) {
        const v = ++syncVersionRef.current;
        const filteredLocal = normalizeLogs(
          autoAssignWorkedHolidays(filterLogsWithTombstones(latestStateRef.current.logs, tombstonesRef.current)),
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
    (newLogs: LogsState, options?: { isRestore?: boolean }) => {
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;

      // Assign unique fresh IDs to any newly created shifts lacking an ID
      const normalizedWithFreshIds = normalizeLogs(newLogs, !options?.isRestore);

      if (options?.isRestore) {
        tombstonesRef.current = removeRestoredIdsFromTombstones(normalizedWithFreshIds, tombstonesRef.current);
      } else {
        const { updatedTombstones } = recordDeletedShifts(
          latestStateRef.current.logs,
          normalizedWithFreshIds,
          tombstonesRef.current
        );
        tombstonesRef.current = updatedTombstones;
      }
      saveToStorage('deletedShifts', tombstonesRef.current);

      const filteredLogs = filterLogsWithTombstones(normalizedWithFreshIds, tombstonesRef.current);
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
        // Immediately sync local shift additions/deletions to Firestore; only show "Changes Saved" when sync succeeds
        runBackgroundSync(
          {
            ...latestStateRef.current,
            logs: processedLogs
          },
          removedDates,
          version,
          true
        );
      } else {
        triggerSavedIndicator();
      }
    },
    [user, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const undoLogs = useCallback(() => {
    if (logsHistory.length === 0) return;
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    const rawPrevious = cleanLogsObject(logsHistory[logsHistory.length - 1]);

    // Remove restored shift IDs from tombstones so Undo can bring back the last deleted shift intentionally
    const afterRestoreTombstones = removeRestoredIdsFromTombstones(rawPrevious, tombstonesRef.current);
    const { updatedTombstones } = recordDeletedShifts(
      latestStateRef.current.logs,
      rawPrevious,
      afterRestoreTombstones
    );
    tombstonesRef.current = updatedTombstones;
    saveToStorage('deletedShifts', tombstonesRef.current);

    const previous = normalizeLogs(
      autoAssignWorkedHolidays(filterLogsWithTombstones(rawPrevious, tombstonesRef.current)),
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
        true
      );
    } else {
      triggerSavedIndicator();
    }
  }, [logsHistory, user, saveToStorage, triggerSavedIndicator, runBackgroundSync]);

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

      // When localOnly is true (e.g. automatic year-view calculation), do NOT trigger a cloud push
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

    const { updatedTombstones } = recordDeletedShifts(
      latestStateRef.current.logs,
      {},
      tombstonesRef.current
    );
    tombstonesRef.current = updatedTombstones;
    saveToStorage('deletedShifts', tombstonesRef.current);

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
        true
      );
    } else {
      triggerSavedIndicator();
    }
  }, [user, saveToStorage, runBackgroundSync, triggerSavedIndicator]);

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

    // Wait briefly if a push is currently in-flight so Pull never reads pre-push state
    const waitStart = Date.now();
    while (inFlightSyncCountRef.current > 0 && Date.now() - waitStart < 3500) {
      await new Promise(r => setTimeout(r, 100));
    }

    const docRef = doc(db, 'users', activeUser.uid);
    try {
      let data: any = null;

      // 1. Direct REST pull against Firestore v1 API (cache: 'no-store', zero invalid query params)
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
        // Surface HTTP 4xx errors (400/401/403) immediately rather than hiding them behind cached reads
        if (msg.includes('HTTP 4')) {
          throw restErr;
        }
        // Only fall back to getDocFromServer for transient network hiccups (never getDocFromCache!)
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
          hasInvalidFirestoreKeys(data.settings);

        const sanitizedCloudDeletedIds =
          data.deletedShiftIds && typeof data.deletedShiftIds === 'object'
            ? sanitizeForFirestore(data.deletedShiftIds)
            : {};

        const rawCloudLogsNormalized = normalizeLogs(sanitizeForFirestore(data.logs) || {}, false);

        // Merge cloud deletedShiftIds with local tombstones so a deleted shift NEVER comes back on Pull
        const mergedTombstones = mergeCloudTombstones(tombstonesRef.current, sanitizedCloudDeletedIds);

        const filteredCloudLogs = filterLogsWithTombstones(
          rawCloudLogsNormalized,
          mergedTombstones,
          sanitizedCloudDeletedIds
        );
        const finalCloudLogs = normalizeLogs(autoAssignWorkedHolidays(filteredCloudLogs), false);

        // Detect if raw cloud logs still contained any tombstoned shifts (e.g. from another device or an unconfirmed delete)
        let rawCount = 0;
        let filteredCount = 0;
        Object.values(rawCloudLogsNormalized).forEach(arr => {
          rawCount += arr.filter(e => e.type !== 'HOL-W').length;
        });
        Object.values(filteredCloudLogs).forEach(arr => {
          filteredCount += arr.filter(e => e.type !== 'HOL-W').length;
        });
        const cloudHadStaleDeletedShifts = rawCount > filteredCount;

        // Confirm tombstones strictly against the fresh read of the cloud copy (rawCloudLogsNormalized)
        tombstonesRef.current = confirmAndPruneTombstones(mergedTombstones, rawCloudLogsNormalized);
        saveToStorage('deletedShifts', tombstonesRef.current);

        knownCloudDatesRef.current = new Set(Object.keys(finalCloudLogs));

        const needsCloudCleanupPush = cloudHadStaleDeletedShifts || cloudHadInvalidKeys;

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

        // If cloud copy had tombstoned shifts or invalid "" / __reserved__ keys, push the cleaned copy back
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
  }, [user, db, saveToStorage, setCloudSyncState, reportSyncSuccess, reportSyncError, runBackgroundSync]);

  const forceSyncToCloud = useCallback(async () => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) return false;
    isLocalMutationRef.current = Date.now();
    const version = ++syncVersionRef.current;
    inFlightSyncCountRef.current += 1;
    try {
      const filteredLocal = filterLogsWithTombstones(latestStateRef.current.logs, tombstonesRef.current);
      const cleanedLogs = normalizeLogs(autoAssignWorkedHolidays(filteredLocal), false);
      const removedDates = Array.from(knownCloudDatesRef.current).filter(d => !(d in cleanedLogs));

      const fullData = {
        logs: cleanedLogs,
        deletedShiftIds: buildCloudDeletedIdsMap(tombstonesRef.current),
        midCounts: latestStateRef.current.midCounts || {},
        fmlaCases: latestStateRef.current.fmlaCases || [],
        cardPrefs: latestStateRef.current.cardPrefs || defaultCardPrefs,
        settings: latestStateRef.current.settings || defaultSettings,
        lockedMonths: latestStateRef.current.lockedMonths || []
      };

      setLogs(cleanedLogs);
      latestStateRef.current.logs = cleanedLogs;
      saveToStorage('logs', cleanedLogs);

      // Authoritative overwrite: mirrors local data in Firestore, deleting any removed shifts or days
      const res = await syncToFirebase(fullData, true, removedDates);
      if (res.ok) {
        const mergedTombstones = mergeCloudTombstones(tombstonesRef.current, res.cloudDeletedIds);
        // Only mark tombstones confirmed when a fresh read of the cloud copy (res.freshCloudLogs) shows the shift is gone
        const prunedTombstones = confirmAndPruneTombstones(mergedTombstones, res.freshCloudLogs);
        tombstonesRef.current = prunedTombstones;
        saveToStorage('deletedShifts', prunedTombstones);

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

  // Clean logout wrapper: immediately purges all sensitive in-memory state
  const logout = useCallback(async () => {
    knownCloudDatesRef.current.clear();
    tombstonesRef.current = {};
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
