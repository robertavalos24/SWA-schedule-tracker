import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, CardPrefs, FmlaCase, LogsState, MidCountsState, ThemeType } from '../types';
import { autoAssignWorkedHolidays } from '../utils/calculations';
import { useFirebaseSync, directRestPull } from './useFirebaseSync';
import { doc, onSnapshot, getDoc, getDocFromCache } from 'firebase/firestore';

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
      const storageKey = getScopedKey(key, user?.uid);
      localStorage.setItem(storageKey, typeof data === 'object' ? JSON.stringify(data) : String(data));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [user]);

  // Load helper for a specific user ID or guest
  const loadScopedData = useCallback((uid: string | null) => {
    // 1. Logs
    try {
      const storedLogs = localStorage.getItem(getScopedKey('logs', uid));
      if (storedLogs && storedLogs !== 'undefined' && storedLogs !== 'null') {
        setLogs(JSON.parse(storedLogs));
      } else {
        setLogs({});
      }
    } catch {
      setLogs({});
    }

    // 2. MidCounts
    try {
      const storedMids = localStorage.getItem(getScopedKey('mids', uid));
      if (storedMids && storedMids !== 'undefined' && storedMids !== 'null') {
        setMidCounts(JSON.parse(storedMids));
      } else {
        setMidCounts({});
      }
    } catch {
      setMidCounts({});
    }

    // 3. CardPrefs
    try {
      const storedPrefs = localStorage.getItem(getScopedKey('cardPrefs', uid));
      if (storedPrefs && storedPrefs !== 'undefined' && storedPrefs !== 'null') {
        setCardPrefs(JSON.parse(storedPrefs));
      } else {
        setCardPrefs(defaultCardPrefs);
      }
    } catch {
      setCardPrefs(defaultCardPrefs);
    }

    // 4. FmlaCases
    try {
      const storedFmla = localStorage.getItem(getScopedKey('fmla', uid));
      if (storedFmla && storedFmla !== 'undefined' && storedFmla !== 'null') {
        setFmlaCases(JSON.parse(storedFmla));
      } else {
        setFmlaCases([]);
      }
    } catch {
      setFmlaCases([]);
    }

    // 5. LockedMonths
    try {
      const storedLockedMonths = localStorage.getItem(getScopedKey('lockedMonths', uid));
      if (storedLockedMonths && storedLockedMonths !== 'undefined' && storedLockedMonths !== 'null') {
        setLockedMonths(JSON.parse(storedLockedMonths));
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
      if (currentUserUid) {
        // Logged in: load user's scoped local data while Firestore attaches
        loadScopedData(currentUserUid);
      } else {
        // Logged out: immediately wipe in-memory state back to clean blank template
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

    const handleDocSnapshot = (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.logs) {
          setLogs(data.logs);
          saveToStorage('logs', data.logs);
        }

        if (data.midCounts) {
          setMidCounts(data.midCounts);
          saveToStorage('mids', data.midCounts);
        }
        
        if (data.fmlaCases) {
          setFmlaCases(data.fmlaCases);
          saveToStorage('fmla', data.fmlaCases);
        }

        if (data.cardPrefs) {
          setCardPrefs(data.cardPrefs);
          saveToStorage('cardPrefs', data.cardPrefs);
        }
        
        if (data.settings && Object.keys(data.settings).length > 0) {
          const merged = { ...defaultSettings, ...data.settings };
          setSettings(merged);
          saveToStorage('settings', merged);
        }

        if (data.lockedMonths) {
          setLockedMonths(data.lockedMonths);
          saveToStorage('lockedMonths', data.lockedMonths);
        }
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
                handleFirestoreError(retryError, OperationType.GET, `users/${user.uid}`);
              });
              return;
            }
          } catch {
            // Token refresh failed
          }
        }
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      });
    };

    startSnapshotListener();

    return () => {
      isSubscribed = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user, db, saveToStorage, handleFirestoreError, OperationType]);

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

  const updateLogs = useCallback((newLogs: LogsState) => {
    const processedLogs = autoAssignWorkedHolidays(newLogs);
    setLogsHistory(hist => {
      const newHist = [...hist, logs];
      return newHist.slice(-20);
    });
    setLogs(processedLogs);
    saveToStorage('logs', processedLogs);
    if (user) {
      syncToFirebase({ logs: processedLogs });
    }
    triggerSavedIndicator();
  }, [logs, user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const undoLogs = useCallback(() => {
    if (logsHistory.length === 0) return;
    const previous = logsHistory[logsHistory.length - 1];
    setLogs(previous);
    setLogsHistory(hist => hist.slice(0, -1));
    saveToStorage('logs', previous);
    if (user) {
      syncToFirebase({ logs: previous });
    }
    triggerSavedIndicator();
  }, [logsHistory, user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const updateMidCounts = useCallback((newMids: MidCountsState) => {
    setMidCounts(newMids);
    saveToStorage('mids', newMids);
    if (user) {
      syncToFirebase({ midCounts: newMids });
    }
    triggerSavedIndicator();
  }, [user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const updateFmlaCases = useCallback((newCases: FmlaCase[]) => {
    setFmlaCases(newCases);
    saveToStorage('fmla', newCases);
    if (user) {
      syncToFirebase({ fmlaCases: newCases });
    }
    triggerSavedIndicator();
  }, [user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveToStorage('settings', updated);
    if (user) {
      syncToFirebase({ settings: updated });
    }
    triggerSavedIndicator();
  }, [settings, user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const overwriteSettings = useCallback((allSettings: Settings) => {
    if (!allSettings || typeof allSettings !== 'object') return;
    const mergedSettings = { ...defaultSettings, ...allSettings };
    setSettings(mergedSettings);
    saveToStorage('settings', mergedSettings);
    if (user) {
      syncToFirebase({ settings: mergedSettings });
    }
    triggerSavedIndicator();
  }, [user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const updateCardPrefs = useCallback((newPrefs: CardPrefs) => {
    setCardPrefs(newPrefs);
    saveToStorage('cardPrefs', newPrefs);
    if (user) {
      syncToFirebase({ cardPrefs: newPrefs });
    }
    triggerSavedIndicator();
  }, [user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

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

  const clearLogs = () => {
    updateLogs({});
    updateMidCounts({});
    if (user) {
      syncToFirebase({ logs: {}, midCounts: {} });
    }
  };

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
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    setLockedMonths(prev => {
      const updated = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      saveToStorage('lockedMonths', updated);
      if (user) {
        syncToFirebase({ lockedMonths: updated });
      }
      return updated;
    });
    triggerSavedIndicator();
  }, [user, saveToStorage, triggerSavedIndicator, syncToFirebase]);

  const pullFromCloud = useCallback(async () => {
    if (!user) return false;
    const docRef = doc(db, 'users', user.uid);
    try {
      let docSnap;
      try {
        docSnap = await getDoc(docRef);
      } catch (getErr: any) {
        const msg = getErr instanceof Error ? getErr.message : String(getErr);
        if (msg.toLowerCase().includes('offline') || msg.toLowerCase().includes('unavailable') || getErr?.code === 'unavailable') {
          try {
            docSnap = await getDocFromCache(docRef);
          } catch {
            return false;
          }
        } else if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient') || getErr?.code === 'permission-denied') {
          try {
            await user.getIdToken(true);
            docSnap = await getDoc(docRef);
          } catch (retryErr) {
            throw retryErr;
          }
        } else {
          throw getErr;
        }
      }

      if (!docSnap || !docSnap.exists()) {
        try {
          const restData = await directRestPull(user);
          if (restData) {
            docSnap = { exists: () => true, data: () => restData } as any;
          }
        } catch (restErr) {
          console.warn('Direct REST pull fallback note:', restErr);
        }
      }

      if (docSnap && docSnap.exists()) {
        const data = docSnap.data();
        let loaded = false;
        if (data.logs && Object.keys(data.logs).length > 0) {
          setLogs(data.logs);
          saveToStorage('logs', data.logs);
          loaded = true;
        }
        if (data.midCounts) {
          setMidCounts(data.midCounts);
          saveToStorage('mids', data.midCounts);
        }
        if (data.fmlaCases) {
          setFmlaCases(data.fmlaCases);
          saveToStorage('fmla', data.fmlaCases);
        }
        if (data.cardPrefs) {
          setCardPrefs(data.cardPrefs);
          saveToStorage('cardPrefs', data.cardPrefs);
        }
        if (data.settings && Object.keys(data.settings).length > 0) {
          const merged = { ...defaultSettings, ...data.settings };
          setSettings(merged);
          saveToStorage('settings', merged);
          loaded = true;
        }
        if (data.lockedMonths) {
          setLockedMonths(data.lockedMonths);
          saveToStorage('lockedMonths', data.lockedMonths);
        }
        return loaded;
      } else {
        return false;
      }
    } catch (e: any) {
      console.warn('Pull from cloud skipped/failed:', e);
      return false;
    }
  }, [user, db, saveToStorage]);

  const forceSyncToCloud = useCallback(async () => {
    if (!user) return false;
    try {
      const success = await syncToFirebase({
        logs,
        midCounts,
        fmlaCases,
        cardPrefs,
        settings,
        lockedMonths
      });
      if (success) {
        triggerSavedIndicator();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Force sync to cloud failed:', e);
      throw e;
    }
  }, [user, logs, midCounts, fmlaCases, cardPrefs, settings, lockedMonths, syncToFirebase, triggerSavedIndicator]);

  // Clean logout wrapper: immediately purges all sensitive in-memory state
  const logout = useCallback(async () => {
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
