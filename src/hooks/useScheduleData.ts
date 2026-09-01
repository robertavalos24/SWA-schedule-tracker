import { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, Settings, CardPrefs, FmlaCase, LogsState, MidCountsState, ThemeType } from '../types';
import { autoAssignWorkedHolidays } from '../utils/calculations';
import { useFirebaseSync } from './useFirebaseSync';
import { doc, onSnapshot, getDoc, getDocFromCache } from 'firebase/firestore';

const LOGS_KEY = 'swa_logs_main';
const MIDS_KEY = 'swa_midCounts_main';
const PREFS_KEY = 'swa_card_prefs_main';
const FMLA_KEY = 'swa_fmlaCases';

const themes: ThemeType[] = ['light', 'dark', 'ocean', 'sunset', 'forest'];

const defaultSettings: Settings = {

  hireDate: '',
  asOfDate: '',
  startPto: '0',
  correctionDate: '',
  correctionStartPto: '0',
  accrualChangeDate: '',
  customAccrualRate: '',
  customAccrualCap: '',
  salary: '$60,000.00',
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
  baseYear: '2026',
  enableTaxes: 'false',
  taxFilingStatus: 'single',
  taxDependents: '0',
  fedTaxExempt: 'false',
  payHistory: [
    { id: '1', date: '2026-03-01', type: 'Raise', oldSalary: '$86,973.69', newSalary: '$89,582.90', note: 'Merit > Performance' },
    { id: '2', date: '2025-12-16', type: 'Adjustment', oldSalary: '$82,832.09', newSalary: '$86,973.69', note: 'Proficiency Adjustment' },
    { id: '3', date: '2025-03-01', type: 'Raise', oldSalary: '$80,419.50', newSalary: '$82,832.09', note: 'Merit > Performance' },
    { id: '4', date: '2024-03-01', type: 'Raise', oldSalary: '$77,700.00', newSalary: '$80,419.50', note: 'Merit > Performance' },
    { id: '5', date: '2023-10-01', type: 'Promotion', oldSalary: '$64,894.50', newSalary: '$77,700.00', note: 'Job Change' },
    { id: '6', date: '2023-03-01', type: 'Raise', oldSalary: '$62,700.00', newSalary: '$64,894.50', note: 'Merit > Performance' },
    { id: '7', date: '2022-11-01', type: 'Promotion', oldSalary: '$58,941.96', newSalary: '$62,700.00', note: 'Job Change' },
    { id: '8', date: '2022-07-01', type: 'Adjustment', oldSalary: '$53,583.60', newSalary: '$58,941.96', note: 'Market Adjustment' },
    { id: '9', date: '2022-04-01', type: 'Raise', oldSalary: '$52,022.80', newSalary: '$53,583.60', note: 'Assign Merit Plan' },
    { id: '10', date: '2021-10-01', type: 'Adjustment', oldSalary: '$52,020.80', newSalary: '$52,022.80', note: 'Conversion' },
    { id: '11', date: '2021-09-01', type: 'Adjustment', oldSalary: '$50,024.00', newSalary: '$52,020.80', note: 'Market Adjustment ($25.01/hr)' },
    { id: '12', date: '2021-04-01', type: 'Raise', oldSalary: '', newSalary: '$50,024.00', note: 'Assign Merit Plan ($24.05/hr)' }
  ]
};

const defaultCardPrefs: CardPrefs = {
  timeoff: true,
  att: true,
  mid: true,
  pay: true,
  cardOrder: ['timeoff', 'att', 'mid', 'pay']
};

export const useScheduleData = () => {
  const { user, googleAccessToken, isInitializingAuth, login, logout, syncToFirebase, syncToGoogleSheets, db, handleFirestoreError, OperationType } = useFirebaseSync();

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

  // Fetch data from Firestore when user is present
  useEffect(() => {
    if (!user) return;
    
    const docRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.logs) {
          setLogs(data.logs);
          localStorage.setItem(LOGS_KEY, JSON.stringify(data.logs));
        }

        if (data.midCounts) {
          setMidCounts(data.midCounts);
          localStorage.setItem(MIDS_KEY, JSON.stringify(data.midCounts));
        }
        
        if (data.fmlaCases) {
          setFmlaCases(data.fmlaCases);
          localStorage.setItem(FMLA_KEY, JSON.stringify(data.fmlaCases));
        }

        if (data.cardPrefs) {
          setCardPrefs(data.cardPrefs);
          localStorage.setItem(PREFS_KEY, JSON.stringify(data.cardPrefs));
        }
        
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettings(data.settings);
          (Object.keys(data.settings) as Array<keyof Settings>).forEach(key => {
            const val = data.settings[key];
            localStorage.setItem('swa_' + key, typeof val === 'object' ? JSON.stringify(val) : String(val));
          });
        }

        if (data.lockedMonths) {
          setLockedMonths(data.lockedMonths);
          localStorage.setItem('swa_lockedMonths', JSON.stringify(data.lockedMonths));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, db]);

  // Load from local storage initially
  useEffect(() => {
    try {
      const storedLogs = localStorage.getItem(LOGS_KEY);
      if (storedLogs && storedLogs !== "undefined" && storedLogs !== "null") {
        setLogs(JSON.parse(storedLogs));
      }
    } catch (e) {
      console.error('Failed to parse stored logs:', e);
      setLogs({});
    }

    try {
      const storedMids = localStorage.getItem(MIDS_KEY);
      if (storedMids && storedMids !== "undefined" && storedMids !== "null") {
        setMidCounts(JSON.parse(storedMids));
      }
    } catch (e) {
      console.error('Failed to parse stored midCounts:', e);
      setMidCounts({});
    }

    try {
      const storedPrefs = localStorage.getItem(PREFS_KEY);
      if (storedPrefs && storedPrefs !== "undefined" && storedPrefs !== "null") {
        setCardPrefs(JSON.parse(storedPrefs));
      }
    } catch (e) {
      console.error('Failed to parse stored cardPrefs:', e);
      setCardPrefs(defaultCardPrefs);
    }

    try {
      const storedFmla = localStorage.getItem(FMLA_KEY);
      if (storedFmla && storedFmla !== "undefined" && storedFmla !== "null") {
        setFmlaCases(JSON.parse(storedFmla));
      }
    } catch (e) {
      console.error('Failed to parse stored fmlaCases:', e);
      setFmlaCases([]);
    }

    const storedTheme = localStorage.getItem('swa_theme') as ThemeType;
    if (storedTheme && themes.includes(storedTheme)) setTheme(storedTheme);

    const storedLocked = localStorage.getItem('swa_isLocked');
    if (storedLocked === 'true') setIsLocked(true);

    const storedLockedMonths = localStorage.getItem('swa_lockedMonths');
    if (storedLockedMonths) {
      try {
        setLockedMonths(JSON.parse(storedLockedMonths));
      } catch (e) {
        setLockedMonths([]);
      }
    }

    const loadedSettings = { ...defaultSettings };
    (Object.keys(defaultSettings) as Array<keyof Settings>).forEach(key => {
      const val = localStorage.getItem('swa_' + key);
      if (val !== null && val !== "undefined" && val !== "null") {
        if (key === 'payHistory') {
          try {
            (loadedSettings as any)[key] = JSON.parse(val);
          } catch (e) {
            (loadedSettings as any)[key] = [];
          }
        } else {
          (loadedSettings as any)[key] = val;
        }
      }
    });
    setSettings(loadedSettings);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('swa_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('swa_isLocked', String(isLocked));
  }, [isLocked]);

  const updateLogs = useCallback((newLogs: LogsState) => {
    const processedLogs = autoAssignWorkedHolidays(newLogs);
    setLogsHistory(hist => {
      const newHist = [...hist, logs];
      return newHist.slice(-20);
    });
    setLogs(processedLogs);
    localStorage.setItem(LOGS_KEY, JSON.stringify(processedLogs));
    syncToFirebase({ logs: processedLogs });
    triggerSavedIndicator();
  }, [logs, triggerSavedIndicator, syncToFirebase]);

  const undoLogs = useCallback(() => {
    if (logsHistory.length === 0) return;
    const previous = logsHistory[logsHistory.length - 1];
    setLogs(previous);
    setLogsHistory(hist => hist.slice(0, -1));
    localStorage.setItem(LOGS_KEY, JSON.stringify(previous));
    syncToFirebase({ logs: previous });
    triggerSavedIndicator();
  }, [logsHistory, triggerSavedIndicator, syncToFirebase]);

  const updateMidCounts = useCallback((newMids: MidCountsState) => {
    setMidCounts(newMids);
    localStorage.setItem(MIDS_KEY, JSON.stringify(newMids));
    syncToFirebase({ midCounts: newMids });
    triggerSavedIndicator();
  }, [triggerSavedIndicator, syncToFirebase]);

  const updateFmlaCases = useCallback((newCases: FmlaCase[]) => {
    setFmlaCases(newCases);
    localStorage.setItem(FMLA_KEY, JSON.stringify(newCases));
    syncToFirebase({ fmlaCases: newCases });
    triggerSavedIndicator();
  }, [triggerSavedIndicator, syncToFirebase]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    (Object.keys(updated) as Array<keyof Settings>).forEach(key => {
      const value = updated[key];
      if (key === 'payHistory') {
        localStorage.setItem('swa_' + key, JSON.stringify(value));
      } else {
        localStorage.setItem('swa_' + key, String(value));
      }
    });
    syncToFirebase({ settings: updated });
    triggerSavedIndicator();
  }, [settings, triggerSavedIndicator, syncToFirebase]);

  const overwriteSettings = useCallback((allSettings: Settings) => {
    if (!allSettings || typeof allSettings !== 'object') return;
    const mergedSettings = { ...defaultSettings, ...allSettings };
    setSettings(mergedSettings);
    (Object.keys(mergedSettings) as Array<keyof Settings>).forEach(key => {
      const value = mergedSettings[key];
      if (key === 'payHistory') {
        localStorage.setItem('swa_' + key, JSON.stringify(value));
      } else {
        localStorage.setItem('swa_' + key, String(value));
      }
    });
    syncToFirebase({ settings: mergedSettings });
    triggerSavedIndicator();
  }, [triggerSavedIndicator, syncToFirebase]);

  const updateCardPrefs = useCallback((newPrefs: CardPrefs) => {
    setCardPrefs(newPrefs);
    localStorage.setItem(PREFS_KEY, JSON.stringify(newPrefs));
    syncToFirebase({ cardPrefs: newPrefs });
    triggerSavedIndicator();
  }, [triggerSavedIndicator, syncToFirebase]);

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
    syncToFirebase({ logs: {}, midCounts: {} });
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
      localStorage.setItem('swa_lockedMonths', JSON.stringify(updated));
      syncToFirebase({ lockedMonths: updated });
      return updated;
    });
    triggerSavedIndicator();
  }, [triggerSavedIndicator, syncToFirebase]);

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
          // If offline, attempt retrieval from local cache
          try {
            docSnap = await getDocFromCache(docRef);
          } catch {
            console.warn('Pull from cloud: offline and document not present in local cache.');
            return false;
          }
        } else {
          throw getErr;
        }
      }

      if (docSnap && docSnap.exists()) {
        const data = docSnap.data();
        if (data.logs) {
          setLogs(data.logs);
          localStorage.setItem(LOGS_KEY, JSON.stringify(data.logs));
        }
        if (data.midCounts) {
          setMidCounts(data.midCounts);
          localStorage.setItem(MIDS_KEY, JSON.stringify(data.midCounts));
        }
        if (data.fmlaCases) {
          setFmlaCases(data.fmlaCases);
          localStorage.setItem(FMLA_KEY, JSON.stringify(data.fmlaCases));
        }
        if (data.cardPrefs) {
          setCardPrefs(data.cardPrefs);
          localStorage.setItem(PREFS_KEY, JSON.stringify(data.cardPrefs));
        }
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettings(data.settings);
          (Object.keys(data.settings) as Array<keyof Settings>).forEach(key => {
            const val = data.settings[key];
            localStorage.setItem('swa_' + key, typeof val === 'object' ? JSON.stringify(val) : String(val));
          });
        }
        if (data.lockedMonths) {
          setLockedMonths(data.lockedMonths);
          localStorage.setItem('swa_lockedMonths', JSON.stringify(data.lockedMonths));
        }
        return true;
      }
      return false;
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('offline') || msg.toLowerCase().includes('unavailable') || e?.code === 'unavailable') {
        console.warn('Pull from cloud skipped: client is offline.');
      } else {
        console.warn('Pull from cloud failed:', msg);
      }
      return false;
    }
  }, [user, db]);

  const forceSyncToCloud = useCallback(async () => {
    if (!user) return false;
    try {
      await syncToFirebase({
        logs,
        midCounts,
        fmlaCases,
        cardPrefs,
        settings,
        lockedMonths
      });
      triggerSavedIndicator();
      return true;
    } catch (e) {
      console.warn('Force sync to cloud failed:', e);
      return false;
    }
  }, [user, logs, midCounts, fmlaCases, cardPrefs, settings, lockedMonths, syncToFirebase, triggerSavedIndicator]);

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
