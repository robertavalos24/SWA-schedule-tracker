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

const cloneDefaultSettings = (): Settings => ({
  ...defaultSettings,
  payHistory: []
});

const cloneDefaultCardPrefs = (): CardPrefs => ({
  ...defaultCardPrefs,
  cardOrder: [...defaultCardPrefs.cardOrder]
});

// Scoped key generator to isolate authenticated user data from guest sessions
export const getScopedKey = (baseKey: string, uid?: string | null): string => {
  return uid ? `swa_u_${uid}_${baseKey}` : `swa_guest_${baseKey}`;
};

const GUEST_EXPLICIT_SESSION_KEY = 'swa_guest_explicitSession';

// Removes all swa_guest_* keys (and legacy un-scoped swa_lockedMonths) without touching
// swa_u_{uid}_*, swa_theme, or swa_isLocked.
export const clearGuestStorage = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('swa_guest_') || k === 'swa_lockedMonths')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // Ignore storage access restrictions in sandboxes
  }
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
      'swa_initialYear',
      'swa_lockedMonths'
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

interface SaveToStorageOptions {
  expectedUid?: string | null;
  allowGuest?: boolean;
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
  const [settings, setSettings] = useState<Settings>(cloneDefaultSettings);
  const [cardPrefs, setCardPrefs] = useState<CardPrefs>(cloneDefaultCardPrefs);
  const [theme, setTheme] = useState<ThemeType>(() => {
    try {
      const storedTheme = localStorage.getItem('swa_theme') as ThemeType;
      if (storedTheme && themes.includes(storedTheme)) return storedTheme;
    } catch {}
    return 'light';
  });
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('swa_isLocked') === 'true';
    } catch {}
    return false;
  });
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

  // Monotonically incremented on every sign-out / account transition to immediately invalidate
  // in-flight Firestore snapshots, pulls, and background pushes.
  const authSessionEpochRef = useRef<number>(0);
  const activeSnapshotUnsubRef = useRef<(() => void) | null>(null);
  // Tracks which signed-in UID owns the current in-memory schedule (null when signed out).
  const activeDataOwnerUidRef = useRef<string | null>(null);

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

  const clearAllScheduleStateInMemory = useCallback(() => {
    authSessionEpochRef.current += 1;
    if (activeSnapshotUnsubRef.current) {
      try {
        activeSnapshotUnsubRef.current();
      } catch {}
      activeSnapshotUnsubRef.current = null;
    }
    activeDataOwnerUidRef.current = null;
    inFlightSyncCountRef.current = 0;
    syncVersionRef.current = 0;
    isLocalMutationRef.current = 0;
    needsOneTimeLegacyIdSyncRef.current = false;
    knownCloudDatesRef.current.clear();
    tombstonesRef.current = {};
    deletedKeysRef.current = {};
    pendingRestoredIdsRef.current.clear();

    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = null;
    }
    setShowSavedIndicator(false);

    const freshSettings = cloneDefaultSettings();
    const freshCardPrefs = cloneDefaultCardPrefs();
    latestStateRef.current = {
      logs: {},
      midCounts: {},
      fmlaCases: [],
      cardPrefs: freshCardPrefs,
      settings: freshSettings,
      lockedMonths: []
    };

    setLogs({});
    setLogsHistory([]);
    setMidCounts({});
    setFmlaCases([]);
    setSettings(freshSettings);
    setLockedMonths([]);
    setCardPrefs(freshCardPrefs);
  }, []);

  const triggerSavedIndicator = useCallback(() => {
    setShowSavedIndicator(true);
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
    }
    savedTimeoutRef.current = setTimeout(() => {
      setShowSavedIndicator(false);
    }, 1500);
  }, []);

  // Hardened scoped save helper:
  // - Never writes anything while auth is still initializing.
  // - Any cloud/snapshot/background write passes { expectedUid } and bails out if signed out or UID changed.
  // - Never writes user-scoped or mid-transition data into swa_guest_* keys.
  const saveToStorage = useCallback(
    (key: string, data: any, options?: SaveToStorageOptions) => {
      if (isInitializingAuth) return;

      try {
        const serialized = typeof data === 'object' ? JSON.stringify(data) : String(data);

        if (options && 'expectedUid' in options) {
          const expectedUid = options.expectedUid;
          if (
            !expectedUid ||
            auth.currentUser === null ||
            auth.currentUser.uid !== expectedUid ||
            activeDataOwnerUidRef.current !== expectedUid
          ) {
            return;
          }
          localStorage.setItem(getScopedKey(key, expectedUid), serialized);
          return;
        }

        const currentAuthUid = auth.currentUser?.uid || null;
        const stateUid = user?.uid || null;

        if (currentAuthUid) {
          if (stateUid && stateUid !== currentAuthUid) return;
          if (activeDataOwnerUidRef.current && activeDataOwnerUidRef.current !== currentAuthUid) return;
          localStorage.setItem(getScopedKey(key, currentAuthUid), serialized);
          return;
        }

        // Signed-out path: ONLY allow guest writes from an explicit interactive edit made while fully signed out
        if (
          stateUid === null &&
          activeDataOwnerUidRef.current === null &&
          options?.allowGuest === true
        ) {
          localStorage.setItem(GUEST_EXPLICIT_SESSION_KEY, '1');
          localStorage.setItem(getScopedKey(key, null), serialized);
        }
      } catch (e) {
        console.warn('Storage save failed:', e);
      }
    },
    [user, isInitializingAuth]
  );

  // Resolves storage write options for user-initiated mutations
  const getInteractiveSaveOptions = useCallback((): SaveToStorageOptions => {
    const currentAuthUid = auth.currentUser?.uid || null;
    if (currentAuthUid) {
      return { expectedUid: currentAuthUid };
    }
    const isPureSignedOutGuest =
      !isInitializingAuth && user === null && activeDataOwnerUidRef.current === null;
    return { allowGuest: isPureSignedOutGuest };
  }, [user, isInitializingAuth]);

  const hasPendingLocalSync = useCallback((uid?: string | null): boolean => {
    try {
      const activeUid = uid ?? auth.currentUser?.uid ?? user?.uid;
      if (!activeUid) return false;
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
      if (activeUid && auth.currentUser?.uid === activeUid) {
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
      const activeUser = auth.currentUser || user;
      if (!activeUser || !auth.currentUser || auth.currentUser.uid !== activeUser.uid) {
        return false;
      }
      const targetUid = activeUser.uid;
      const startEpoch = authSessionEpochRef.current;
      const isStillValid = () =>
        authSessionEpochRef.current === startEpoch &&
        auth.currentUser !== null &&
        auth.currentUser.uid === targetUid &&
        activeDataOwnerUidRef.current === targetUid;

      if (!isStillValid()) {
        return false;
      }

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

        if (!isStillValid()) {
          return false;
        }

        if (res.ok) {
          // Do NOT merge restoredShiftIds back in through mergeCloudTombstones / mergeCloudDeletedKeys
          const mergedTombstones = mergeCloudTombstones(
            tombstonesRef.current,
            res.cloudDeletedIds,
            effectiveRestored
          );
          const prunedTombstones = confirmAndPruneTombstones(mergedTombstones, res.freshCloudLogs);
          tombstonesRef.current = prunedTombstones;
          saveToStorage('deletedShifts', prunedTombstones, { expectedUid: targetUid });

          const mergedDeletedKeys = mergeCloudDeletedKeys(
            deletedKeysRef.current,
            res.cloudDeletedKeys,
            effectiveRestored
          );
          const prunedDeletedKeys = pruneDeletedShiftKeys(mergedDeletedKeys, res.freshCloudLogs);
          deletedKeysRef.current = prunedDeletedKeys;
          saveToStorage('deletedShiftKeys', prunedDeletedKeys, { expectedUid: targetUid });

          // Clear synced restored IDs now that Firestore removed them
          for (const rk of effectiveRestored) {
            pendingRestoredIdsRef.current.delete(rk);
          }
          saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current), {
            expectedUid: targetUid,
          });

          if (syncVersionRef.current === version) {
            knownCloudDatesRef.current = new Set(Object.keys(res.freshCloudLogs || safeLogs || {}));
            saveToStorage('pendingSync', 'false', { expectedUid: targetUid });
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
        if (notifyShiftToast && isStillValid()) {
          showToast('Sync failed: Unable to save changes to cloud.', 'error');
        }
        return false;
      } catch (err) {
        if (!isStillValid()) {
          return false;
        }
        setShowSavedIndicator(false);
        console.warn('Background cloud sync failed (queued locally):', err);
        if (notifyShiftToast) {
          showToast(`Sync failed: ${extractFriendlySyncError(err)}`, 'error');
        }
        return false;
      } finally {
        if (authSessionEpochRef.current === startEpoch) {
          inFlightSyncCountRef.current = Math.max(0, inFlightSyncCountRef.current - 1);
        }
      }
    },
    [user, syncToFirebase, saveToStorage, triggerSavedIndicator, showToast]
  );

  // Load helper for a specific user ID or explicit signed-out guest session
  const loadScopedData = useCallback(
    (uid: string | null) => {
      if (isInitializingAuth) {
        return;
      }

      if (uid) {
        // Verify this user is actually the active authenticated user
        const activeAuthUid = auth.currentUser?.uid || user?.uid || null;
        if (activeAuthUid !== uid) {
          return;
        }
        activeDataOwnerUidRef.current = uid;
        // Purge any leftover guest keys so guest storage can never hold previous schedule data
        clearGuestStorage();
      } else {
        activeDataOwnerUidRef.current = null;
        // Only load swa_guest_* if an explicit guest edit happened while signed out;
        // otherwise purge any stale/leaked swa_guest_* keys and keep clean default state.
        let hasExplicitGuestSession = false;
        try {
          hasExplicitGuestSession = localStorage.getItem(GUEST_EXPLICIT_SESSION_KEY) === '1';
        } catch {}

        if (!hasExplicitGuestSession) {
          clearGuestStorage();
          tombstonesRef.current = {};
          deletedKeysRef.current = {};
          pendingRestoredIdsRef.current.clear();
          knownCloudDatesRef.current.clear();
          const freshSettings = cloneDefaultSettings();
          const freshCardPrefs = cloneDefaultCardPrefs();
          latestStateRef.current = {
            logs: {},
            midCounts: {},
            fmlaCases: [],
            cardPrefs: freshCardPrefs,
            settings: freshSettings,
            lockedMonths: []
          };
          setLogs({});
          setLogsHistory([]);
          setMidCounts({});
          setFmlaCases([]);
          setSettings(freshSettings);
          setLockedMonths([]);
          setCardPrefs(freshCardPrefs);
          return;
        }
      }

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
          // Persist stable IDs back to the exact same scoped storage key (never guest if uid was provided)
          if (uid ? auth.currentUser?.uid === uid : auth.currentUser === null) {
            localStorage.setItem(getScopedKey('logs', uid), JSON.stringify(loadedLogs));
          }
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
      let loadedPrefs: CardPrefs = cloneDefaultCardPrefs();
      try {
        const storedPrefs = localStorage.getItem(getScopedKey('cardPrefs', uid));
        if (storedPrefs && storedPrefs !== 'undefined' && storedPrefs !== 'null') {
          loadedPrefs = JSON.parse(storedPrefs);
          setCardPrefs(loadedPrefs);
        } else {
          setCardPrefs(loadedPrefs);
        }
      } catch {
        setCardPrefs(cloneDefaultCardPrefs());
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
      const loadedSettings = cloneDefaultSettings();
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
    },
    [isInitializingAuth, user, hasCompletedLegacyIdMigration]
  );

  // Sync state lifecycle across authentication state changes.
  // Critically waits until isInitializingAuth is false before reading any localStorage schedule data.
  const currentUserUid = user?.uid || null;
  const prevUserUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (isInitializingAuth) {
      return;
    }

    // First resolution after Firebase Auth finishes initializing
    if (prevUserUid.current === undefined) {
      prevUserUid.current = currentUserUid;
      loadScopedData(currentUserUid);
      return;
    }

    // Auth state transition (sign-in, sign-out via onAuthStateChanged, or account switch)
    if (prevUserUid.current !== currentUserUid) {
      prevUserUid.current = currentUserUid;
      clearAllScheduleStateInMemory();
      clearGuestStorage();
      if (currentUserUid) {
        loadScopedData(currentUserUid);
      }
    }
  }, [isInitializingAuth, currentUserUid, loadScopedData, clearAllScheduleStateInMemory]);


  // Fetch real-time data from Firestore when user is present and auth initialization is complete
  useEffect(() => {
    if (isInitializingAuth || !user) return;

    const targetUid = user.uid;
    const effectEpoch = authSessionEpochRef.current;
    let isSubscribed = true;
    let unsubscribe: (() => void) | null = null;

    const isActiveSession = () =>
      isSubscribed &&
      authSessionEpochRef.current === effectEpoch &&
      auth.currentUser !== null &&
      auth.currentUser.uid === targetUid &&
      activeDataOwnerUidRef.current === targetUid;

    const unconfirmedCount = Object.values(tombstonesRef.current).filter(t => !t.cloudConfirmed).length;
    const shouldPushOneTimeIds = needsOneTimeLegacyIdSyncRef.current && !hasCompletedLegacyIdMigration(targetUid);

    // Push pending local mutations, unconfirmed tombstones, or one-time migrated legacy IDs
    if (
      isActiveSession() &&
      inFlightSyncCountRef.current === 0 &&
      (hasPendingLocalSync(targetUid) || unconfirmedCount > 0 || shouldPushOneTimeIds)
    ) {
      if (shouldPushOneTimeIds) {
        markLegacyIdMigrationComplete(targetUid);
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
      if (!isActiveSession()) {
        return;
      }

      if (docSnap.metadata?.hasPendingWrites || docSnap.metadata?.fromCache) {
        return;
      }

      if (!docSnap.exists()) {
        return;
      }

      const data = docSnap.data();
      const hasExistingLocalLogs = localStorage.getItem(getScopedKey('logs', targetUid)) !== null;
      const activeRestored = pendingRestoredIdsRef.current;

      // 1. Always merge deletedShiftIds AND deletedShiftKeys from other devices and immediately remove
      // any tombstoned shifts (by ID or content key) from the logs on screen without replacing other local data.
      if (data.deletedShiftIds && typeof data.deletedShiftIds === 'object') {
        const merged = mergeCloudTombstones(tombstonesRef.current, data.deletedShiftIds, activeRestored);
        tombstonesRef.current =
          data.logs && typeof data.logs === 'object'
            ? confirmAndPruneTombstones(merged, data.logs)
            : merged;
        saveToStorage('deletedShifts', tombstonesRef.current, { expectedUid: targetUid });
      }

      if (data.deletedShiftKeys && typeof data.deletedShiftKeys === 'object') {
        const mergedKeys = mergeCloudDeletedKeys(deletedKeysRef.current, data.deletedShiftKeys, activeRestored);
        deletedKeysRef.current =
          data.logs && typeof data.logs === 'object'
            ? pruneDeletedShiftKeys(mergedKeys, data.logs)
            : mergedKeys;
        saveToStorage('deletedShiftKeys', deletedKeysRef.current, { expectedUid: targetUid });
      }

      const hasAnyDeletes =
        Object.keys(tombstonesRef.current).length > 0 ||
        Object.keys(deletedKeysRef.current).length > 0 ||
        Boolean(data.deletedShiftIds && typeof data.deletedShiftIds === 'object') ||
        Boolean(data.deletedShiftKeys && typeof data.deletedShiftKeys === 'object');

      if (hasAnyDeletes) {
        if (!isActiveSession()) return;
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
        saveToStorage('logs', nextLocalLogs, { expectedUid: targetUid });
      }

      // 2. Never overwrite other local data when mutations are in-flight, recent, or happened in this session
      if (
        !isActiveSession() ||
        inFlightSyncCountRef.current > 0 ||
        syncVersionRef.current > 0 ||
        Date.now() - isLocalMutationRef.current < 10000 ||
        hasPendingLocalSync(targetUid)
      ) {
        return;
      }

      if (data.logs !== undefined) {
        const cloudMissingIds =
          !hasCompletedLegacyIdMigration(targetUid) && hasEntriesMissingIds(data.logs);

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
          if (!isActiveSession()) return;
          setLogs(filtered);
          latestStateRef.current.logs = filtered;
          saveToStorage('logs', filtered, { expectedUid: targetUid });

          // One time only, write any IDs created for old cloud shifts back to Firestore
          if (cloudMissingIds) {
            markLegacyIdMigrationComplete(targetUid);
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
          markLegacyIdMigrationComplete(targetUid);
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

      if (!isActiveSession()) return;

      if (data.midCounts !== undefined && !hasExistingLocalLogs) {
        const cleanMids = sanitizeForFirestore(data.midCounts) || {};
        setMidCounts(cleanMids);
        latestStateRef.current.midCounts = cleanMids;
        saveToStorage('mids', cleanMids, { expectedUid: targetUid });
      }

      if (data.fmlaCases && !hasExistingLocalLogs) {
        setFmlaCases(data.fmlaCases);
        latestStateRef.current.fmlaCases = data.fmlaCases;
        saveToStorage('fmla', data.fmlaCases, { expectedUid: targetUid });
      }

      if (data.cardPrefs && !hasExistingLocalLogs) {
        setCardPrefs(data.cardPrefs);
        latestStateRef.current.cardPrefs = data.cardPrefs;
        saveToStorage('cardPrefs', data.cardPrefs, { expectedUid: targetUid });
      }

      if (data.settings && Object.keys(data.settings).length > 0 && !hasExistingLocalLogs) {
        const merged = { ...defaultSettings, ...sanitizeForFirestore(data.settings) };
        setSettings(merged);
        latestStateRef.current.settings = merged;
        saveToStorage('settings', merged, { expectedUid: targetUid });
      }

      if (data.lockedMonths && !hasExistingLocalLogs) {
        setLockedMonths(data.lockedMonths);
        latestStateRef.current.lockedMonths = data.lockedMonths;
        saveToStorage('lockedMonths', data.lockedMonths, { expectedUid: targetUid });
      }
    };

    const startSnapshotListener = async () => {
      try {
        await user.getIdToken(false);
      } catch (tokenErr) {
        console.warn('Initial token verification warning:', tokenErr);
      }

      if (!isActiveSession()) return;

      const docRef = doc(db, 'users', targetUid);
      unsubscribe = onSnapshot(docRef, handleDocSnapshot, async (error) => {
        if (!isActiveSession()) return;
        const msg = error instanceof Error ? error.message : String(error);
        const isPerm = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient');

        if (isPerm) {
          try {
            await user.getIdToken(true);
            if (isActiveSession()) {
              if (unsubscribe) unsubscribe();
              unsubscribe = onSnapshot(docRef, handleDocSnapshot, (retryError) => {
                if (!isActiveSession()) return;
                reportSyncError(retryError);
                handleFirestoreError(retryError, OperationType.GET, `users/${targetUid}`);
              });
              activeSnapshotUnsubRef.current = unsubscribe;
              return;
            }
          } catch {
            // Token refresh failed
          }
        }
        if (!isActiveSession()) return;
        reportSyncError(error);
        handleFirestoreError(error, OperationType.GET, `users/${targetUid}`);
      });
      activeSnapshotUnsubRef.current = unsubscribe;
    };

    startSnapshotListener();

    return () => {
      isSubscribed = false;
      if (unsubscribe) {
        unsubscribe();
        if (activeSnapshotUnsubRef.current === unsubscribe) {
          activeSnapshotUnsubRef.current = null;
        }
      }
    };
  }, [
    isInitializingAuth,
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
      if (
        isInitializingAuth ||
        !activeUser ||
        !auth.currentUser ||
        auth.currentUser.uid !== activeUser.uid ||
        activeDataOwnerUidRef.current !== activeUser.uid ||
        inFlightSyncCountRef.current > 0
      ) {
        return;
      }

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
  }, [isInitializingAuth, user, hasPendingLocalSync, runBackgroundSync]);

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
      const saveOpts = getInteractiveSaveOptions();
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

      saveToStorage('deletedShifts', tombstonesRef.current, saveOpts);
      saveToStorage('deletedShiftKeys', deletedKeysRef.current, saveOpts);
      saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current), saveOpts);

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
      saveToStorage('pendingSync', 'true', saveOpts);
      saveToStorage('logs', processedLogs, saveOpts);

      if (auth.currentUser) {
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
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync, showToast]
  );

  const undoLogs = useCallback(() => {
    if (logsHistory.length === 0) return;
    const saveOpts = getInteractiveSaveOptions();
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
    saveToStorage('deletedShifts', tombstonesRef.current, saveOpts);
    saveToStorage('deletedShiftKeys', deletedKeysRef.current, saveOpts);
    saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current), saveOpts);

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
    saveToStorage('pendingSync', 'true', saveOpts);
    saveToStorage('logs', previous, saveOpts);
    if (auth.currentUser) {
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
  }, [logsHistory, getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync, showToast]);

  const updateMidCounts = useCallback(
    (newMids: MidCountsState) => {
      const saveOpts = getInteractiveSaveOptions();
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      setMidCounts(newMids);
      latestStateRef.current.midCounts = newMids;
      saveToStorage('pendingSync', 'true', saveOpts);
      saveToStorage('mids', newMids, saveOpts);
      if (auth.currentUser) {
        runBackgroundSync({ ...latestStateRef.current, midCounts: newMids }, [], version, true);
      } else {
        triggerSavedIndicator();
      }
    },
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const updateFmlaCases = useCallback(
    (newCases: FmlaCase[]) => {
      const saveOpts = getInteractiveSaveOptions();
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      setFmlaCases(newCases);
      latestStateRef.current.fmlaCases = newCases;
      saveToStorage('pendingSync', 'true', saveOpts);
      saveToStorage('fmla', newCases, saveOpts);
      if (auth.currentUser) {
        runBackgroundSync({ ...latestStateRef.current, fmlaCases: newCases }, [], version, true);
      } else {
        triggerSavedIndicator();
      }
    },
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const updateSettings = useCallback(
    (
      newSettings: Partial<Settings>,
      options?: boolean | { silentIndicator?: boolean; localOnly?: boolean }
    ) => {
      const saveOpts = getInteractiveSaveOptions();
      const silentIndicator =
        typeof options === 'boolean' ? options : Boolean(options?.silentIndicator);
      const localOnly = typeof options === 'object' ? Boolean(options?.localOnly) : false;

      const updated = { ...latestStateRef.current.settings, ...newSettings };
      setSettings(updated);
      latestStateRef.current.settings = updated;
      saveToStorage('settings', updated, saveOpts);

      if (localOnly) {
        return;
      }

      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      saveToStorage('pendingSync', 'true', saveOpts);
      if (auth.currentUser) {
        runBackgroundSync({ ...latestStateRef.current, settings: updated }, [], version, !silentIndicator);
      } else if (!silentIndicator) {
        triggerSavedIndicator();
      }
    },
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const overwriteSettings = useCallback(
    (allSettings: Settings) => {
      if (!allSettings || typeof allSettings !== 'object') return;
      const saveOpts = getInteractiveSaveOptions();
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      const mergedSettings = { ...defaultSettings, ...allSettings };
      setSettings(mergedSettings);
      latestStateRef.current.settings = mergedSettings;
      saveToStorage('pendingSync', 'true', saveOpts);
      saveToStorage('settings', mergedSettings, saveOpts);
      if (auth.currentUser) {
        runBackgroundSync({ ...latestStateRef.current, settings: mergedSettings }, [], version, true);
      } else {
        triggerSavedIndicator();
      }
    },
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const updateCardPrefs = useCallback(
    (newPrefs: CardPrefs) => {
      const saveOpts = getInteractiveSaveOptions();
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      setCardPrefs(newPrefs);
      latestStateRef.current.cardPrefs = newPrefs;
      saveToStorage('pendingSync', 'true', saveOpts);
      saveToStorage('cardPrefs', newPrefs, saveOpts);
      if (auth.currentUser) {
        runBackgroundSync({ ...latestStateRef.current, cardPrefs: newPrefs }, [], version, true);
      } else {
        triggerSavedIndicator();
      }
    },
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

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
    const saveOpts = getInteractiveSaveOptions();
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
    saveToStorage('deletedShifts', tombstonesRef.current, saveOpts);
    saveToStorage('deletedShiftKeys', deletedKeysRef.current, saveOpts);
    saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current), saveOpts);

    const removedDates = Array.from(new Set([
      ...Object.keys(latestStateRef.current.logs || {}),
      ...Array.from(knownCloudDatesRef.current)
    ]));
    knownCloudDatesRef.current.clear();

    setLogs({});
    setMidCounts({});
    latestStateRef.current.logs = {};
    latestStateRef.current.midCounts = {};
    saveToStorage('pendingSync', 'true', saveOpts);
    saveToStorage('logs', {}, saveOpts);
    saveToStorage('mids', {}, saveOpts);

    if (auth.currentUser) {
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
  }, [getInteractiveSaveOptions, saveToStorage, runBackgroundSync, triggerSavedIndicator, showToast]);

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

  const updateLockedMonths = useCallback(
    (nextLockedMonths: string[]) => {
      const saveOpts = getInteractiveSaveOptions();
      const cleaned = Array.isArray(nextLockedMonths) ? nextLockedMonths : [];
      isLocalMutationRef.current = Date.now();
      const version = ++syncVersionRef.current;
      setLockedMonths(cleaned);
      latestStateRef.current.lockedMonths = cleaned;
      saveToStorage('pendingSync', 'true', saveOpts);
      saveToStorage('lockedMonths', cleaned, saveOpts);
      if (auth.currentUser) {
        runBackgroundSync({ ...latestStateRef.current, lockedMonths: cleaned }, [], version, true);
      } else {
        triggerSavedIndicator();
      }
    },
    [getInteractiveSaveOptions, saveToStorage, triggerSavedIndicator, runBackgroundSync]
  );

  const toggleLockMonth = useCallback(
    (year: number, month: number) => {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const prev = latestStateRef.current.lockedMonths || [];
      const updated = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      updateLockedMonths(updated);
    },
    [updateLockedMonths]
  );

  const pullFromCloud = useCallback(async () => {
    const activeUser = auth.currentUser || user;
    if (!activeUser || !auth.currentUser || auth.currentUser.uid !== activeUser.uid) {
      return false;
    }

    const targetUid = activeUser.uid;
    const startEpoch = authSessionEpochRef.current;
    const isStillValid = () =>
      authSessionEpochRef.current === startEpoch &&
      auth.currentUser !== null &&
      auth.currentUser.uid === targetUid &&
      activeDataOwnerUidRef.current === targetUid;

    if (!isStillValid()) return false;

    setCloudSyncState('syncing');

    const waitStart = Date.now();
    while (inFlightSyncCountRef.current > 0 && Date.now() - waitStart < 3500) {
      if (!isStillValid()) return false;
      await new Promise(r => setTimeout(r, 100));
    }

    if (!isStillValid()) return false;

    const docRef = doc(db, 'users', targetUid);
    try {
      let data: any = null;

      try {
        const restData = await directRestPull(activeUser);
        if (!isStillValid()) return false;
        if (restData?.__notFound) {
          reportSyncSuccess();
          return false;
        }
        if (restData && typeof restData === 'object') {
          data = restData;
        }
      } catch (restErr: any) {
        if (!isStillValid()) return false;
        const msg = restErr instanceof Error ? restErr.message : String(restErr);
        if (msg.includes('HTTP 4')) {
          throw restErr;
        }
        const docSnap = await getDocFromServer(docRef);
        if (!isStillValid()) return false;
        if (!docSnap || !docSnap.exists()) {
          reportSyncSuccess();
          return false;
        }
        data = docSnap.data();
      }

      if (!isStillValid()) return false;

      if (data && typeof data === 'object') {
        const cloudHadInvalidKeys =
          Boolean((data as any)?._hadInvalidCloudKeys) ||
          hasInvalidFirestoreKeys(data.logs) ||
          hasInvalidFirestoreKeys(data.midCounts) ||
          hasInvalidFirestoreKeys(data.deletedShiftIds) ||
          hasInvalidFirestoreKeys(data.deletedShiftKeys) ||
          hasInvalidFirestoreKeys(data.settings);

        const cloudMissingLegacyIds =
          !hasCompletedLegacyIdMigration(targetUid) && hasEntriesMissingIds(data.logs);
        if (cloudMissingLegacyIds) {
          markLegacyIdMigrationComplete(targetUid);
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

        if (!isStillValid()) return false;

        // Confirm tombstones strictly against the fresh read of the cloud copy
        tombstonesRef.current = confirmAndPruneTombstones(mergedTombstones, rawCloudLogsNormalized);
        deletedKeysRef.current = pruneDeletedShiftKeys(mergedDeletedKeys, rawCloudLogsNormalized);
        saveToStorage('deletedShifts', tombstonesRef.current, { expectedUid: targetUid });
        saveToStorage('deletedShiftKeys', deletedKeysRef.current, { expectedUid: targetUid });

        knownCloudDatesRef.current = new Set(Object.keys(finalCloudLogs));

        const needsCloudCleanupPush =
          cloudHadStaleDeletedShifts || cloudHadInvalidKeys || cloudMissingLegacyIds;

        setLogs(finalCloudLogs);
        latestStateRef.current.logs = finalCloudLogs;
        saveToStorage('logs', finalCloudLogs, { expectedUid: targetUid });
        saveToStorage('pendingSync', needsCloudCleanupPush ? 'true' : 'false', {
          expectedUid: targetUid,
        });

        const cloudMids =
          data.midCounts && typeof data.midCounts === 'object'
            ? sanitizeForFirestore(data.midCounts) || {}
            : {};
        setMidCounts(cloudMids);
        latestStateRef.current.midCounts = cloudMids;
        saveToStorage('mids', cloudMids, { expectedUid: targetUid });

        if (Array.isArray(data.fmlaCases)) {
          const cleanFmla = sanitizeForFirestore(data.fmlaCases) || [];
          setFmlaCases(cleanFmla);
          latestStateRef.current.fmlaCases = cleanFmla;
          saveToStorage('fmla', cleanFmla, { expectedUid: targetUid });
        }
        if (data.cardPrefs && typeof data.cardPrefs === 'object') {
          const cleanPrefs = sanitizeForFirestore(data.cardPrefs) || cloneDefaultCardPrefs();
          setCardPrefs(cleanPrefs);
          latestStateRef.current.cardPrefs = cleanPrefs;
          saveToStorage('cardPrefs', cleanPrefs, { expectedUid: targetUid });
        }
        if (data.settings && typeof data.settings === 'object' && Object.keys(data.settings).length > 0) {
          const cleanSettings = sanitizeForFirestore(data.settings) || {};
          const merged = { ...defaultSettings, ...cleanSettings };
          setSettings(merged);
          latestStateRef.current.settings = merged;
          saveToStorage('settings', merged, { expectedUid: targetUid });
        }
        if (Array.isArray(data.lockedMonths)) {
          setLockedMonths(data.lockedMonths);
          latestStateRef.current.lockedMonths = data.lockedMonths;
          saveToStorage('lockedMonths', data.lockedMonths, { expectedUid: targetUid });
        }

        if (!isStillValid()) return false;
        reportSyncSuccess();

        // Never resurrect on Pull: if cloud copy still had any deleted shift (by ID or content key),
        // invalid keys, or un-migrated legacy shift IDs, push the cleaned copy back right away.
        if (needsCloudCleanupPush && isStillValid()) {
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

      if (!isStillValid()) return false;
      reportSyncSuccess();
      return false;
    } catch (e: any) {
      if (!isStillValid()) return false;
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
    if (!activeUser || !auth.currentUser || auth.currentUser.uid !== activeUser.uid) {
      return false;
    }
    const targetUid = activeUser.uid;
    const startEpoch = authSessionEpochRef.current;
    const isStillValid = () =>
      authSessionEpochRef.current === startEpoch &&
      auth.currentUser !== null &&
      auth.currentUser.uid === targetUid &&
      activeDataOwnerUidRef.current === targetUid;

    if (!isStillValid()) return false;

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
        cardPrefs: latestStateRef.current.cardPrefs || cloneDefaultCardPrefs(),
        settings: latestStateRef.current.settings || cloneDefaultSettings(),
        lockedMonths: latestStateRef.current.lockedMonths || []
      };

      setLogs(cleanedLogs);
      latestStateRef.current.logs = cleanedLogs;
      saveToStorage('logs', cleanedLogs, { expectedUid: targetUid });

      const res = await syncToFirebase(fullData, true, removedDates, effectiveRestored, false);
      if (!isStillValid()) {
        return false;
      }

      if (res.ok) {
        const mergedTombstones = mergeCloudTombstones(
          tombstonesRef.current,
          res.cloudDeletedIds,
          effectiveRestored
        );
        const prunedTombstones = confirmAndPruneTombstones(mergedTombstones, res.freshCloudLogs);
        tombstonesRef.current = prunedTombstones;
        saveToStorage('deletedShifts', prunedTombstones, { expectedUid: targetUid });

        const mergedDeletedKeys = mergeCloudDeletedKeys(
          deletedKeysRef.current,
          res.cloudDeletedKeys,
          effectiveRestored
        );
        const prunedDeletedKeys = pruneDeletedShiftKeys(mergedDeletedKeys, res.freshCloudLogs);
        deletedKeysRef.current = prunedDeletedKeys;
        saveToStorage('deletedShiftKeys', prunedDeletedKeys, { expectedUid: targetUid });

        for (const rk of effectiveRestored) {
          pendingRestoredIdsRef.current.delete(rk);
        }
        saveToStorage('pendingRestoredIds', Array.from(pendingRestoredIdsRef.current), {
          expectedUid: targetUid,
        });

        knownCloudDatesRef.current = new Set(Object.keys(res.freshCloudLogs || cleanedLogs));
        if (syncVersionRef.current === version) {
          saveToStorage('pendingSync', 'false', { expectedUid: targetUid });
        }
        triggerSavedIndicator();
        return true;
      }
      setShowSavedIndicator(false);
      return false;
    } catch (e) {
      if (!isStillValid()) return false;
      setShowSavedIndicator(false);
      console.warn('Force sync to cloud failed:', e);
      throw e;
    } finally {
      if (authSessionEpochRef.current === startEpoch) {
        inFlightSyncCountRef.current = Math.max(0, inFlightSyncCountRef.current - 1);
      }
    }
  }, [user, syncToFirebase, saveToStorage, triggerSavedIndicator]);

  const logout = useCallback(async () => {
    prevUserUid.current = null;
    clearAllScheduleStateInMemory();
    clearGuestStorage();
    await firebaseLogout();
    clearGuestStorage();
  }, [firebaseLogout, clearAllScheduleStateInMemory]);

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
    lockedMonths, toggleLockMonth, setLockedMonths, updateLockedMonths,
    showSavedIndicator, syncToGoogleSheets, googleAccessToken, forceSyncToCloud, pullFromCloud
  };
};
