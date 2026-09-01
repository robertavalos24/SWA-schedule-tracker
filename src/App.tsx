import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, Upload, FileJson, FileSpreadsheet, Trash2, Info, Save, ShieldCheck, ShieldAlert,
  Lock, Unlock, Settings as SettingsIcon, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, 
  RotateCcw, DollarSign, Clock, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { Header } from './components/Header';
import { SettingsBar } from './components/SettingsBar';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { Calendar } from './components/Calendar';
import { Modals } from './components/Modals';
import { useScheduleData } from './hooks/useScheduleData';
import { calculate, getRawSalary, getEffectiveSalaryAndLevel, getPtoBalanceOnDate, processEntryWithBalances, getRollingYearStats, formatPto } from './utils/calculations';
import { 
  exportCSV, exportBackup, formatStandardDate, parseCSVLine, 
  saveToHandle, exportICS 
} from './utils/importExport';
import { saveHandleToIndexedDB, getHandleFromIndexedDB } from './utils/indexedDB';
import { FmlaCase, Settings } from './types';
import { useToast } from './contexts/ToastContext';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { useModalStore } from './store/useModalStore';

export default function App() {
  const {
    user, login, logout, isInitializingAuth,
    logs, updateLogs, undoLogs, logsHistory, midCounts, updateMidCounts, fmlaCases, updateFmlaCases,
    settings, updateSettings, overwriteSettings, cardPrefs, updateCardPrefs, theme, toggleTheme, setTheme,
    viewMonth, setViewMonth, viewYear, setViewYear, isYearView, setIsYearView, clearLogs,
    direction, changeMonth, changeYear, isLocked, setIsLocked,
    lockedMonths, toggleLockMonth, setLockedMonths, showSavedIndicator, syncToGoogleSheets, forceSyncToCloud, pullFromCloud
  } = useScheduleData();

  const { modals: modalsState, openModal, closeModal } = useModalStore();

  const [clearTarget, setClearTarget] = useState<{ year: number, month: number } | null>(null);

  const triggerClearMonth = (year: number, month: number) => {
    setClearTarget({ year, month });
    openModal('confirmClearMonth');
  };

  const [activeDate, setActiveDate] = useState<string>('');
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [logHrs, setLogHrs] = useState<string>('8');

  const [ptoWarningMessage, setPtoWarningMessage] = useState<string>('');
  const [stats, setStats] = useState<any>(null);
  const [currentAttHistory, setCurrentAttHistory] = useState<any[]>([]);
  const [selectedPaycheck, setSelectedPaycheck] = useState<{y: number, m: number, d: number} | null>(null);

  const [importMessage, setImportMessage] = useState<string>('');
  const [pendingRestoreData, setPendingRestoreData] = useState<any>(null);
  const [backupHandle, setBackupHandle] = useState<any>(null);
  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const lastViewedYearRef = useRef(viewYear);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      showToast('Firebase is offline. Working in offline local mode.', 'warning');
    };
    window.addEventListener('firestore-offline', handleOffline);
    return () => window.removeEventListener('firestore-offline', handleOffline);
  }, [showToast]);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      if (/android|ipad|iphone|ipod/i.test(userAgent.toLowerCase())) {
        setIsMobile(true);
      } else {
        setIsMobile(window.innerWidth < 768);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (viewYear !== lastViewedYearRef.current) {
      const newYear = viewYear;
      const targetDs = `${newYear}-01-01`;
      const { salary: newSal, level: newLvl } = getEffectiveSalaryAndLevel(targetDs, settings);
      
      const newSalStr = "$" + newSal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const newLvlStr = newLvl;
      const newBaseYearStr = newYear.toString();

      const newSettings: Partial<Settings> = {};
      let changed = false;

      if (settings.salary !== newSalStr) {
        newSettings.salary = newSalStr;
        changed = true;
      }
      if (settings.empLevel !== newLvlStr) {
        newSettings.empLevel = newLvlStr;
        changed = true;
      }
      if (settings.baseYear !== newBaseYearStr) {
        newSettings.baseYear = newBaseYearStr;
        changed = true;
      }

      if (changed) {
        updateSettings(newSettings);
      }
      lastViewedYearRef.current = newYear;
    }
  }, [viewYear, settings, updateSettings]);

  useEffect(() => {
    // Try to load handle from IndexedDB on mount
    const loadHandle = async () => {
      try {
        const handle = await getHandleFromIndexedDB();
        if (handle) {
          setBackupHandle(handle);
        }
      } catch (err) {
        console.error('Failed to load handle from IndexedDB:', err);
      }
    };
    loadHandle();
  }, []);

  const handleBackup = React.useCallback(async () => {
    const isIframe = window.self !== window.top;
    
    if (isIframe && 'showSaveFilePicker' in window) {
      showToast('To use "Save As" and "Overwrite", open the app in a new tab.', 'info');
      // Still allow the fallback download
    }

    if (backupHandle) {
      // Try to overwrite
      try {
        const options = { mode: 'readwrite' };
        if (await backupHandle.queryPermission(options) === 'granted') {
          const success = await saveToHandle(backupHandle, logs, midCounts, settings, cardPrefs, fmlaCases, stats, currentAttHistory, { year: viewYear, month: viewMonth }, theme, isLocked, lockedMonths);
          if (success) {
            showToast('Backup successfully updated!', 'success');
            return;
          }
        } else {
          // Request permission
          if (await backupHandle.requestPermission(options) === 'granted') {
            const success = await saveToHandle(backupHandle, logs, midCounts, settings, cardPrefs, fmlaCases, stats, currentAttHistory, { year: viewYear, month: viewMonth }, theme, isLocked, lockedMonths);
            if (success) {
              showToast('Backup successfully updated!', 'success');
              return;
            }
          }
        }
      } catch (err) {
        console.error('Overwrite failed, falling back to picker:', err);
      }
    }

    // If no handle or overwrite failed, use picker
    const newHandle = await exportBackup(logs, midCounts, settings, cardPrefs, fmlaCases, stats, currentAttHistory, { year: viewYear, month: viewMonth }, theme, isLocked, lockedMonths);
    if (newHandle) {
      setBackupHandle(newHandle);
      try {
        await saveHandleToIndexedDB(newHandle);
        showToast('Backup successfully saved!', 'success');
      } catch (err) {
        console.error('Failed to save handle to IndexedDB:', err);
      }
    }
  }, [backupHandle, logs, midCounts, settings, cardPrefs, fmlaCases, stats, currentAttHistory, viewYear, viewMonth, theme, isLocked, lockedMonths, showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      // Ctrl+S or Cmd+S for backup
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleBackup();
        return;
      }

      // Arrow keys for navigation
      if (e.key === 'ArrowLeft') {
        changeMonth(-1);
      } else if (e.key === 'ArrowRight') {
        changeMonth(1);
      } else if (e.key === 'ArrowUp') {
        setViewYear(viewYear - 1);
      } else if (e.key === 'ArrowDown') {
        setViewYear(viewYear + 1);
      } else if (e.key.toLowerCase() === 't') {
        const d = new Date();
        setViewMonth(d.getMonth());
        setViewYear(d.getFullYear());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMonth, viewYear, changeMonth, handleBackup, setViewYear, setViewMonth]);

  useEffect(() => {
    const s = calculate(viewYear, viewMonth, logs, midCounts, settings);
    const today = new Date();
    
    // 1. Calculate Rolling Stats (main active stats)
    let rollingStats;
    let isAsOfTodayObj = false;
    
    if (isYearView) {
      if (viewYear === today.getFullYear()) {
        rollingStats = getRollingYearStats(viewYear, today.getMonth(), logs, settings, today);
        isAsOfTodayObj = true;
      } else {
        rollingStats = getRollingYearStats(viewYear, 11, logs, settings);
      }
    } else {
      rollingStats = getRollingYearStats(viewYear, viewMonth, logs, settings);
    }
    
    const { unptoHrs, uuCount, tardyCount, nsCount, attHistory } = rollingStats;
    
    // 2. Separate Calendar Year Stats
    const calYearStats = getRollingYearStats(viewYear, 11, logs, settings);
    const { 
      unptoHrs: calUnptoHrs, 
      uuCount: calUuCount, 
      tardyCount: calTardyCount, 
      nsCount: calNsCount, 
      attHistory: calAttHistory 
    } = calYearStats;

    let dropDateText = "N/A";
    if (attHistory.length > 0) {
      const oldestDate = new Date(attHistory[0].date + "T00:00:00");
      oldestDate.setFullYear(oldestDate.getFullYear() + 1);
      dropDateText = oldestDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    let points = 0;
    if (nsCount >= 1) points++; if (nsCount >= 2) points++; if (nsCount >= 3) points++;
    if (tardyCount >= 4) points++; if (tardyCount >= 5) points++; if (tardyCount >= 6) points++;
    if (unptoHrs >= 56) points++; if (unptoHrs >= 64) points++; if (unptoHrs >= 72) points++;
    if (uuCount >= 3) points++; if (uuCount >= 4) points++; if (uuCount >= 5) points++;

    let attMet = points >= 3 ? 3 : points >= 2 ? 2 : points >= 1 ? 1 : 0;
    
    let manualMet = 0;
    let manualDropDateText = "N/A";
    
    let perfLetters: any[] = [];
    try {
      try { perfLetters = JSON.parse(settings.perfLetters || '[]'); } catch(e) { perfLetters = []; }
    } catch (e) {}

    // Fallback/Migration for old attOverride
    if (perfLetters.length === 0 && settings.attOverride && settings.attOverride !== 'auto') {
      const parts = settings.attOverride.split('|');
      if (parts.length > 1 && parts[1]) {
        perfLetters.push({ id: 'legacy', level: parseInt(parts[0], 10), date: parts[1] });
      }
      // If no date in legacy override, we ignore it to avoid infinite LOW status
    }

    // Find active performance letters for the currently viewed month (or end of year in Year View)
    const activeViewMonth = isYearView ? 11 : viewMonth;
    const viewDate = new Date(viewYear, activeViewMonth + 1, 0);
    viewDate.setHours(0,0,0,0);

    let activeLetters: any[] = [];

    perfLetters.forEach(letter => {
      let isActive = true;
      let dropDateObj: Date | null = null;

      if (letter.date) {
        const issueDateObj = new Date(letter.date + "T00:00:00");
        dropDateObj = new Date(letter.date + "T00:00:00");
        dropDateObj.setFullYear(dropDateObj.getFullYear() + 1);

        if (viewDate >= dropDateObj || viewDate < issueDateObj) {
          isActive = false;
        }
      }

      if (isActive) {
        activeLetters.push({ ...letter, dropDateObj });
      }
    });

    if (activeLetters.length > 0) {
      let totalLevel = 0;
      let latestDropDateObj: Date | null = null;
      let hasNoExpiration = false;

      activeLetters.forEach(letter => {
        totalLevel += letter.level;
        if (letter.dropDateObj) {
          if (!latestDropDateObj || letter.dropDateObj > latestDropDateObj) {
            latestDropDateObj = letter.dropDateObj;
          }
        } else {
          hasNoExpiration = true;
        }
      });

      manualMet = Math.min(totalLevel, 3);
      if (hasNoExpiration) {
        manualDropDateText = "No Expiration";
      } else if (latestDropDateObj) {
        manualDropDateText = latestDropDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    const getLetter = (lvl: number) => lvl === 3 ? "FLOW" : lvl === 2 ? "LOW" : lvl === 1 ? "LOE" : "CLEAR";
    const getColor = (lvl: number) => lvl === 3 ? "var(--swa-red)" : lvl === 2 ? "var(--swa-orange)" : lvl === 1 ? "var(--swa-yellow)" : "var(--pay-green)";

    const attLetter = getLetter(attMet);
    const attColor = getColor(attMet);
    const manualLetter = getLetter(manualMet);
    const manualColor = getColor(manualMet);

    const fmlaCasesData = fmlaCases.map(c => {
      let used = 0;
      for (const d in logs) {
        if (Array.isArray(logs[d])) {
          logs[d].forEach(e => {
            if ((e.type === 'FMLA-P' || e.type === 'FML-UNP')) {
              if (fmlaCases.length <= 1 || String(e.fmlaCase) === String(c.num)) {
                used += parseFloat(e.hrs as any) || 8;
              }
            }
          });
        }
      }
      const remaining = (c.leaveType === "Continuous" || c.isContinuous) ? 0 : (parseFloat(c.bal as any) || 0) - used;
      return { ...c, used, remaining };
    });

    setStats({
      ...s,
      unptoHrs, uuCount, tardyCount, nsCount, 
      attMet, attLetter, attColor, 
      manualMet, manualLetter, manualColor,
      dropDateText, fmlaCasesData, manualDropDateText,
      tMet: Math.max(attMet, manualMet), // For backward compatibility with alert-lvl class
      
      // New Calendar Year and Today's status fields
      isCurrentYear: viewYear === today.getFullYear(),
      isAsOfToday: isAsOfTodayObj,
      todayStr: today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      
      calUnptoHrs,
      calUuCount,
      calTardyCount,
      calNsCount,
      calAttHistory
    });
    setCurrentAttHistory(attHistory);
  }, [logs, midCounts, settings, viewMonth, viewYear, fmlaCases, isYearView]);

  const handleOpenAddBlock = (ds: string) => {
    setActiveDate(ds);
    openModal('addBlock');
  };

  const handleOpenEditBlock = (ds: string, idx: number) => {
    setEditDate(ds);
    setEditIndex(idx);
    openModal('editBlock');
  };

  const removeEntry = (ds: string, idx: number) => {
    const d = new Date(ds + "T00:00:00");
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (isLocked || lockedMonths.includes(key)) {
      showToast("This month is locked. Please unlock it to modify entries.", "error");
      return;
    }

    const newLogs = { ...logs };
    newLogs[ds] = newLogs[ds].filter((_, i) => i !== idx);
    if (!newLogs[ds].length) delete newLogs[ds];
    updateLogs(newLogs);
  };

   const executeSave = (type: string, fmlaCaseNum = '', overrideHrs?: string, extraOptions?: any) => {
    const d = new Date(activeDate + "T00:00:00");
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (isLocked || lockedMonths.includes(key)) {
      showToast("This month is locked. Please unlock it to modify entries.", "error");
      return;
    }

    const newLogs = { ...logs };
    if (!newLogs[activeDate] || !Array.isArray(newLogs[activeDate])) newLogs[activeDate] = [];
    
    const h = parseFloat(overrideHrs || logHrs) || 8;
    const dayEntries = [...(newLogs[activeDate] || [])];
    
    const isWorkShift = (t: string) => t === 'WORK' || t.startsWith('WORK-');
    if (isWorkShift(type)) {
      const hasOffDay = dayEntries.some(e => {
        const t = e.type;
        return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
               t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
               t === 'MED-UNP' || t === 'MED-LV';
      });
      const isAlreadyAdded = dayEntries.some(e => e.type === type && e.hrs === h && (e.label || '') === (extraOptions?.label || ''));
      if (!hasOffDay && isAlreadyAdded) {
        showToast(`You can only work the same shift hours once in a single day (unless you have PTO/WOP/HOL).`, 'error');
        closeModal('addBlock');
        return;
      }
    }

    const entry: any = { type, hrs: h, otRule: 'std', ...extraOptions };
    if (fmlaCaseNum) entry.fmlaCase = fmlaCaseNum;

    const { entries, warning } = processEntryWithBalances(
      entry,
      activeDate,
      newLogs,
      dayEntries,
      settings,
      fmlaCases
    );

    newLogs[activeDate] = [...dayEntries, ...entries];
    updateLogs(newLogs);
    closeModal('addBlock');
    
    if (warning) {
      setPtoWarningMessage(warning);
      openModal('ptoWarning');
    }
  };

  const saveEditBlock = (entry: any) => {
    if (editDate && editIndex !== null) {
      const d = new Date(editDate + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (isLocked || lockedMonths.includes(key)) {
        showToast("This month is locked. Please unlock it to modify entries.", "error");
        return;
      }

      const newLogs = { ...logs };
      const dayEntries = [...newLogs[editDate]];
      
      const isWorkShift = (t: string) => t === 'WORK' || t.startsWith('WORK-');
      if (isWorkShift(entry.type)) {
        const hasOffDay = dayEntries.some((e, idx) => {
          if (idx === editIndex) return false;
          const t = e.type;
          return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
                 t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
                 t === 'MED-UNP' || t === 'MED-LV';
        });
        const isAlreadyAdded = dayEntries.some((e, idx) => idx !== editIndex && e.type === entry.type && e.hrs === entry.hrs && (e.label || '') === (entry.label || ''));
        if (!hasOffDay && isAlreadyAdded) {
          showToast(`You can only work the same shift hours once in a single day (unless you have PTO/WOP/HOL).`, 'error');
          return;
        }
      }

      if (entry.type === 'PTO' || entry.type === 'FMLA-P' || entry.type === 'UNPTO' || entry.type === 'FML-UNP' || entry.type === 'MED-P' || entry.type === 'MED-UNP') {
        const { entries, warning } = processEntryWithBalances(
          { ...dayEntries[editIndex], ...entry },
          editDate,
          newLogs,
          dayEntries,
          settings,
          fmlaCases,
          editIndex
        );
        
        dayEntries.splice(editIndex, 1, ...entries);
        
        if (warning) {
          setPtoWarningMessage(warning);
          openModal('ptoWarning');
        }
      } else if (['TARDY', 'NO-SHOW'].includes(entry.type)) {
        let unpaidHrs = entry.hrs;
        if (entry.coverWithPto) {
          const currentBal = getPtoBalanceOnDate(editDate, newLogs, settings);
          
          let ptoUsedToday = 0;
          dayEntries.forEach((e, idx) => {
            if (idx !== editIndex) {
              if (e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') {
                ptoUsedToday += parseFloat(e.hrs as any) || 8;
              } else if (['TARDY', 'NO-SHOW'].includes(e.type)) {
                const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : (parseFloat(e.hrs as any) || 8);
                ptoUsedToday += (parseFloat(e.hrs as any) || 8) - unp;
              }
            }
          });
          
          const availablePto = currentBal - ptoUsedToday;
          const requestedHrs = parseFloat(entry.hrs as any) || 8;
          
          if (availablePto >= requestedHrs) {
            unpaidHrs = 0;
          } else if (availablePto > 0) {
            unpaidHrs = Number((requestedHrs - availablePto).toFixed(10));
            setPtoWarningMessage(`You only had ${formatPto(availablePto)} hours of PTO available to cover this infraction. The remaining ${formatPto(unpaidHrs)} hours will be unpaid.`);
            openModal('ptoWarning');
          } else {
            unpaidHrs = requestedHrs;
            setPtoWarningMessage(`You have no PTO available to cover this infraction. It will be entirely unpaid.`);
            openModal('ptoWarning');
          }
        }
        dayEntries[editIndex] = { ...dayEntries[editIndex], ...entry, unpaidHrs };
      } else {
        dayEntries[editIndex] = { ...dayEntries[editIndex], ...entry };
      }
      
      newLogs[editDate] = dayEntries;
      updateLogs(newLogs);
    }
  };

  const addFmlaCase = (c: FmlaCase) => {
    updateFmlaCases([...fmlaCases, c]);
  };

  const updateFmlaCase = (idx: number, c: FmlaCase) => {
    const newCases = [...fmlaCases];
    newCases[idx] = c;
    updateFmlaCases(newCases);
  };

  const removeFmlaCase = (idx: number) => {
    const newCases = [...fmlaCases];
    newCases.splice(idx, 1);
    updateFmlaCases(newCases);
  };

  const setOverride = (val: string) => {
    updateSettings({ attOverride: val });
    closeModal('override');
  };

  const saveBulkMid = (m: number, val: string) => {
    const mKey = viewYear + '-' + m;
    const newMids = { ...midCounts };
    if (val === 'auto') {
      delete newMids[mKey];
    } else {
      newMids[mKey] = val;
    }
    updateMidCounts(newMids);
  };

  const addManualInfraction = (ds: string, type: string, hrs: number, cover: boolean) => {
    const d = new Date(ds + "T00:00:00");
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (isLocked || lockedMonths.includes(key)) {
      showToast("This month is locked. Please unlock it to modify entries.", "error");
      return;
    }

    const newLogs = { ...logs };
    const dayEntries = newLogs[ds] ? [...newLogs[ds]] : [];
    
    let unpaidHrs = 0;
    if(['TARDY', 'NO-SHOW'].includes(type)) {
      unpaidHrs = hrs;
      if(cover) {
        const currentBal = getPtoBalanceOnDate(ds, newLogs, settings);
        
        let ptoUsedToday = 0;
        dayEntries.forEach(e => {
          if (e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') {
            ptoUsedToday += parseFloat(e.hrs as any) || 8;
          } else if (['TARDY', 'NO-SHOW'].includes(e.type)) {
            const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : (parseFloat(e.hrs as any) || 8);
            ptoUsedToday += (parseFloat(e.hrs as any) || 8) - unp;
          }
        });
        
        const availablePto = currentBal - ptoUsedToday;
        
        if (availablePto >= hrs) {
          unpaidHrs = 0;
        } else if (availablePto > 0) {
          unpaidHrs = Number((hrs - availablePto).toFixed(10));
          setPtoWarningMessage(`You only had ${formatPto(availablePto)} hours of PTO available to cover this infraction. The remaining ${formatPto(unpaidHrs)} hours will be unpaid.`);
          openModal('ptoWarning');
        } else {
          unpaidHrs = hrs;
          setPtoWarningMessage(`You have no PTO available to cover this infraction. It will be entirely unpaid.`);
          openModal('ptoWarning');
        }
      }
      dayEntries.push({ type, hrs, unpaidHrs, coverWithPto: cover });
    } else if (type === 'UNPTO') {
      const entry = { type: 'UNPTO', hrs };
      const { entries, warning } = processEntryWithBalances(
        entry,
        ds,
        newLogs,
        dayEntries,
        settings,
        fmlaCases
      );
      
      dayEntries.push(...entries);
      
      if (warning) {
        setPtoWarningMessage(warning);
        openModal('ptoWarning');
      }
    } else if (type === 'UNPAID-UNSCHED') {
      dayEntries.push({ type, hrs });
    }

    newLogs[ds] = dayEntries;
    updateLogs(newLogs);
  };

  const jumpToToday = () => {
    const td = new Date();
    setViewMonth(td.getMonth());
    setViewYear(td.getFullYear());
    setIsYearView(false);
  };

  const moveMonth = (n: number) => {
    let m = viewMonth + n;
    let y = viewYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setViewMonth(m);
    setViewYear(y);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      
      if (e.key === 'ArrowLeft') {
        moveMonth(-1);
      } else if (e.key === 'ArrowRight') {
        moveMonth(1);
      } else if (e.key.toLowerCase() === 't') {
        jumpToToday();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMonth, viewYear]);

  const clearMonthData = () => {
    const targetY = clearTarget ? clearTarget.year : viewYear;
    const targetM = clearTarget ? clearTarget.month : viewMonth;

    const key = `${targetY}-${String(targetM + 1).padStart(2, '0')}`;
    if (isLocked || lockedMonths.includes(key)) {
      showToast("This month is locked. Please unlock it to modify/clear entries.", "error");
      return;
    }

    const newLogs = { ...logs };
    for (const ds in newLogs) {
      const d = new Date(ds + "T00:00:00");
      if (d.getMonth() === targetM && d.getFullYear() === targetY) {
        delete newLogs[ds];
      }
    }
    updateLogs(newLogs);
    closeModal('confirmClearMonth');
    setClearTarget(null);
  };

  const resetAppData = () => {
    openModal('confirmReset');
  };

  const copyPreviousMonth = () => {
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    if (isLocked || lockedMonths.includes(key)) {
      showToast("This month is locked. Please unlock it to copy entries.", "error");
      return;
    }

    let prevM = viewMonth - 1;
    let prevY = viewYear;
    if (prevM < 0) {
      prevM = 11;
      prevY--;
    }

    const newLogs = { ...logs };
    const prevMonthDays = new Date(prevY, prevM + 1, 0).getDate();
    const currentMonthDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    let copiesCount = 0;
    for (let d = 1; d <= Math.min(prevMonthDays, currentMonthDays); d++) {
      const prevDs = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const currentDs = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (logs[prevDs] && Array.isArray(logs[prevDs])) {
        // Only copying non-infraction items (Work, PTO, HOL, FMLA)
        const entriesToCopy = logs[prevDs].filter(e => 
          e.type.startsWith('WORK') || e.type === 'PTO' || e.type === 'HOL' || e.type.startsWith('FMLA')
        );

        if (entriesToCopy.length > 0) {
          // Only if empty to be safe
          if (!newLogs[currentDs] || newLogs[currentDs].length === 0) {
            newLogs[currentDs] = entriesToCopy.map(e => ({ ...e }));
            copiesCount++;
          }
        }
      }
    }

    if (copiesCount > 0) {
      updateLogs(newLogs);
      showToast(`Successfully copied ${copiesCount} days from previous month.`, 'success');
    } else {
      showToast('No eligible entries found in the previous month to copy.', 'info');
    }
  };

  const duplicateEntryToNextDay = (dateStr: string, entryIndex: number) => {
    const entry = logs[dateStr]?.[entryIndex];
    if (!entry) return;
    
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const nextDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const nextKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
    if (isLocked || lockedMonths.includes(nextKey)) {
      showToast("The destination month is locked. Please unlock it to duplicate entries.", "error");
      return;
    }

    const newEntry = { ...entry };
    const newLogs = { ...logs };
    const dayEntries = newLogs[nextDateStr] ? [...newLogs[nextDateStr]] : [];

    const isWorkShift = (t: string) => t === 'WORK' || t.startsWith('WORK-');
    if (isWorkShift(entry.type)) {
      const hasOffDay = dayEntries.some(e => {
        const t = e.type;
        return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
               t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
               t === 'MED-UNP' || t === 'MED-LV';
      });
      const isAlreadyAdded = dayEntries.some(e => e.type === entry.type && e.hrs === entry.hrs && (e.label || '') === (entry.label || ''));
      if (!hasOffDay && isAlreadyAdded) {
        showToast(`The next day already has the same work shift "${entry.type}" with identical hours. Duplication canceled.`, 'error');
        closeModal('editBlock');
        return;
      }
    }
    
    const { entries, warning } = processEntryWithBalances(
      newEntry,
      nextDateStr,
      newLogs,
      dayEntries,
      settings,
      fmlaCases
    );
    
    dayEntries.push(...entries);
    newLogs[nextDateStr] = dayEntries;
    updateLogs(newLogs);
    closeModal('editBlock');
    
    if (warning) {
      setPtoWarningMessage(warning);
      openModal('ptoWarning');
    }
  };

  const handleSmartImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let totalNewEntries = 0;
    let lastFoundMonth: number | null = null;
    let lastFoundYear: number | null = null;
    const newLogs = { ...logs };
    const importErrors: string[] = [];

    const processListRow = (parts: string[], isRosterApps: boolean) => {
      let added = 0;
      const isWorkShift = (t: string) => t === 'WORK' || t.startsWith('WORK-');
      if (isRosterApps) {
        if (parts.length < 5) return 0;
        const rawDate = parts[1];
        const d = formatStandardDate(rawDate, viewYear);
        if (!d) return 0;

        const shiftSkills = parts[2] ? parts[2].trim().toLowerCase() : '';
        const timeStr = parts[3] ? parts[3].trim() : '';
        const notes = parts[4] ? parts[4].trim().toUpperCase() : '';
        const textToSearch = (shiftSkills + " " + notes).toUpperCase();
        
        let isException = false;
        if (textToSearch.includes('ABSENT') || textToSearch.match(/\bWOP\b/) || 
            textToSearch.match(/\bP-PTO\b/) || textToSearch.match(/\bPTO\b/) || 
            textToSearch.includes('CS-HOL') || textToSearch.match(/\bHOL\b/) || 
            textToSearch.match(/\bFMLA\b/) || textToSearch.match(/\bFML\b/) || 
            textToSearch.includes('OT QUALIFIED') || textToSearch.includes('OVERTIME') || textToSearch.match(/\bOT\b/) || 
            textToSearch.includes('TARDY') || textToSearch.includes('NO SHOW') || textToSearch.match(/\bUPTO\b/) || 
            textToSearch.includes('UNPTO') || textToSearch.includes('UNPAID')) {
            isException = true;
        }

        const isWorkDay = shiftSkills.includes('floor') || shiftSkills.includes('project') || timeStr.includes('-');

        if (!isWorkDay && !isException) return 0; 

        let hrs = 8; let type = 'WORK'; let prem = false; let otRule = 'std';
        let labelStr = "";

        if (timeStr && timeStr.includes('-')) {
          const t = timeStr.split('-');
          const startParts = t[0].split(':');
          const startHour = parseInt(startParts[0], 10);
          const start = startHour + (t[0].includes('30') ? 0.5 : 0);
          const endParts = t[1].split(':');
          let end = parseInt(endParts[0], 10) + (t[1].includes('30') ? 0.5 : 0);
          if (end < start) end += 24;
          hrs = end - start;
          if (hrs <= 0 || isNaN(hrs)) hrs = 8;
          
          const formattedStart = t[0].trim().replace(':','');
          const formattedEnd = t[1].trim().replace(':','');
          labelStr = `${formattedStart}-${formattedEnd}`;
          
          if (shiftSkills.includes('project')) type = 'WORK-PROJ';
          else if (startHour >= 4 && startHour <= 10) type = 'WORK-AM';
          else if (startHour >= 11 && startHour <= 17) type = 'WORK-PM';
          else if (startHour >= 18 || startHour <= 3) type = 'WORK-MID';
        }

        const isFMLUnp = textToSearch.includes('FMLA UNPD') || textToSearch.includes('FML UNPD') || textToSearch.includes('UNPAID FMLA') || textToSearch.includes('FMLA-UNP');
        const isFMLP = textToSearch.match(/\bFMLA\b/) || textToSearch.match(/\bFML\b/);
        const isHol = textToSearch.includes('CS-HOL') || textToSearch.match(/\bHOL\b/);
        const isUPTO = textToSearch.match(/\bUPTO\b/) || textToSearch.includes('UNPTO') || textToSearch.includes('UNPAID PTO');
        const isPTO = textToSearch.match(/\bP-PTO\b/) || textToSearch.match(/\bPTO\b/);
        const isTardy = textToSearch.includes('TARDY');
        const isNoShow = textToSearch.includes('NO SHOW') || textToSearch.includes('NO-SHOW');
        const isOT = textToSearch.includes('OT QUALIFIED') || textToSearch.includes('OVERTIME') || textToSearch.match(/\bOT\b/);
        const isDT = textToSearch.includes('DOUBLE TIME') || textToSearch.match(/\bDT\b/);
        const isMedLv = textToSearch.includes('MEDICAL LV') || textToSearch.includes('MEDICAL LEAVE') || textToSearch.includes('MED LV');
        const isWOP = (textToSearch.includes('ABSENT') && !isMedLv) || textToSearch.match(/\bWOP\b/);

        if (isMedLv) type = 'MED-LV';
        else if (isFMLUnp) type = 'FML-UNP';
        else if (isFMLP) type = 'FMLA-P';
        else if (isHol) type = 'HOL';
        else if (isUPTO) type = 'UNPTO';
        else if (isPTO) type = 'PTO';
        else if (isTardy) type = 'TARDY';
        else if (isNoShow) type = 'NO-SHOW';
        else if (isDT) type = 'OT';
        else if (isOT) type = 'OT';
        else if (isWOP) type = 'WOP';
        
        let assignedOtRule = otRule;
        if (isDT) assignedOtRule = 'dt';

        if (!newLogs[d] || !Array.isArray(newLogs[d])) newLogs[d] = [];
        const entryObj: any = { type, hrs, prem, otRule: assignedOtRule };
        if (labelStr !== "") entryObj.label = labelStr;
        
        if (type === 'TARDY') {
          entryObj.coverWithPto = !textToSearch.includes('UNPAID');
        }
        
        if (type === 'FMLA-P' || type === 'FML-UNP' || type === 'MED-LV') {
          if (fmlaCases.length === 1) entryObj.fmlaCase = fmlaCases[0].num;
        }
        
        let isDuplicate = false;
        if (isWorkShift(type)) {
          const hasOffDay = newLogs[d].some(e => {
            const t = e.type;
            return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
                   t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
                   t === 'MED-UNP' || t === 'MED-LV';
          });
          if (hasOffDay) {
            isDuplicate = false;
          } else {
            isDuplicate = newLogs[d].some(entry => entry.type === type && entry.hrs === hrs && (entry.label || "") === labelStr);
          }
        } else if (['MED-LV', 'MED-P-PTO', 'MED-P', 'MED-UNP'].includes(type)) {
          isDuplicate = newLogs[d].some(entry => 
            ['MED-LV', 'MED-P-PTO', 'MED-P', 'MED-UNP'].includes(entry.type) && 
            entry.hrs === hrs && 
            (entry.label || "") === (labelStr || "")
          );
        } else {
          isDuplicate = newLogs[d].some(entry => entry.type === type && entry.hrs === hrs && (entry.label || "") === labelStr);
        }

        if (!isDuplicate) { 
          newLogs[d] = [...newLogs[d], entryObj]; 
          added++; 
        }
      } else {
        if (parts.length >= 3) {
          const d = formatStandardDate(parts[0], viewYear);
          if (!d) return 0;
          let type = parts[1];
          if (type === 'DT') type = 'OT';
          const hrs = parseFloat(parts[2]), prem = parts[3] === "Yes";
          let otRule = "std";
          if (parts[4] === "Double Time (2x)") otRule = "dt";
          else if (parts[4] === "Combo (1.5x / 2x)") otRule = "conj_shift";

          if (isNaN(hrs)) return 0;
          if (!newLogs[d] || !Array.isArray(newLogs[d])) newLogs[d] = [];
          
          let isDuplicate = false;
          if (isWorkShift(type)) {
            const hasOffDay = newLogs[d].some(e => {
              const t = e.type;
              return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
                     t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
                     t === 'MED-UNP' || t === 'MED-LV';
            });
            if (hasOffDay) {
              isDuplicate = false;
            } else {
              isDuplicate = newLogs[d].some(entry => entry.type === type && entry.hrs === hrs);
            }
          } else if (['MED-LV', 'MED-P-PTO', 'MED-P', 'MED-UNP'].includes(type)) {
            isDuplicate = newLogs[d].some(entry => 
              ['MED-LV', 'MED-P-PTO', 'MED-P', 'MED-UNP'].includes(entry.type) && 
              entry.hrs === hrs
            );
          } else {
            isDuplicate = newLogs[d].some(entry => entry.type === type && entry.hrs === hrs && entry.prem === prem && entry.otRule === otRule);
          }

          if (!isDuplicate) { 
            newLogs[d] = [...newLogs[d], { type, hrs, prem, otRule }]; 
            added++; 
          }
        }
      }
      return added;
    };

    const parseFile = (file: File) => {
      return new Promise<number>((resolve) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const reader = new FileReader();

        if (ext === 'csv') {
          reader.onerror = () => {
            importErrors.push(`Failed to read CSV file: ${file.name}`);
            resolve(0);
          };
          reader.onload = function(e) {
            let localNewEntries = 0;
            try {
              const lines = (e.target?.result as string).split('\n');
              const isRosterApps = lines.length > 0 && lines[0].toLowerCase().includes('dayfield');

              for(let i = (isRosterApps ? 1 : 0); i < lines.length; i++) {
                const cleanLine = lines[i].replace(/\r/g, '').trim();
                if (!cleanLine || cleanLine.toLowerCase().includes("datefield") || cleanLine.toLowerCase() === "date") continue; 
                if (cleanLine.toLowerCase().includes("personal time")) continue;
                
                const parts = parseCSVLine(cleanLine);
                localNewEntries += processListRow(parts, isRosterApps);
              }
            } catch (err) { 
              console.error("Error reading CSV file " + file.name, err); 
              importErrors.push(`Error parsing CSV file ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
            resolve(localNewEntries);
          };
          reader.readAsText(file);

        } else if (['xlsx', 'xls', 'html', 'htm', 'xml'].includes(ext || '')) {
          reader.onerror = () => {
            importErrors.push(`Failed to read file: ${file.name}`);
            resolve(0);
          };
          reader.onload = function(e) {
            let localNewEntries = 0;
            try {
              const data = new Uint8Array(e.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, {type: 'array'});
              const worksheet = workbook.Sheets[workbook.SheetNames[0]];
              const rows: any[] = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});

              const isListView = rows.length > 0 && Array.isArray(rows[0]) && rows[0].some(cell => String(cell || '').toLowerCase().includes('dayfield'));

              if (isListView) {
                for (let r = 1; r < rows.length; r++) {
                  const parts = rows[r].map(c => String(c || '').trim());
                  localNewEntries += processListRow(parts, true);
                }
              } else {
                let currentMonth = null;
                let currentYear = null;

                for (let r=0; r<Math.min(rows.length, 10); r++) {
                  for (let c=0; c<rows[r].length; c++) {
                    const val = String(rows[r][c] || '').trim();
                    const dateMatch = val.match(/Month Calendar from\s+(\d{1,2})\/\d{1,2}\/(\d{4})/i);
                    if (dateMatch) {
                      currentMonth = parseInt(dateMatch[1], 10) - 1;
                      currentYear = parseInt(dateMatch[2], 10);
                      lastFoundMonth = currentMonth;
                      lastFoundYear = currentYear;
                    }
                  }
                }

                if(currentMonth === null) currentMonth = viewMonth;
                if(currentYear === null) currentYear = viewYear;

                const dateTextMap: Record<string, string[]> = {};
                let currentDayCols: Record<number, string> = {};
                let lastSeenDay = 0;
                let monthOffset = 0;

                for (let r=0; r<rows.length; r++) {
                  const row = rows[r];
                  let rowHasDates = false;
                  
                  for (let c=0; c<row.length; c++) {
                    const val = String(row[c] || '').trim();
                    if (/^0?[1-9]|[12]\d|3[01]$/.test(val) && val.length <= 2) {
                      rowHasDates = true;
                      break;
                    }
                  }

                  if (rowHasDates) {
                    currentDayCols = {};
                    for (let c=0; c<row.length; c++) {
                      const val = String(row[c] || '').trim();
                      if (/^0?[1-9]|[12]\d|3[01]$/.test(val) && val.length <= 2) {
                        const dayNum = parseInt(val, 10);
                        if (dayNum < lastSeenDay && dayNum < 10 && lastSeenDay > 20) {
                          monthOffset++;
                        }
                        lastSeenDay = dayNum;

                        const dateD = new Date(currentYear, currentMonth + monthOffset, dayNum);
                        const dateStr = `${dateD.getFullYear()}-${String(dateD.getMonth()+1).padStart(2,'0')}-${String(dateD.getDate()).padStart(2,'0')}`;
                        currentDayCols[c] = dateStr;
                        if (!dateTextMap[dateStr]) dateTextMap[dateStr] = [];
                      }
                    }
                  } else {
                    for (let c=0; c<row.length; c++) {
                      const val = String(row[c] || '').trim();
                      if (!val || val.toUpperCase().includes('PERSONAL TIME')) continue;
                      
                      const dateStr = currentDayCols[c] || currentDayCols[c-1] || currentDayCols[c-2] || currentDayCols[c+1]; 
                      if (dateStr && dateTextMap[dateStr]) {
                        const internalLines = val.split(/\r\n|\n|\r/);
                        internalLines.forEach(l => {
                          if (l.trim()) dateTextMap[dateStr].push(l.trim());
                        });
                      }
                    }
                  }
                }

                for (const dateStr in dateTextMap) {
                  const chunks = dateTextMap[dateStr];
                  let currentShift: any = null;
                  const shiftsForDay: any[] = [];
                  
                  for (let i=0; i<chunks.length; i++) {
                    const val = chunks[i];
                    const timeRegex = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;
                    const tMatch = val.match(timeRegex);
                    
                    if (tMatch) {
                      if (currentShift) shiftsForDay.push(currentShift);
                      const startHParts = tMatch[1].split(':');
                      const endHParts = tMatch[2].split(':');
                      currentShift = {
                        startH: parseInt(startHParts[0], 10),
                        startM: parseInt(startHParts[1], 10),
                        endH: parseInt(endHParts[0], 10),
                        endM: parseInt(endHParts[1], 10),
                        notes: ""
                      };
                    } else if (currentShift) {
                      currentShift.notes += " " + val;
                    } else {
                      if (/PTO|HOL|WOP|ABSENT|FMLA|FML|UNPTO|UPTO|TARDY|NO SHOW/i.test(val)) {
                        shiftsForDay.push({ genericException: val });
                      }
                    }
                  }
                  if (currentShift) shiftsForDay.push(currentShift);

                  shiftsForDay.forEach(s => {
                    let type = 'WORK';
                    let hrs = 8;
                    let labelStr = "";
                    let textToSearch = "";

                    if (s.genericException) {
                      textToSearch = s.genericException.toUpperCase();
                      hrs = 8; 
                    } else {
                      textToSearch = s.notes.toUpperCase();
                      const start = s.startH + (s.startM/60);
                      const end = s.endH + (s.endM/60);
                      hrs = end - start;
                      if (hrs <= 0) hrs += 24;
                      
                      const sHStr = String(s.startH).padStart(2,'0');
                      const sMStr = String(s.startM).padStart(2,'0');
                      const eHStr = String(s.endH).padStart(2,'0');
                      const eMStr = String(s.endM).padStart(2,'0');
                      labelStr = `${sHStr}${sMStr}-${eHStr}${eMStr}`;
                      
                      if (s.notes.toUpperCase().includes('PROJECT')) type = 'WORK-PROJ';
                      else if (s.startH >= 4 && s.startH <= 10) type = 'WORK-AM';
                      else if (s.startH >= 11 && s.startH <= 17) type = 'WORK-PM';
                      else if (s.startH >= 18 || s.startH <= 3) type = 'WORK-MID';
                    }

                    const isFMLUnp = textToSearch.includes('FMLA UNPD') || textToSearch.includes('FML UNPD') || textToSearch.includes('UNPAID FMLA') || textToSearch.includes('FMLA-UNP');
                    const isFMLP = textToSearch.match(/\bFMLA\b/) || textToSearch.match(/\bFML\b/);
                    const isHol = textToSearch.includes('CS-HOL') || textToSearch.match(/\bHOL\b/);
                    const isUPTO = textToSearch.match(/\bUPTO\b/) || textToSearch.includes('UNPTO') || textToSearch.includes('UNPAID PTO');
                    const isPTO = textToSearch.match(/\bP-PTO\b/) || textToSearch.match(/\bPTO\b/);
                    const isTardy = textToSearch.includes('TARDY');
                    const isNoShow = textToSearch.includes('NO SHOW') || textToSearch.includes('NO-SHOW');
                    const isOT = textToSearch.includes('OT QUALIFIED') || textToSearch.includes('OVERTIME') || textToSearch.match(/\bOT\b/);
                    const isDT = textToSearch.includes('DOUBLE TIME') || textToSearch.match(/\bDT\b/);
                    const isMedLv = textToSearch.includes('MEDICAL LV') || textToSearch.includes('MEDICAL LEAVE') || textToSearch.includes('MED LV');
                    const isWOP = (textToSearch.includes('ABSENT') && !isMedLv) || textToSearch.match(/\bWOP\b/);

                    if (isMedLv) type = 'MED-LV';
                    else if (isFMLUnp) type = 'FML-UNP';
                    else if (isFMLP) type = 'FMLA-P';
                    else if (isHol) type = 'HOL';
                    else if (isUPTO) type = 'UNPTO';
                    else if (isPTO) type = 'PTO';
                    else if (isTardy) type = 'TARDY';
                    else if (isNoShow) type = 'NO-SHOW';
                    else if (isDT) type = 'OT';
                    else if (isOT) type = 'OT';
                    else if (isWOP) type = 'WOP';
                    
                    let assignedOtRule = 'std';
                    if (isDT) assignedOtRule = 'dt';

                    if (!newLogs[dateStr]) newLogs[dateStr] = [];
                    const entryObj: any = { type, hrs, prem: false, otRule: assignedOtRule };
                    if (labelStr !== "") entryObj.label = labelStr;
                    
                    if (type === 'TARDY') {
                      entryObj.coverWithPto = !textToSearch.includes('UNPAID');
                    }
                    
                    if (type === 'FMLA-P' || type === 'FML-UNP' || type === 'MED-LV') {
                      if (fmlaCases.length === 1) entryObj.fmlaCase = fmlaCases[0].num;
                    }
                    
                    let isDuplicate = false;
                    const isWorkShift = (t: string) => t === 'WORK' || t.startsWith('WORK-');
                    if (isWorkShift(type)) {
                      const hasOffDay = newLogs[dateStr].some(e => {
                        const t = e.type;
                        return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
                               t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
                               t === 'MED-UNP' || t === 'MED-LV';
                      });
                      if (hasOffDay) {
                        isDuplicate = false;
                      } else {
                        isDuplicate = newLogs[dateStr].some(entry => entry.type === type && entry.hrs === hrs && entry.label === labelStr);
                      }
                    } else if (['MED-LV', 'MED-P-PTO', 'MED-P', 'MED-UNP'].includes(type)) {
                      isDuplicate = newLogs[dateStr].some(entry => 
                        ['MED-LV', 'MED-P-PTO', 'MED-P', 'MED-UNP'].includes(entry.type) && 
                        entry.hrs === hrs && 
                        (entry.label || "") === (labelStr || "")
                      );
                    } else {
                      isDuplicate = newLogs[dateStr].some(e => e.type === type && e.hrs === hrs && e.label === labelStr);
                    }
                    
                    if (!isDuplicate) { 
                      newLogs[dateStr] = [...newLogs[dateStr], entryObj]; 
                      localNewEntries++; 
                    }
                  });
                }
              }
            } catch (err) { 
              console.error("Error parsing file " + file.name, err); 
              importErrors.push(`Error parsing file ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
            resolve(localNewEntries);
          };
          reader.readAsArrayBuffer(file);
        } else {
          importErrors.push(`Unsupported file type: ${file.name}`);
          resolve(0);
        }
      });
    };

    const promises = [];
    for (let i = 0; i < files.length; i++) {
      promises.push(parseFile(files[i]));
    }

    const results = await Promise.all(promises);
    totalNewEntries = results.reduce((a, b) => a + b, 0);

    // Resolve MED-LV to MED-UNP (first 7 calendar days) and MED-P (remaining)
    const allDates = Object.keys(newLogs).sort();
    let blockStartDate: Date | null = null;
    let lastMedLvDate: Date | null = null;

    for (const d of allDates) {
      const entries = newLogs[d];
      let hasMedLv = false;
      for (const e of entries) {
        if (e.type === 'MED-LV' || e.type === 'MED-UNP' || e.type === 'MED-P') {
          hasMedLv = true;
          break;
        }
      }
      
      if (hasMedLv) {
        const currDate = new Date(d + "T00:00:00");
        if (lastMedLvDate) {
          const diffDays = (currDate.getTime() - lastMedLvDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30) { 
            blockStartDate = currDate;
          }
        } else {
          blockStartDate = currDate;
        }
        
        const daysSinceStart = blockStartDate ? Math.floor((currDate.getTime() - blockStartDate.getTime()) / (1000 * 3600 * 24)) + 1 : 1;
        
        for (const e of entries) {
          if (e.type === 'MED-LV' || e.type === 'MED-UNP' || e.type === 'MED-P') {
            if (e.type === 'MED-LV') {
              e.type = daysSinceStart <= 7 ? 'MED-P-PTO' : 'MED-P';
            }
          }
        }
        lastMedLvDate = currDate;
      }
    }

    let finalMessage = "";
    if (totalNewEntries > 0) {
      updateLogs(newLogs);
      if (lastFoundMonth !== null && lastFoundYear !== null) { 
        setViewMonth(lastFoundMonth); 
        setViewYear(lastFoundYear); 
      }
      finalMessage = `Successfully imported ${totalNewEntries} total shifts from ${files.length} file(s)!`;
    } else {
      finalMessage = "No new valid shifts detected in the selected files. Ensure they are the correct RosterApps 'Month Calendar' format.";
    }

    if (importErrors.length > 0) {
      finalMessage += "\n\nIssues encountered:\n" + importErrors.join("\n");
    }

    setImportMessage(finalMessage);
    openModal('importSuccess');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data || typeof data !== 'object') {
          throw new Error("Invalid format");
        }
        setPendingRestoreData(data);
        openModal('confirmRestore');
      } catch (err) { 
        setImportMessage("Error reading backup file. The file is not a valid JSON backup."); 
        openModal('importSuccess');
      }
      if (backupInputRef.current) backupInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const executeRestoreData = () => {
    if (!pendingRestoreData) return;
    const data = pendingRestoreData;
    try {
      if (data.logs && typeof data.logs === 'object' && !Array.isArray(data.logs)) {
        updateLogs(data.logs);
      }
      if (data.midCounts && typeof data.midCounts === 'object' && !Array.isArray(data.midCounts)) {
        updateMidCounts(data.midCounts);
      }
      if (data.fmlaCases && Array.isArray(data.fmlaCases)) {
        updateFmlaCases(data.fmlaCases);
      }
      if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
        overwriteSettings(data.settings);
      }
      if (data.cardPrefs && typeof data.cardPrefs === 'object' && !Array.isArray(data.cardPrefs)) {
        updateCardPrefs(data.cardPrefs);
      }
      
      if (data.backup_metadata?.view_state) {
        const y = parseInt(data.backup_metadata.view_state.year, 10);
        const m = parseInt(data.backup_metadata.view_state.month, 10);
        if (!isNaN(y)) setViewYear(y);
        if (!isNaN(m)) setViewMonth(m);
      }
      
      if (data.backup_metadata?.theme) {
        setTheme(data.backup_metadata.theme);
      }

      if (data.backup_metadata?.is_locked !== undefined) {
        setIsLocked(!!data.backup_metadata.is_locked);
      }

      if (data.backup_metadata?.locked_months !== undefined && Array.isArray(data.backup_metadata.locked_months)) {
        setLockedMonths(data.backup_metadata.locked_months);
        localStorage.setItem('swa_lockedMonths', JSON.stringify(data.backup_metadata.locked_months));
      }
      
      setImportMessage("Backup Restored!");
      openModal('importSuccess');
    } catch (err) { 
      setImportMessage("Error restoring backup file."); 
      openModal('importSuccess');
    }
    setPendingRestoreData(null);
    closeModal('confirmRestore');
  };

  const getYearBaseSalary = () => {
    const ds = `${viewYear}-01-01`;
    const { salary } = getEffectiveSalaryAndLevel(ds, settings);
    return "$" + salary.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  };

  const calculatedSalary = () => {
    const ds = `${viewYear}-03-01`;
    const { salary } = getEffectiveSalaryAndLevel(ds, settings);
    return "$" + salary.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  };

  const endOfYearSalary = () => {
    const ds = `${viewYear}-12-31`;
    const { salary } = getEffectiveSalaryAndLevel(ds, settings);
    return "$" + salary.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  };

  const effectiveLevel = () => {
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const { level } = getEffectiveSalaryAndLevel(ds, settings);
    return level;
  };

  const hourlyRate = () => {
    const base = getRawSalary(settings.salary);
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const { salary } = getEffectiveSalaryAndLevel(ds, settings);
    const hrlyBase = base / 2080; 
    const hrlyEff = salary / 2080;
    return "$" + hrlyBase.toFixed(2) + " / $" + hrlyEff.toFixed(2);
  };

  return (
    <div className={`min-h-screen bg-[var(--bg-grey)] text-[var(--text-main)] font-sans transition-colors duration-300 ${isLocked ? 'is-locked' : ''}`}>
      <Header 
        theme={theme}
        toggleTheme={toggleTheme} 
        openSettings={() => openModal('settings')} 
        openGuide={() => openModal('userGuide')}
        isLocked={isLocked}
        user={user}
        login={login}
        logout={logout}
        backupToSheets={() => {
          showToast('Backing up to Google Sheets...', 'info');
          syncToGoogleSheets({ logs, midCounts, fmlaCases, cardPrefs, settings, lockedMonths })
            .then(() => showToast('Backup to Google Sheets successful!', 'success'))
            .catch((e: Error) => showToast('Failed to backup: ' + e.message, 'error'));
        }}
        forceSyncToCloud={async () => {
          showToast('Pushing local data to Firebase cloud...', 'info');
          const success = await forceSyncToCloud();
          if (success) {
            showToast('Data pushed to cloud successfully!', 'success');
          } else {
            showToast('Failed to push data to cloud.', 'error');
          }
        }}
        pullFromCloud={async () => {
          showToast('Pulling data from cloud...', 'info');
          try {
            const success = await pullFromCloud();
            if (success) {
              showToast('Data successfully pulled and updated!', 'success');
            } else {
              showToast('No cloud data found.', 'warning');
            }
          } catch (e: any) {
            console.warn('Pull from cloud failed:', e);
            showToast('Unable to pull cloud data. The network is offline or unavailable.', 'error');
          }
        }}
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto my-3 px-4 pb-10"
      >
        <SettingsBar 
          settings={settings} 
          updateSettings={updateSettings} 
          baseSalary={getYearBaseSalary()}
          calculatedSalary={calculatedSalary()}
          endOfYearSalary={endOfYearSalary()}
          hourlyRate={hourlyRate()}
          fmlaCases={fmlaCases}
          logs={logs}
          viewYear={viewYear}
          effectiveLevel={effectiveLevel()}
          resetAppData={resetAppData}
        />

        {stats && (
          <Dashboard 
            cardPrefs={cardPrefs} 
            updateCardPrefs={updateCardPrefs}
            stats={stats} 
            isYearView={isYearView}
            fmlaCases={fmlaCases}
            logs={logs}
            isLocked={isLocked}
            viewYear={viewYear}
          />
        )}

        <Controls 
          viewMonth={viewMonth}
          viewYear={viewYear}
          isYearView={isYearView}
          moveMonth={changeMonth}
          moveYear={changeYear}
          setViewMonth={setViewMonth}
          jumpToToday={() => { setViewMonth(new Date().getMonth()); setViewYear(new Date().getFullYear()); setIsYearView(false); }}
          toggleView={() => setIsYearView(!isYearView)}
          undoLogs={undoLogs}
          canUndo={logsHistory.length > 0}
          isLocked={isLocked}
          copyPreviousMonth={copyPreviousMonth}
          exportICS={() => exportICS(logs)}
          lockedMonths={lockedMonths}
          toggleLockMonth={toggleLockMonth}
          triggerClearMonth={triggerClearMonth}
        />

        <Calendar 
          isMobile={isMobile}
          viewMonth={viewMonth}
          viewYear={viewYear}
          isYearView={isYearView}
          direction={direction}
          changeMonth={changeMonth}
          logs={logs}
          fmlaCases={fmlaCases}
          hireDate={settings.hireDate}
          midCounts={midCounts}
          settings={settings}
          openModal={handleOpenAddBlock}
          openEditBlock={handleOpenEditBlock}
          removeEntry={removeEntry}
          showPaycheckAudit={(y, m, d) => {
             setSelectedPaycheck({y, m, d});
             openModal('paycheckAudit');
          }}
          setViewMonth={setViewMonth}
          setIsYearView={setIsYearView}
          isLocked={isLocked}
          lockedMonths={lockedMonths}
          toggleLockMonth={toggleLockMonth}
          triggerClearMonth={triggerClearMonth}
        />

        <div className="flex gap-3 mt-8 flex-wrap justify-center items-center">
          {!isLocked && (
            <>
              <button 
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card-bg)] border-2 border-[var(--border-color)] text-[var(--pay-green)] font-black rounded-xl text-xs transition-all hover:border-[var(--pay-green)] hover:shadow-sm cursor-pointer" 
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                Smart Import (CSV/HTML/XML/Excel)
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls, .html, .htm, .xml" multiple onChange={handleSmartImport} />
            </>
          )}
          
          <button 
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card-bg)] border-2 border-[var(--border-color)] text-[var(--pay-green)] font-black rounded-xl text-xs transition-all hover:border-[var(--pay-green)] hover:shadow-sm cursor-pointer" 
            onClick={() => exportCSV(logs)}
          >
            <Download size={14} />
            Export to Excel
          </button>

          <button 
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card-bg)] border-2 border-[var(--border-color)] text-[var(--swa-blue)] font-black rounded-xl text-xs transition-all hover:border-[var(--swa-blue)] hover:shadow-sm cursor-pointer" 
            onClick={handleBackup}
          >
            <Download size={14} />
            Backup JSON
          </button>

          <button 
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card-bg)] border-2 border-[var(--border-color)] text-[var(--ra-purple)] font-black rounded-xl text-xs transition-all hover:border-[var(--ra-purple)] hover:shadow-sm cursor-pointer" 
            onClick={() => backupInputRef.current?.click()}
          >
            <RotateCcw size={14} />
            Restore JSON
          </button>
          <input type="file" ref={backupInputRef} className="hidden" accept=".json" onChange={handleImportBackup} />
        </div>
        
        {!isLocked && (
          <div className="text-center mt-6">
            <button 
              onClick={() => openModal('confirmReset')} 
              className="flex items-center gap-2 mx-auto bg-[var(--card-bg)] border-2 border-red-200 text-[var(--swa-red)] px-6 py-2.5 font-black cursor-pointer rounded-xl text-[11px] transition-all hover:border-[var(--swa-red)] hover:bg-[var(--swa-red)] hover:text-white shadow-sm"
            >
              <Trash2 size={14} />
              RESET ALL CALENDAR DATA
            </button>
          </div>
        )}
      </motion.div>

      <footer className="mt-12 mb-20 px-6 text-center">
        <p className="text-[10px] text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed opacity-60">
          <span className="font-bold text-[var(--swa-red)] uppercase tracking-widest mr-1">Disclaimer:</span>
          Use at your own risk. You are solely responsible for keeping track of your own balances and updating your schedules accurately on this app. This tool is for estimation and tracking purposes only.
        </p>
      </footer>

      {/* Auto-saved Persisted Indicator */}
      <AnimatePresence>
        {showSavedIndicator && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-6 left-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-400 px-4 py-2.5 rounded-full flex items-center gap-2 text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-sm z-[999] pointer-events-none"
          >
            <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" />
            <span>Changes Saved</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Lock Toggle */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsLocked(!isLocked)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-[999] transition-all lock-toggle ${isLocked ? 'bg-[var(--swa-red)] text-white' : 'bg-[var(--swa-blue)] text-white'}`}
      >
        {isLocked ? <Lock size={24} /> : <Unlock size={24} />}
      </motion.button>

      {/* Confirm Reset Modal */}
      {modalsState.confirmReset && (
        <div className="modal flex" onClick={(e) => { if (e.target === e.currentTarget) closeModal('confirmReset'); }}>
          <div className="modal-box max-w-[420px]">
            <h3 className="text-center text-[var(--swa-red)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5 flex items-center justify-center gap-2">
              <Trash2 size={18} className="text-[var(--swa-red)]" />
              Reset & Erase Options
            </h3>
            <p className="text-center text-[var(--text-main)] my-4 text-xs font-semibold leading-relaxed">
              Please choose a reset option. These actions are permanent and cannot be undone!
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <button 
                className="w-full py-3 bg-[var(--swa-red)]/10 text-[var(--swa-red)] font-black rounded-xl text-xs uppercase tracking-widest transition-all hover:bg-[var(--swa-red)]/20 active:scale-[0.98]"
                onClick={() => {
                  updateLogs({});
                  updateMidCounts({});
                  closeModal('confirmReset');
                  showToast("Calendar schedule entries cleared successfully.", 'warning');
                }}
              >
                Clear Calendar Entries Only
              </button>
              <button 
                className="w-full py-3 bg-[var(--swa-red)] text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all hover:brightness-110 shadow-md active:scale-[0.98]"
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
              >
                Factory Reset All Data (Erase All)
              </button>
              <button className="modal-btn btn-cancel mt-2" onClick={() => closeModal('confirmReset')}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Restore Modal */}
      {modalsState.confirmRestore && (
        <div className="modal flex" onClick={(e) => { if (e.target === e.currentTarget) { closeModal('confirmRestore'); setPendingRestoreData(null); } }}>
          <div className="modal-box max-w-[450px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5 flex items-center justify-center gap-2">
              <RotateCcw size={18} className="text-[var(--swa-blue)]" />
              Confirm Backup Restoration
            </h3>
            <p className="text-center text-[var(--text-main)] my-4 text-sm leading-relaxed font-semibold">
              Warning: Restoring this backup will <span className="text-[var(--swa-red)] font-black">overwrite all your current logs, settings, and other data</span> with the backup file contents.
            </p>
            {pendingRestoreData?.backup_metadata && (
              <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-3.5 mb-4 text-xs space-y-1 text-left font-semibold text-[var(--text-muted)]">
                <p className="font-black text-[var(--swa-blue)] uppercase tracking-wider text-[10px] mb-1.5">Backup Metadata:</p>
                {pendingRestoreData.backup_metadata.exported_at && (
                  <p>📅 Exported At: <span className="text-[var(--text-main)]">{new Date(pendingRestoreData.backup_metadata.exported_at).toLocaleString()}</span></p>
                )}
                {pendingRestoreData.backup_metadata.view_state && (
                  <p>👁️ Saved View State: <span className="text-[var(--text-main)]">{new Date(pendingRestoreData.backup_metadata.view_state.year, pendingRestoreData.backup_metadata.view_state.month).toLocaleString('default', { month: 'long', year: 'numeric' })}</span></p>
                )}
                {pendingRestoreData.backup_metadata.theme && (
                  <p>🎨 Theme: <span className="text-[var(--text-main)] uppercase">{pendingRestoreData.backup_metadata.theme}</span></p>
                )}
                {pendingRestoreData.logs && (
                  <p>📊 Total Calendar Entries: <span className="text-[var(--text-main)] font-black">{Object.keys(pendingRestoreData.logs).length} days logged</span></p>
                )}
              </div>
            )}
            <div className="flex gap-2.5 mt-4">
              <button className="modal-btn bg-[var(--pay-green)] flex-1 text-white font-black" onClick={executeRestoreData}>YES, RESTORE BACKUP</button>
              <button className="modal-btn btn-cancel flex-1 font-bold" onClick={() => { closeModal('confirmRestore'); setPendingRestoreData(null); }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Success Modal */}
      {modalsState.importSuccess && (
        <div className="modal flex" onClick={(e) => { if (e.target === e.currentTarget) closeModal('importSuccess'); }}>
          <div className="modal-box max-w-[450px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Import Status</h3>
            <div className="text-center text-[var(--text-main)] my-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto px-2">
              {importMessage}
            </div>
            <button className="modal-btn btn-cancel mt-4" onClick={() => closeModal('importSuccess')}>CLOSE</button>
          </div>
        </div>
      )}

      <Modals 
        activeDate={activeDate}
        editDate={editDate}
        editIndex={editIndex}
        logs={logs}
        fmlaCases={fmlaCases}
        settings={settings}
        cardPrefs={cardPrefs}
        viewYear={viewYear}
        viewMonth={viewMonth}
        midCounts={midCounts}
        currentAttHistory={currentAttHistory}
        stats={stats}
        executeSave={executeSave}
        removeEntry={removeEntry}
        saveEditBlock={saveEditBlock}
        addFmlaCase={addFmlaCase}
        updateFmlaCase={updateFmlaCase}
        removeFmlaCase={removeFmlaCase}
        setOverride={setOverride}
        updateToggles={updateCardPrefs}
        saveBulkMid={saveBulkMid}
        addManualInfraction={addManualInfraction}
        updateLogs={updateLogs}
        logHrs={logHrs}
        setLogHrs={setLogHrs}
        updateSettings={updateSettings}
        selectedPaycheck={selectedPaycheck}
        clearMonthData={clearMonthData}
        duplicateEntryToNextDay={duplicateEntryToNextDay}
        ptoWarningMessage={ptoWarningMessage}
        clearTarget={clearTarget}
        lockedMonths={lockedMonths}
      />
    </div>
  );
}
