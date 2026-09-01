import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Clock, DollarSign, TrendingUp, Calendar, AlertCircle, 
  ShieldAlert, Zap, Moon, PlusCircle, X, Trash2, Info, ShieldCheck, 
  ChevronDown, ChevronRight, BookOpen, HelpCircle, Download, Upload, 
  FileJson, FileSpreadsheet, CheckCircle2, Plus, Edit2, Briefcase, 
  Percent, User, ExternalLink, Cloud
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { LogEntry, FmlaCase, Settings } from '../types';
import { getBlockLabel, getBlockTooltip, getBlockClass, getBlockStartHour, calculatePay, getMidRate, getPtoBalanceOnDate, processEntryWithBalances, getFmlaMonthStats, getEffectiveSalaryAndLevel, formatPto, getAutoStiStats } from '../utils/calculations';
import { swaHolidays } from '../utils/constants';
import { useModalStore } from '../store/useModalStore';

interface ModalsProps {
  activeDate: string;
  editDate: string | null;
  editIndex: number | null;
  logs: Record<string, LogEntry[]>;
  fmlaCases: FmlaCase[];
  settings: Settings;
  cardPrefs: any;
  viewYear: number;
  midCounts: any;
  currentAttHistory: any[];
  stats: any;
  
  executeSave: (type: string, fmlaCaseNum?: string, overrideHrs?: string, extraOptions?: any) => void;
  removeEntry: (d: string, i: number) => void;
  saveEditBlock: (entry: LogEntry) => void;
  addFmlaCase: (c: FmlaCase) => void;
  updateFmlaCase: (idx: number, c: FmlaCase) => void;
  removeFmlaCase: (idx: number) => void;
  setOverride: (val: string) => void;
  updateToggles: (prefs: any) => void;
  saveBulkMid: (m: number, val: string) => void;
  addManualInfraction: (ds: string, type: string, hrs: number, cover: boolean) => void;
  updateLogs: (logs: Record<string, LogEntry[]>) => void;
  
  logHrs: string;
  setLogHrs: (v: string) => void;
  updateSettings: (newSettings: Partial<Settings>) => void;
  selectedPaycheck: {y: number, m: number, d: number} | null;
  viewMonth: number;
  clearMonthData: () => void;
  duplicateEntryToNextDay: (dateStr: string, entryIndex: number) => void;
  ptoWarningMessage?: string;
  clearTarget: { year: number, month: number } | null;
  lockedMonths: string[];
}

export const Modals: React.FC<ModalsProps> = (props) => {
  const {
    activeDate, editDate, editIndex, logs, fmlaCases, settings, cardPrefs, viewYear, viewMonth, midCounts, currentAttHistory, stats,
    executeSave, removeEntry, saveEditBlock, addFmlaCase, updateFmlaCase, removeFmlaCase, setOverride, updateToggles, saveBulkMid, addManualInfraction, updateLogs,
    logHrs, setLogHrs, updateSettings, selectedPaycheck, clearMonthData, duplicateEntryToNextDay, ptoWarningMessage,
    clearTarget, lockedMonths
  } = props;

  const { modals: modalsState, openModal, closeModal } = useModalStore();

  const [subView, setSubView] = useState<string>('MAIN');
  const [showMidDates, setShowMidDates] = useState(false);
  const [otRule, setOtRule] = useState('std');
  const [otAddStart, setOtAddStart] = useState('');
  const [otAddEnd, setOtAddEnd] = useState('');
  const [wopHrs, setWopHrs] = useState('8');
  const [ptoHrs, setPtoHrs] = useState('8');
  const [unschedHrs, setUnschedHrs] = useState('8');
  const [coverWithPto, setCoverWithPto] = useState(true);
  const [pendingFmlaType, setPendingFmlaType] = useState<string | null>(null);
  const [infractionTab, setInfractionTab] = useState<'active' | 'calendar'>('active');

  // Correction Modal State
  const [corrDate, setCorrDate] = useState(settings.correctionDate || '');
  const [corrPto, setCorrPto] = useState(settings.correctionStartPto || '0');

  useEffect(() => {
    setCorrDate(settings.correctionDate || '');
    setCorrPto(settings.correctionStartPto || '0');
  }, [settings.correctionDate, settings.correctionStartPto]);

  // Accrual Override State
  const [accDate, setAccDate] = useState(settings.accrualChangeDate || '');
  const [accRate, setAccRate] = useState(settings.customAccrualRate || '');
  const [accCap, setAccCap] = useState(settings.customAccrualCap || '');

  useEffect(() => {
    setAccDate(settings.accrualChangeDate || '');
    setAccRate(settings.customAccrualRate || '');
    setAccCap(settings.customAccrualCap || '');
  }, [settings.accrualChangeDate, settings.customAccrualRate, settings.customAccrualCap]);

  // Edit Block State
  const [ebType, setEbType] = useState('');
  const [ebOtRule, setEbOtRule] = useState('std');
  const [ebFmlaCase, setEbFmlaCase] = useState('');
  const [ebStart, setEbStart] = useState('');
  const [ebEnd, setEbEnd] = useState('');
  const [ebHrs, setEbHrs] = useState('8');
  const [newPayEvent, setNewPayEvent] = useState({ date: '', type: 'Raise', oldSalary: '', newSalary: '', level: '', note: '' });
  const [editingPayEventId, setEditingPayEventId] = useState<string | null>(null);

  const addPayHistoryEvent = () => {
    if (!newPayEvent.date || !newPayEvent.newSalary) return;
    const history = settings.payHistory || [];
    
    if (editingPayEventId) {
      const updatedHistory = history.map(e => e.id === editingPayEventId ? { ...newPayEvent, id: editingPayEventId } : e);
      
      const sortedHistory = [...updatedHistory].sort((a, b) => new Date(b.date + "T00:00:00").getTime() - new Date(a.date + "T00:00:00").getTime());
      const latestLevel = sortedHistory.find(e => e.level)?.level || settings.empLevel;
      let newStiBonusPct = settings.stiBonusPct;
      if (latestLevel === 'P1') newStiBonusPct = '0';
      else if (latestLevel === 'P2') newStiBonusPct = '4';
      else if (latestLevel === 'P3' || latestLevel === 'P4') newStiBonusPct = '5';

      updateSettings({ 
        payHistory: updatedHistory,
        stiBonusPct: newStiBonusPct
      });
      setEditingPayEventId(null);
    } else {
      const newId = Date.now().toString();
      const updatedHistory = [...history, { ...newPayEvent, id: newId }];
      
      // Auto-update stiBonusPct based on latest level
      const sortedHistory = [...updatedHistory].sort((a, b) => new Date(b.date + "T00:00:00").getTime() - new Date(a.date + "T00:00:00").getTime());
      const latestLevel = sortedHistory.find(e => e.level)?.level || settings.empLevel;
      let newStiBonusPct = settings.stiBonusPct;
      if (latestLevel === 'P1') newStiBonusPct = '0';
      else if (latestLevel === 'P2') newStiBonusPct = '4';
      else if (latestLevel === 'P3' || latestLevel === 'P4') newStiBonusPct = '5';

      updateSettings({ 
        payHistory: updatedHistory,
        stiBonusPct: newStiBonusPct
      });
    }
    
    setNewPayEvent({ date: '', type: 'Raise', oldSalary: '', newSalary: '', level: '', note: '' });
  };

  const startEditPayHistoryEvent = (event: any) => {
    setEditingPayEventId(event.id);
    setNewPayEvent({
      date: event.date,
      type: event.type,
      oldSalary: event.oldSalary || '',
      newSalary: event.newSalary || '',
      level: event.level || '',
      note: event.note || ''
    });
  };

  const cancelEditPayHistoryEvent = () => {
    setEditingPayEventId(null);
    setNewPayEvent({ date: '', type: 'Raise', oldSalary: '', newSalary: '', level: '', note: '' });
  };

  const removePayHistoryEvent = (id: string) => {
    const history = settings.payHistory || [];
    const updatedHistory = history.filter(e => e.id !== id);
    
    const sortedHistory = [...updatedHistory].sort((a, b) => new Date(b.date + "T00:00:00").getTime() - new Date(a.date + "T00:00:00").getTime());
    const latestLevel = sortedHistory.find(e => e.level)?.level || settings.empLevel;
    let newStiBonusPct = settings.stiBonusPct;
    if (latestLevel === 'P1') newStiBonusPct = '0';
    else if (latestLevel === 'P2') newStiBonusPct = '4';
    else if (latestLevel === 'P3' || latestLevel === 'P4') newStiBonusPct = '5';

    updateSettings({ 
      payHistory: updatedHistory,
      stiBonusPct: newStiBonusPct
    });
  };

  const [ebNote, setEbNote] = useState('');
  const [ebCoverWithPto, setEbCoverWithPto] = useState(true);

  // FMLA Manager State
  const [newFmlaCase, setNewFmlaCase] = useState('');
  const [newFmlaRel, setNewFmlaRel] = useState('Self');
  const [newFmlaStart, setNewFmlaStart] = useState('');
  const [newFmlaBal, setNewFmlaBal] = useState('');
  const [newFmlaFreqEpi, setNewFmlaFreqEpi] = useState('');
  const [newFmlaFreqDays, setNewFmlaFreqDays] = useState('');
  const [newFmlaContinuousWeeks, setNewFmlaContinuousWeeks] = useState('');
  const [newFmlaLeaveType, setNewFmlaLeaveType] = useState<'Intermittent' | 'Continuous' | 'Medical Leave'>('Intermittent');
  const [newFmlaNote, setNewFmlaNote] = useState('');
  const [editingFmlaIndex, setEditingFmlaIndex] = useState<number | null>(null);
  const [bulkFmlaEdits, setBulkFmlaEdits] = useState<Record<string, { hrs: string, fmlaCase: string }>>({});

  // Manual Infraction State
  const [manualAttDate, setManualAttDate] = useState('');
  const [manualAttType, setManualAttType] = useState('UNPTO');
  const [manualAttHrs, setManualAttHrs] = useState('8');
  const [manualAttCover, setManualAttCover] = useState(true);

  // Override State
  const [overrideDate, setOverrideDate] = useState('');

  // Bulk Add State
  const [baStartDate, setBaStartDate] = useState('');
  const [baEndDate, setBaEndDate] = useState('');
  const [baType, setBaType] = useState('WORK-AM');
  const [baHrs, setBaHrs] = useState('8');

  // STI Modal State
  const [stiBonusPct, setStiBonusPct] = useState(settings.stiBonusPct);
  const [stiCompanyPct, setStiCompanyPct] = useState(settings.stiCompanyPct);
  const [stiPersonalPct, setStiPersonalPct] = useState(settings.stiPersonalPct);
  const [stiBaseSalary, setStiBaseSalary] = useState('');
  const [stiPeriods, setStiPeriods] = useState<any[]>([]);
  const [stiDaysInYear, setStiDaysInYear] = useState<number>(365);

  // Time Off Details State
  const [expandPto, setExpandPto] = useState(false);
  const [expandFmlaP, setExpandFmlaP] = useState(false);
  const [expandFmlaUnp, setExpandFmlaUnp] = useState(false);
  const [expandHol, setExpandHol] = useState(false);
  const [expandLostWages, setExpandLostWages] = useState(false);
  const [expandExtraPay, setExpandExtraPay] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState('overview');

  const [isEditingDeductions, setIsEditingDeductions] = useState(false);
  const [editK401Pct, setEditK401Pct] = useState('');
  const [editInsuranceDed, setEditInsuranceDed] = useState('');

  const { showToast } = useToast();

  useEffect(() => {
    if (modalsState.sti) {
      const perfYear = viewYear - 1;
      const { effectiveBaseSalary, effectiveBonusPct, daysInYear, periods } = getAutoStiStats(perfYear, settings);
      
      setStiBaseSalary(effectiveBaseSalary.toFixed(2));
      setStiBonusPct(effectiveBonusPct.toFixed(2));
      setStiCompanyPct(settings.stiCompanyPct || '100');
      setStiPersonalPct(settings.stiPersonalPct || '100');
      setStiPeriods(periods);
      setStiDaysInYear(daysInYear);
    }
  }, [modalsState.sti, viewYear, settings]);

  useEffect(() => {
    if (modalsState.override) {
      setOverrideDate('');
    }
  }, [modalsState.override]);

  const handleAddBulkShifts = () => {
    if (!baStartDate || !baEndDate) {
      showToast("Please select both start and end dates.", 'error');
      return;
    }
    const start = new Date(baStartDate + "T00:00:00");
    const end = new Date(baEndDate + "T00:00:00");
    if (start > end) {
      showToast("Start date must be before end date.", 'error');
      return;
    }

    const newLogs = { ...logs };
    let currentDate = new Date(start);
    let addedCount = 0;
    let anyWarning = '';

    while (currentDate <= end) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      
      const hrs = parseFloat(baHrs) || 8;
      
      const dayEntries = newLogs[dateStr] ? [...newLogs[dateStr]] : [];
      const entry = { type: baType, hrs, otRule: 'std' };
      
      const isWorkShift = (t: string) => t === 'WORK' || t.startsWith('WORK-');
      let skipDay = false;
      if (isWorkShift(baType)) {
        const hasOffDay = dayEntries.some(e => {
          const t = e.type;
          return t === 'PTO' || t === 'WOP' || t === 'HOL' || t === 'UNPTO' || 
                 t === 'FMLA-P' || t === 'FML-UNP' || t === 'MED-P-PTO' || 
                 t === 'MED-UNP' || t === 'MED-LV';
        });
        const isAlreadyAdded = dayEntries.some(e => e.type === baType && e.hrs === hrs);
        if (!hasOffDay && isAlreadyAdded) {
          skipDay = true;
        }
      }

      if (!skipDay) {
        const { entries, warning } = processEntryWithBalances(
          entry,
          dateStr,
          newLogs,
          dayEntries,
          settings,
          fmlaCases
        );
        
        if (warning) anyWarning = warning;
        
        dayEntries.push(...entries);
        newLogs[dateStr] = dayEntries;
        addedCount++;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (addedCount > 0) {
      updateLogs(newLogs);
      closeModal('bulkAdd');
      showToast(`Successfully added ${addedCount} shifts.`, 'success');
      if (anyWarning) {
        setTimeout(() => showToast("Some entries were converted due to insufficient balances.", 'error'), 500);
      }
    } else {
      showToast("No shifts were added. Check your date range and selected days.", 'error');
    }
  };

  const handleSaveSti = () => {
    const base = parseFloat(stiBaseSalary) || 0;
    const bonusPct = parseFloat(stiBonusPct) || 0;
    const compPct = parseFloat(stiCompanyPct) || 0;
    const persPct = parseFloat(stiPersonalPct) || 0;
    const bonus = (bonusPct / 100) * base * (compPct / 100) * (persPct / 100);
    
    updateSettings({
      stiBonusPct: stiBonusPct,
      stiCompanyPct: stiCompanyPct,
      stiPersonalPct: stiPersonalPct,
      stiBonus: bonus.toFixed(2)
    });
    closeModal('sti');
  };

  useEffect(() => {
    if (modalsState.bulkFmlaEdit) {
      const initialEdits: Record<string, { hrs: string, fmlaCase: string }> = {};
      Object.keys(logs).forEach(date => {
        if (Array.isArray(logs[date])) {
          logs[date].forEach((entry, index) => {
            if (entry.type === 'FMLA-P' || entry.type === 'FML-UNP') {
              initialEdits[`${date}-${index}`] = {
                hrs: entry.hrs ? entry.hrs.toString() : '8',
                fmlaCase: entry.fmlaCase || ''
              };
            }
          });
        }
      });
      setBulkFmlaEdits(initialEdits);
    }
  }, [modalsState.bulkFmlaEdit, logs]);

  useEffect(() => {
    if (modalsState.addBlock && activeDate) {
      setSubView('MAIN');
      setLogHrs('8');
      setOtAddStart('');
      setOtAddEnd('');
      setOtRule('std');
    }
  }, [modalsState.addBlock, activeDate]);

  useEffect(() => {
    if (modalsState.editBlock && editDate && editIndex !== null && logs[editDate] && logs[editDate][editIndex]) {
      const entry = logs[editDate][editIndex];
      setEbType(entry.type);
      
      let rule = entry.otRule || 'std';
      if (rule === 'straight' || rule === 'conj') rule = 'conj_shift';
      if (rule === 'double') rule = 'dt';
      setEbOtRule(rule);

      setEbFmlaCase(entry.fmlaCase || '');
      setEbHrs(entry.hrs ? entry.hrs.toString() : '8');
      setEbNote(entry.note || '');
      setEbCoverWithPto(entry.coverWithPto !== undefined ? entry.coverWithPto : (entry.type === 'TARDY' ? true : false));
      
      let defaultStart = "";
      let defaultEnd = "";
      
      if (entry.label) {
        const m = entry.label.match(/^(\d{2}):?(\d{2})\s*-\s*(\d{2}):?(\d{2})/);
        if (m) {
          defaultStart = `${m[1]}:${m[2]}`;
          defaultEnd = `${m[3]}:${m[4]}`;
        }
      } else if (entry.type.startsWith('WORK-')) {
        const times: Record<string, string[]> = { 'WORK-AM': ['06:00','14:00'], 'WORK-PM': ['14:00','22:00'], 'WORK-MID': ['22:00','06:00'], 'WORK-SW1': ['10:00','18:00'], 'WORK-SW2': ['18:00','02:00'], 'WORK-SW3': ['02:00','10:00'], 'WORK-PROJ': ['08:00','04:00'] };
        if (times[entry.type]) {
          defaultStart = times[entry.type][0];
          defaultEnd = times[entry.type][1];
        }
      }
      setEbStart(defaultStart);
      setEbEnd(defaultEnd);
    }
  }, [modalsState.editBlock, editDate, editIndex, logs]);

  const handleOtTimeChange = (start: string, end: string) => {
    setOtAddStart(start);
    setOtAddEnd(end);
    if (start && end) {
      const sParts = start.split(':');
      const eParts = end.split(':');
      const s = parseInt(sParts[0], 10) + (parseInt(sParts[1], 10)/60);
      const e = parseInt(eParts[0], 10) + (parseInt(eParts[1], 10)/60);
      let hrs = e - s;
      if (hrs <= 0) hrs += 24;
      setLogHrs(parseFloat(hrs.toFixed(2)).toString());
    }
  };

  const handleEbTimeChange = (start: string, end: string) => {
    setEbStart(start);
    setEbEnd(end);
    if (start && end) {
      const sParts = start.split(':');
      const eParts = end.split(':');
      const s = parseInt(sParts[0], 10) + (parseInt(sParts[1], 10)/60);
      const e = parseInt(eParts[0], 10) + (parseInt(eParts[1], 10)/60);
      let hrs = e - s;
      if (hrs <= 0) hrs += 24;
      setEbHrs(parseFloat(hrs.toFixed(2)).toString());
    }
  };

  const handleSaveEditBlock = () => {
    let label = "";
    if (ebStart && ebEnd) {
      const sLabel = ebStart.replace(':', '');
      const eLabel = ebEnd.replace(':', '');
      label = `${sLabel}-${eLabel}`;
    }
    
    const entry: LogEntry = {
      type: ebType,
      hrs: parseFloat(ebHrs) || 8,
      otRule: ebType === 'OT' ? ebOtRule : 'std',
      note: ebNote
    };
    
    if (ebType === 'FMLA-P' || ebType === 'FML-UNP') {
      entry.fmlaCase = ebFmlaCase;
    }
    if (label !== "") {
      entry.label = label;
    }
    if (['TARDY', 'NO-SHOW'].includes(ebType)) {
      entry.unpaidHrs = entry.hrs;
      entry.coverWithPto = ebCoverWithPto;
    }
    
    saveEditBlock(entry);
    closeModal('editBlock');
  };

  const handleAddGenericShift = () => {
    executeSave('WORK');
    closeModal('addBlock');
  };

  const handlePromptWop = () => {
    const parsedHrs = parseFloat(wopHrs);
    if (!isNaN(parsedHrs) && parsedHrs > 0) {
      setLogHrs(parsedHrs.toString());
      // We need to wait for state to update or pass it directly.
      // Since executeSave uses logHrs state, we'll pass it as a third parameter
      // or just update logs directly here.
      executeSave('WOP', '', parsedHrs.toString());
    } else {
      showToast("Invalid hours entered.", 'error');
    }
  };

  const handlePromptPto = () => {
    const parsedHrs = parseFloat(ptoHrs);
    if (!isNaN(parsedHrs) && parsedHrs > 0) {
      setLogHrs(parsedHrs.toString());
      executeSave('PTO', '', parsedHrs.toString());
    } else {
      showToast("Invalid hours entered.", 'error');
    }
  };

  const triggerFmlaCaseSelect = (type: string) => {
    if (fmlaCases.length === 0) {
      showToast("No FMLA cases found! Please go to Settings > Manage Cases to add your FMLA case first.", 'error');
      return;
    }
    
    if (fmlaCases.length === 1) {
      executeSave(type, fmlaCases[0].num);
    } else {
      setPendingFmlaType(type);
      closeModal('addBlock');
      openModal('fmlaCase');
    }
  };

  const processFmlaSave = (caseNum: string) => {
    closeModal('fmlaCase');
    if (pendingFmlaType) {
      executeSave(pendingFmlaType, caseNum);
    }
  };

  const handleAddFmlaCase = () => {
    if(!newFmlaCase) return showToast('Please enter a case number.', 'error');
    if(!newFmlaStart) return showToast('Please provide a Start Date for expiration tracking.', 'error');
    
    const freqEpi = parseInt(newFmlaFreqEpi) || 0;
    const freqDays = parseInt(newFmlaFreqDays) || 0;
    const freqStr = (freqEpi && freqDays) ? `${freqEpi} episodes / ${freqDays} days` : '';
    
    const isContinuous = newFmlaLeaveType === 'Continuous';
    const isMedicalLeave = newFmlaLeaveType === 'Medical Leave';

    const caseData = {
      num: newFmlaCase.trim(),
      rel: newFmlaRel,
      startD: newFmlaStart,
      bal: parseFloat(newFmlaBal) || 0,
      note: newFmlaNote.trim(),
      freqEpi,
      freqDays,
      freq: freqStr,
      leaveType: newFmlaLeaveType,
      isContinuous: isContinuous,
      isMedicalLeave: isMedicalLeave,
      continuousWeeks: isContinuous ? parseFloat(newFmlaContinuousWeeks) || 0 : undefined
    };

    if (editingFmlaIndex !== null) {
      updateFmlaCase(editingFmlaIndex, caseData);
      setEditingFmlaIndex(null);
    } else {
      addFmlaCase(caseData);
    }
    
    setNewFmlaCase('');
    setNewFmlaStart('');
    setNewFmlaFreqEpi('');
    setNewFmlaFreqDays('');
    setNewFmlaLeaveType('Intermittent');
    setNewFmlaContinuousWeeks('');
    setNewFmlaBal('');
    setNewFmlaNote('');
  };

  const handleEditFmlaCase = (idx: number) => {
    const c = fmlaCases[idx];
    setNewFmlaCase(c.num);
    setNewFmlaRel(c.rel || 'Self');
    setNewFmlaStart(c.startD || '');
    setNewFmlaBal(c.bal ? String(c.bal) : '');
    setNewFmlaFreqEpi(c.freqEpi ? String(c.freqEpi) : '');
    setNewFmlaFreqDays(c.freqDays ? String(c.freqDays) : '');
    setNewFmlaLeaveType(c.leaveType || (c.isContinuous ? 'Continuous' : c.isMedicalLeave ? 'Medical Leave' : 'Intermittent'));
    setNewFmlaContinuousWeeks(c.continuousWeeks ? String(c.continuousWeeks) : '');
    setNewFmlaNote(c.note || '');
    setEditingFmlaIndex(idx);
  };

  const handleCancelEditFmlaCase = () => {
    setNewFmlaCase('');
    setNewFmlaStart('');
    setNewFmlaFreqEpi('');
    setNewFmlaFreqDays('');
    setNewFmlaLeaveType('Intermittent');
    setNewFmlaContinuousWeeks('');
    setNewFmlaBal('');
    setNewFmlaNote('');
    setEditingFmlaIndex(null);
  };

  const handleAddManualInfraction = () => {
    if(!manualAttDate) return showToast('Please select a date.', 'error');
    addManualInfraction(manualAttDate, manualAttType, parseFloat(manualAttHrs) || 8, manualAttCover);
    setManualAttDate('');
    setManualAttHrs('8');
  };

  const handleSaveBulkFmla = () => {
    const newLogs = { ...logs };
    let hasChanges = false;

    Object.keys(bulkFmlaEdits).forEach(key => {
      const [date, indexStr] = key.split('_');
      const index = parseInt(indexStr, 10);
      const edit = bulkFmlaEdits[key];

      if (newLogs[date] && newLogs[date][index]) {
        const entry = newLogs[date][index];
        const newHrs = parseFloat(edit.hrs) || 0;
        const newCase = edit.fmlaCase || undefined;

        if (entry.hrs !== newHrs || entry.fmlaCase !== newCase) {
          // Create a new array for the date to avoid mutating the original
          newLogs[date] = [...newLogs[date]];
          newLogs[date][index] = { ...entry, hrs: newHrs, fmlaCase: newCase };
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      updateLogs(newLogs);
    }
    closeModal('bulkFmlaEdit');
  };

  const renderCurrentEntries = () => {
    if (!logs[activeDate] || !Array.isArray(logs[activeDate])) return null;
    const sortedLogs = [...logs[activeDate]].map((e, idx) => ({...e, _origIdx: idx}));
    sortedLogs.sort((a,b) => getBlockStartHour(a) - getBlockStartHour(b));
    
    return sortedLogs.map((e) => {
      if(!e.type) return null;
      const tCls = getBlockClass(e, logs[activeDate], settings, logs, activeDate);
      const fullLabel = getBlockLabel(e, logs[activeDate], false, settings, logs, activeDate);
      const tooltip = getBlockTooltip(e, fmlaCases, logs[activeDate], settings, logs, activeDate);
      
      let borderCol = 'var(--swa-blue)';
      if (tCls === 'OT') borderCol = 'var(--ra-gold)';
      if (tCls === 'DT') borderCol = 'var(--swa-orange)';
      if (tCls === 'OT-DT') borderCol = 'var(--ra-gold)'; // Just use gold for simplicity in the list
      if (['UNPTO', 'UNPAID-UNSCHED', 'TARDY', 'NO-SHOW', 'WOP', 'INF'].includes(tCls)) borderCol = 'var(--swa-red)';

      return (
        <div key={e._origIdx} className="bg-black/5 p-1.5 px-2.5 mb-1 rounded-md border-l-4 cursor-pointer" style={{ borderLeftColor: borderCol }} onClick={() => { openModal('editBlock'); /* Need to set edit state in parent */ }}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-xs text-[var(--text-main)]">{fullLabel}</span>
            <button className="bg-[var(--swa-red)] text-white border-none rounded px-2.5 py-1 text-[10px] font-bold cursor-pointer" onClick={(ev) => { ev.stopPropagation(); removeEntry(activeDate, e._origIdx); }}>DELETE</button>
          </div>
          {tooltip && <div className="text-[9px] text-[var(--text-muted)] mt-0.5">↳ {tooltip.replace('\n', ' - ')}</div>}
        </div>
      );
    });
  };

  const mName = activeDate ? new Date(activeDate + "T00:00:00").toLocaleDateString('en-US', { month: 'long' }) : '';
  const dayNum = activeDate ? new Date(activeDate + "T00:00:00").getDate() : '';
  const yNum = activeDate ? new Date(activeDate + "T00:00:00").getFullYear() : '';
  
  const d = activeDate ? new Date(activeDate + "T00:00:00") : new Date(); 
  const nD = new Date(d); nD.setDate(d.getDate() + 1); 
  const nStr = nD.toISOString().split('T')[0];

  return (
    <>
      {/* Add Block Modal */}
      {modalsState.addBlock && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('addBlock'); }}>
          <div className="modal-box">
            <h3 className="text-center text-[var(--swa-blue)] mt-0">SELECT A BLOCK - {mName.toUpperCase()} {dayNum}, {yNum}</h3>
            <div className="mb-2.5 border-t border-[var(--border-color)] pt-2.5">
              {renderCurrentEntries()}
            </div>
            
            <div>
              {subView === 'MAIN' && (
                <div className="flex flex-col gap-1.5">
                  <button className="modal-btn bg-[var(--sh-oth)] m-0" onClick={() => setSubView('WORK')}>WORK SHIFT...</button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex flex-col gap-1.5">
                      <button className="modal-btn bg-[var(--ra-gold)] m-0" onClick={() => setSubView('OT')}>OVERTIME...</button>
                      <button className="modal-btn bg-[var(--ra-purple)] m-0" onClick={() => executeSave('HOL')}>HOLIDAY</button>
                      <button className="modal-btn bg-[var(--ra-purple)] m-0" onClick={() => setSubView('PTO')}>PTO...</button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button className="modal-btn bg-[var(--swa-red)] m-0" onClick={() => setSubView('WOP')}>WOP...</button>
                      <button className="modal-btn bg-[var(--ra-teal)] m-0" onClick={() => setSubView('FMLA')}>FMLA...</button>
                      <button className="modal-btn bg-[var(--swa-red)] m-0" onClick={() => setSubView('UNSCHED')}>UNSCHEDULED...</button>
                    </div>
                  </div>
                  <button className="modal-btn bg-[var(--swa-yellow)] text-[#1A1A1B] border border-[var(--swa-orange)] border-dashed m-0" onClick={() => setSubView('PERSONAL-NOTE')}>+ ADD PERSONAL NOTE</button>
                </div>
              )}

              {subView === 'PERSONAL-NOTE' && (
                <div className="bg-black/5 p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--swa-blue)] text-center mt-0 mb-2 uppercase">Add Personal Note:</p>
                  <textarea 
                    value={ebNote} 
                    onChange={(e) => setEbNote(e.target.value)} 
                    placeholder="e.g. Doctor appointment, pick up kids..." 
                    className="w-full p-2.5 border border-[var(--border-color)] rounded-lg bg-[var(--card-bg)] text-[var(--text-main)] box-border min-h-[80px] text-xs focus:ring-2 focus:ring-[var(--swa-blue)] outline-none"
                  />
                  <button className="modal-btn bg-[var(--swa-blue)] mt-2.5" onClick={() => {
                    executeSave('PERSONAL-NOTE', '', '0', { note: ebNote });
                    setEbNote('');
                    closeModal('addBlock');
                  }}>SAVE NOTE</button>
                  <button className="modal-btn btn-cancel" onClick={() => { setEbNote(''); setSubView('MAIN'); }}>BACK</button>
                </div>
              )}

              {subView === 'WORK' && (
                <div className="bg-black/5 p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--swa-blue)] text-center mt-0 mb-2">SELECT MAIN SHIFT:</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button className="modal-btn bg-[var(--sh-am)] m-0" onClick={() => executeSave('WORK-AM')}>AM (0600-1400)</button>
                    <button className="modal-btn bg-[var(--sh-pm)] m-0" onClick={() => executeSave('WORK-PM')}>PM (1400-2200)</button>
                    <button className="modal-btn m-0" style={{ backgroundColor: 'var(--sh-mid)', color: 'var(--sh-mid-text, white)' }} onClick={() => executeSave('WORK-MID')}>MID (2200-0600)</button>
                    <button className="modal-btn bg-[var(--sh-oth)] m-0" onClick={() => setSubView('WORK-OTHER')}>OTHER SHIFTS...</button>
                  </div>
                  <button className="modal-btn btn-cancel mt-2.5" onClick={() => setSubView('MAIN')}>BACK</button>
                </div>
              )}

              {subView === 'WORK-OTHER' && (
                <div className="bg-black/5 p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--swa-blue)] text-center mt-0 mb-2">SELECT OTHER SHIFT:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button className="modal-btn bg-[var(--sh-proj)] m-0" onClick={() => executeSave('WORK-PROJ')}>PROJ (0800-0400)</button>
                    <button className="modal-btn bg-[var(--sh-sw1)] text-[var(--text-main)] m-0" onClick={() => executeSave('WORK-SW1')}>SW1 (1000-1800)</button>
                    <button className="modal-btn bg-[var(--sh-sw2)] m-0" onClick={() => executeSave('WORK-SW2')}>SW2 (1800-0200)</button>
                    <button className="modal-btn bg-[var(--sh-sw3)] m-0" onClick={() => executeSave('WORK-SW3')}>SW3 (0200-1000)</button>
                    <button className="modal-btn col-span-2 bg-[var(--sh-oth)] m-0" onClick={handleAddGenericShift}>GENERIC SHIFT / CUSTOM TIME</button>
                  </div>
                  <button className="modal-btn btn-cancel mt-2.5" onClick={() => setSubView('WORK')}>BACK</button>
                </div>
              )}

              {subView === 'OT' && (
                <div className="bg-black/5 p-3 rounded-lg">
                  <div className="bg-[var(--card-bg)] p-2 rounded-md border border-[var(--border-color)] mb-2">
                    <label className="text-[10px] font-extrabold text-[var(--swa-blue)] block mb-1.5">STANDARD SHIFT PRESETS:</label>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      <button
                        type="button"
                        className={`modal-btn bg-[var(--sh-am)] m-0 py-1 text-[9px] h-auto font-black leading-normal transition-all duration-200 ${
                          otAddStart === '06:00' && otAddEnd === '14:00'
                            ? 'ring-4 ring-[var(--swa-blue)] border-[var(--swa-blue)] scale-[1.03] shadow-md z-10'
                            : 'opacity-70 hover:opacity-100 border border-transparent'
                        }`}
                        onClick={() => handleOtTimeChange('06:00', '14:00')}
                      >
                        AM (06-14)
                      </button>
                      <button
                        type="button"
                        className={`modal-btn bg-[var(--sh-pm)] m-0 py-1 text-[9px] h-auto font-black leading-normal transition-all duration-200 ${
                          otAddStart === '14:00' && otAddEnd === '22:00'
                            ? 'ring-4 ring-[var(--swa-blue)] border-[var(--swa-blue)] scale-[1.03] shadow-md z-10'
                            : 'opacity-70 hover:opacity-100 border border-transparent'
                        }`}
                        onClick={() => handleOtTimeChange('14:00', '22:00')}
                      >
                        PM (14-22)
                      </button>
                      <button
                        type="button"
                        className={`modal-btn m-0 py-1 text-[9px] h-auto font-black leading-normal transition-all duration-200 ${
                          otAddStart === '22:00' && otAddEnd === '06:00'
                            ? 'ring-4 ring-[var(--swa-blue)] border-[var(--swa-blue)] scale-[1.03] shadow-md z-10'
                            : 'opacity-70 hover:opacity-100 border border-transparent'
                        }`}
                        style={{ backgroundColor: 'var(--sh-mid)', color: 'var(--sh-mid-text, white)' }}
                        onClick={() => handleOtTimeChange('22:00', '06:00')}
                      >
                        MID (22-06)
                      </button>
                    </div>

                    <label className="text-[10px] font-extrabold text-[var(--swa-blue)] block mb-1">SPECIFIC TIMES (OPTIONAL):</label>
                    <div className="flex gap-1.5">
                      <input type="time" value={otAddStart} onChange={(e) => handleOtTimeChange(e.target.value, otAddEnd)} className="flex-1 p-1.5 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)]" />
                      <input type="time" value={otAddEnd} onChange={(e) => handleOtTimeChange(otAddStart, e.target.value)} className="flex-1 p-1.5 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)]" />
                    </div>
                  </div>

                  <label className="text-[10px] font-extrabold text-[var(--swa-blue)] mb-1.5 block">SELECT OT MULTIPLIER:</label>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center p-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-md cursor-pointer hover:border-[var(--swa-blue)] hover:bg-black/5 transition-colors">
                      <input type="radio" name="otRule" value="std" checked={otRule === 'std'} onChange={() => setOtRule('std')} className="mr-2.5 scale-125" />
                      <div><span className="text-[11px] font-bold text-[var(--ra-gold)]">Standard OT (Day Off)</span><br/><span className="text-[9px] text-[var(--text-main)]">Auto-DT after 12h total OR 8h OT.</span></div>
                    </label>
                    <label className="flex items-center p-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-md cursor-pointer hover:border-[var(--swa-blue)] hover:bg-black/5 transition-colors">
                      <input type="radio" name="otRule" value="dt" checked={otRule === 'dt'} onChange={() => setOtRule('dt')} className="mr-2.5 scale-125" />
                      <div><span className="text-[11px] font-bold text-[var(--swa-red)]">Double Time (2nd Shift/Consecutive)</span><br/><span className="text-[9px] text-[var(--text-main)]">All hours @ 2.0x</span></div>
                    </label>
                  </div>
                  <button className="modal-btn bg-[var(--ra-gold)] mt-2.5" onClick={() => {
                    let label = "";
                    if (otAddStart && otAddEnd) {
                      const sLabel = otAddStart.replace(':', '');
                      const eLabel = otAddEnd.replace(':', '');
                      label = `${sLabel}-${eLabel}`;
                    }
                    executeSave('OT', '', '', { otRule, ...(label ? { label } : {}) });
                  }}>APPLY OVERTIME</button>
                  <button className="modal-btn btn-cancel" onClick={() => setSubView('MAIN')}>BACK</button>
                </div>
              )}

              {subView === 'WOP' && (
                <div className="bg-[rgba(255,0,0,0.05)] p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--swa-red)] text-center mt-0 mb-2">ENTER WOP HOURS:</p>
                  <input type="number" value={wopHrs} onChange={(e) => setWopHrs(e.target.value)} step="any" className="w-full p-2 border border-[var(--border-color)] rounded-md mb-3 bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
                  <button className="modal-btn bg-[var(--swa-red)]" onClick={handlePromptWop}>SAVE WOP</button>
                  <button className="modal-btn btn-cancel" onClick={() => setSubView('MAIN')}>BACK</button>
                </div>
              )}

              {subView === 'PTO' && (
                <div className="bg-[rgba(156,39,176,0.05)] p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--ra-purple)] text-center mt-0 mb-2">ENTER PTO HOURS:</p>
                  <input type="number" value={ptoHrs} onChange={(e) => setPtoHrs(e.target.value)} step="any" className="w-full p-2 border border-[var(--border-color)] rounded-md mb-3 bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
                  <button className="modal-btn bg-[var(--ra-purple)]" onClick={handlePromptPto}>SAVE PTO</button>
                  <button className="modal-btn btn-cancel" onClick={() => setSubView('MAIN')}>BACK</button>
                </div>
              )}

              {subView === 'UNSCHED' && (
                <div className="bg-[rgba(255,0,0,0.05)] p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--swa-red)] text-center mt-0 mb-2">ENTER HOURS:</p>
                  <input type="number" value={unschedHrs} onChange={(e) => setUnschedHrs(e.target.value)} step="any" className="w-full p-2 border border-[var(--border-color)] rounded-md mb-3 bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
                  
                  <p className="text-[11px] font-bold text-[var(--swa-red)] text-center mt-0 mb-2">SELECT INFRACTION TYPE:</p>
                  <button className="modal-btn bg-[var(--swa-red)] mb-1.5" onClick={() => executeSave('UNPTO', '', unschedHrs)}>UNSCHEDULED PTO (UNPTO)</button>
                  <button className="modal-btn bg-[var(--swa-red)] mb-1.5" onClick={() => executeSave('UNPAID-UNSCHED', '', unschedHrs)}>UNPAID UNSCHED</button>
                  
                  <div className="bg-black/5 p-2 rounded-md my-2">
                    <label className="text-[10px] font-bold text-[var(--text-main)] flex items-center justify-center cursor-pointer">
                      <input type="checkbox" checked={coverWithPto} onChange={(e) => setCoverWithPto(e.target.checked)} className="mr-1.5 scale-125" /> Cover Tardy/No-Show w/ PTO
                    </label>
                    <div className="flex gap-1.5 mt-2">
                      <button className="modal-btn bg-[var(--swa-yellow)] text-[var(--text-main)] m-0 flex-1" onClick={() => { addManualInfraction(activeDate, 'TARDY', parseFloat(unschedHrs) || 8, coverWithPto); closeModal('addBlock'); }}>TARDY</button>
                      <button className="modal-btn bg-[var(--swa-red)] m-0 flex-1" onClick={() => { addManualInfraction(activeDate, 'NO-SHOW', parseFloat(unschedHrs) || 8, coverWithPto); closeModal('addBlock'); }}>NO SHOW</button>
                    </div>
                  </div>
                  
                  <button className="modal-btn btn-cancel" onClick={() => setSubView('MAIN')}>BACK</button>
                </div>
              )}

              {subView === 'FMLA' && (
                <div className="bg-black/5 p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--text-main)] text-center mt-0 mb-2">ENTER MEDICAL/FMLA HOURS:</p>
                  <input type="number" value={logHrs} onChange={(e) => setLogHrs(e.target.value)} step="any" className="w-full p-2 border border-[var(--border-color)] rounded-md mb-3 bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
                  
                  <p className="text-[10px] font-bold text-[var(--swa-red)] text-center mt-0 mb-2 font-mono">Select FMLA/Leave Type:</p>
                  <button className="modal-btn bg-[var(--ra-teal)] mb-1.5" onClick={() => triggerFmlaCaseSelect('FMLA-P')}>FMLA - PAID (PTO)</button>
                  <button className="modal-btn bg-[var(--ra-olive)] mb-1.5" onClick={() => triggerFmlaCaseSelect('FML-UNP')}>FMLA - UNPAID</button>
                  <button className="modal-btn bg-[var(--ra-teal)] mb-1.5" onClick={() => setSubView('MED_P_SELECT')}>MEDICAL LEAVE - PAID</button>
                  <button className="modal-btn bg-[var(--ra-olive)] mb-1.5" onClick={() => triggerFmlaCaseSelect('MED-UNP')}>MEDICAL LEAVE - UNPAID</button>
                  
                  {fmlaCases.length > 0 && (
                    <div className="mt-4 mb-3 space-y-2">
                      <p className="text-[10px] font-bold text-[var(--swa-blue)] text-center mt-0 mb-1 uppercase">Month Usage ({new Date(activeDate + "T00:00:00").toLocaleString('default', { month: 'short' })})</p>
                      {fmlaCases.map(c => {
                        const monthStats = getFmlaMonthStats(activeDate, c.num, logs, fmlaCases);
                        let usageText = '';
                        let isExceeded = false;
                        if (c.freqEpi && c.freqDays) {
                          if (c.leaveType === "Continuous" || c.isContinuous) {
                            const epiExceeded = monthStats.episodes > c.freqEpi;
                            const daysExceeded = monthStats.maxEpisodeLength > c.freqDays;
                            isExceeded = epiExceeded || daysExceeded;
                            usageText = `${monthStats.episodes}/${c.freqEpi} epi, ${monthStats.maxEpisodeLength}/${c.freqDays} days/epi`;
                          } else {
                            const maxDays = c.freqEpi * c.freqDays;
                            isExceeded = monthStats.totalDays > maxDays;
                            usageText = `${monthStats.totalDays} / ${maxDays} days`;
                          }
                        } else {
                          usageText = `${monthStats.totalDays} days used`;
                        }
                        return (
                          <div key={c.num} className="bg-[var(--card-bg)] p-2 rounded border border-[var(--border-color)] flex justify-between items-center text-xs">
                            <span className="font-bold text-[var(--text-muted)]">#{c.num}</span>
                            <span className={isExceeded ? 'text-red-500 font-bold' : 'text-[var(--text-main)]'}>{usageText}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button className="modal-btn btn-cancel" onClick={() => setSubView('MAIN')}>BACK</button>
                </div>
              )}

              {subView === 'MED_P_SELECT' && (
                <div className="bg-black/5 p-3 rounded-lg">
                  <p className="text-[11px] font-bold text-[var(--text-main)] text-center mt-0 mb-2">ENTER PAID LEAVE HOURS:</p>
                  <input type="number" value={logHrs} onChange={(e) => setLogHrs(e.target.value)} step="any" className="w-full p-2 border border-[var(--border-color)] rounded-md mb-3 bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
                  
                  <p className="text-[10px] font-bold text-[var(--swa-red)] text-center mt-0 mb-2">Select Payment Type:</p>
                  <button className="modal-btn bg-[var(--ra-teal)] mb-1.5" onClick={() => triggerFmlaCaseSelect('MED-P-PTO')}>PTO</button>
                  <button className="modal-btn btn-cancel mt-2" onClick={() => setSubView('FMLA')}>BACK</button>
                </div>
              )}
            </div>
            <button className="modal-btn btn-cancel mt-3" onClick={() => closeModal('addBlock')}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Confirm Clear Month Modal */}
      {modalsState.confirmClearMonth && (
        <div className="modal flex" onClick={(e) => { if (e.target === e.currentTarget) closeModal('confirmClearMonth'); }}>
          <div className="modal-box max-w-[350px]">
            <h3 className="text-center text-[var(--swa-red)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Clear Month</h3>
            <p className="text-center text-[var(--text-main)] my-4 text-sm">
              Are you sure you want to clear all entries for {new Date(clearTarget ? clearTarget.year : viewYear, clearTarget ? clearTarget.month : viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}?
            </p>
            <div className="flex gap-2 mt-4">
              <button className="modal-btn bg-[var(--swa-red)] flex-1" onClick={clearMonthData}>YES, CLEAR</button>
              <button className="modal-btn btn-cancel flex-1" onClick={() => closeModal('confirmClearMonth')}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* YTD Summary Modal */}
      {modalsState.ytdSummary && (
        <div className="modal flex" onClick={(e) => { if (e.target === e.currentTarget) closeModal('ytdSummary'); }}>
          <div className="modal-box max-w-[500px] p-0 overflow-hidden rounded-2xl">
            <div className="bg-[var(--swa-blue)] p-6 text-white">
              <h3 className="text-center m-0 text-xl font-bold flex items-center justify-center gap-3">
                <Calendar className="w-7 h-7" />
                Year-to-Date Summary: {viewYear}
              </h3>
            </div>
            
            <div className="p-5 bg-[var(--card-bg)] space-y-4">
              {/* Gross Pay Card - Full Width */}
              <div className="bg-[var(--hover-bg)] border border-[var(--border-color)] rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-[var(--pay-green)] p-2.5 rounded-xl text-white shadow-md">
                    <DollarSign className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-black text-[var(--pay-green)] opacity-80 m-0 tracking-wider">YTD Gross Pay</p>
                    <p className="text-3xl font-black text-[var(--text-main)] m-0 leading-tight">
                      ${stats.yg.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </p>
                  </div>
                </div>
                <TrendingUp className="w-12 h-12 text-[var(--pay-green)] opacity-20" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Overtime Card */}
                <div className="bg-[var(--swa-yellow)]/10 border border-[var(--swa-yellow)]/30 rounded-2xl p-4 flex flex-col justify-center min-h-[100px] shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-[var(--swa-yellow)]" />
                    <p className="text-[10px] uppercase font-black text-[var(--swa-yellow)] opacity-80 m-0 tracking-wider">Overtime (1.5x)</p>
                  </div>
                  <p className="text-2xl font-black text-[var(--text-main)] m-0">
                    ${stats.otYearAmt.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>

                {/* Double Time Card */}
                <div className="bg-[var(--swa-yellow)]/10 border border-[var(--swa-yellow)]/30 rounded-2xl p-4 flex flex-col justify-center min-h-[100px] shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-[var(--swa-yellow)]" />
                    <p className="text-[10px] uppercase font-black text-[var(--swa-yellow)] opacity-80 m-0 tracking-wider">Double Time (2.0x)</p>
                  </div>
                  <p className="text-2xl font-black text-[var(--text-main)] m-0">
                    ${stats.dtYearAmt.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>

                {/* Holiday Pay Card */}
                <div className="bg-[var(--pay-green)]/10 border border-[var(--pay-green)]/30 rounded-2xl p-4 flex flex-col justify-center min-h-[100px] shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-[var(--pay-green)]" />
                    <p className="text-[10px] uppercase font-black text-[var(--pay-green)] opacity-80 m-0 tracking-wider">Holiday Pay</p>
                  </div>
                  <p className="text-2xl font-black text-[var(--text-main)] m-0">
                    ${stats.holYearPay.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>

                {/* Midnight Diff Card */}
                <div className="bg-[var(--swa-blue)]/10 border border-[var(--swa-blue)]/30 rounded-2xl p-4 flex flex-col justify-center min-h-[100px] shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-[var(--swa-blue)]" />
                    <p className="text-[10px] uppercase font-black text-[var(--swa-blue)] opacity-80 m-0 tracking-wider">Midnight Diff</p>
                  </div>
                  <p className="text-2xl font-black text-[var(--text-main)] m-0">
                    ${stats.midYearAmt.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>

                {/* STI Bonus Card (Conditional) */}
                {stats.sti > 0 && (
                  <div className="bg-[var(--pay-green)]/10 border border-[var(--pay-green)]/30 rounded-2xl p-4 flex flex-col justify-center min-h-[100px] shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-[var(--pay-green)]" />
                      <p className="text-[10px] uppercase font-black text-[var(--pay-green)] opacity-80 m-0 tracking-wider">STI Bonus</p>
                    </div>
                    <p className="text-2xl font-black text-[var(--text-main)] m-0">
                      ${stats.sti.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </p>
                  </div>
                )}
              </div>

              {/* Lost Wages Card - Full Width */}
              <div className="bg-[var(--swa-red)]/5 border border-[var(--swa-red)]/20 rounded-2xl overflow-hidden shadow-sm">
                <button 
                  className="w-full p-4 flex items-center justify-between hover:bg-[var(--swa-red)]/10 transition-colors text-left"
                  onClick={() => setExpandLostWages(!expandLostWages)}
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-[var(--swa-red)] p-2.5 rounded-xl text-white shadow-md">
                      <ShieldAlert className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-[var(--swa-red)] opacity-80 m-0 tracking-wider">YTD Lost Wages (Unpaid)</p>
                      <p className="text-2xl font-black text-[var(--text-main)] m-0 leading-tight">
                        -${stats.totalYearLoss.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-12 h-12 text-[var(--swa-red)] opacity-20" />
                    <span className="text-[var(--swa-red)] font-bold ml-2">{expandLostWages ? '▼' : '▶'}</span>
                  </div>
                </button>
                
                {expandLostWages && (
                  <div className="p-4 pt-0 bg-[var(--swa-red)]/5 border-t border-[var(--swa-red)]/20">
                    <div className="space-y-2 mt-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-[var(--swa-red)] opacity-80">WOP (Without Pay)</span>
                        <span className="font-black text-[var(--text-main)]">-${stats.wopYearLoss.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-[var(--swa-red)] opacity-80">FMLA Unpaid</span>
                        <span className="font-black text-[var(--text-main)]">-${stats.fmlaUnpYearLoss.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-[var(--swa-red)] opacity-80">Infractions (Tardy/NS)</span>
                        <span className="font-black text-[var(--text-main)]">-${stats.infractionYearLoss.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Deductions Section */}
              <div className="bg-[var(--hover-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4 border-b border-[var(--border-color)] pb-2">
                  <Percent className="w-5 h-5 text-[var(--swa-blue)]" />
                  <h4 className="m-0 text-sm font-black text-[var(--swa-blue)] uppercase tracking-wider">Annual Deductions (Est.)</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">401K Contribution (%)</span>
                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="number" 
                          step="any"
                          className="w-20 p-2 border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 outline-none"
                          value={settings.k401Pct || '0'}
                          onChange={(e) => updateSettings({ k401Pct: e.target.value })}
                        />
                        <span className="text-xs font-bold text-[var(--text-muted)]">%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-[var(--swa-red)] uppercase tracking-widest m-0">Annual Total</p>
                      <p className="text-xl font-black text-[var(--swa-red)] m-0">-${stats.k401YearDed.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Insurance Premium ($)</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-[var(--text-muted)]">$</span>
                        <input 
                          type="number" 
                          step="any"
                          className="w-24 p-2 border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 outline-none"
                          value={settings.insuranceDed || '0'}
                          onChange={(e) => updateSettings({ insuranceDed: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-[var(--swa-red)] uppercase tracking-widest m-0">Annual Total</p>
                      <p className="text-xl font-black text-[var(--swa-red)] m-0">-${stats.insuranceYearAmt.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t-2 border-dashed border-[var(--border-color)] flex justify-between items-center">
                  <span className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest">Estimated Net Annual</span>
                  <span className="text-2xl font-black text-[var(--pay-green)]">${stats.estimatedNetYear.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              </div>

              <button className="modal-btn btn-cancel mt-4 w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg transition-all" onClick={() => closeModal('ytdSummary')}>
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Block Modal */}
      {modalsState.editBlock && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('editBlock'); }}>
          <div className="modal-box">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Edit Shift: {editDate}</h3>
            
            <div className="mb-2.5">
              <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">Shift Type</label>
              <select value={ebType} onChange={(e) => setEbType(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)] box-border">
                <optgroup label="Work Shifts">
                  <option value="WORK-AM">AM</option>
                  <option value="WORK-PM">PM</option>
                  <option value="WORK-MID">MID</option>
                  <option value="WORK-SW1">SW1</option>
                  <option value="WORK-SW2">SW2</option>
                  <option value="WORK-SW3">SW3</option>
                  <option value="WORK-PROJ">PROJ</option>
                  <option value="WORK">GENERIC WORK</option>
                </optgroup>
                <optgroup label="Overtime">
                  <option value="OT">OVERTIME</option>
                </optgroup>
                <optgroup label="Time Off / Exceptions">
                  <option value="PTO">PTO</option>
                  <option value="HOL">HOLIDAY</option>
                  <option value="HOL-W">WORKED HOLIDAY</option>
                  <option value="WOP">WOP</option>
                  <option value="UNPTO">UNPTO</option>
                  <option value="UNPAID-UNSCHED">UNPAID UNSCHED</option>
                  <option value="TARDY">TARDY</option>
                  <option value="NO-SHOW">NO SHOW</option>
                  <option value="FMLA-P">FMLA - PAID</option>
                  <option value="FML-UNP">FMLA - UNPAID</option>
                  <option value="MED-P-PTO">MED - PAID (PTO)</option>
                  <option value="MED-UNP">MED - UNPAID</option>
                </optgroup>
              </select>
            </div>
            
            {ebType === 'OT' && (
              <div className="mb-2.5">
                <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">OT Rule</label>
                <select value={ebOtRule} onChange={(e) => setEbOtRule(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)] box-border">
                  <option value="std">Standard OT (12h/8h Auto-DT)</option>
                  <option value="dt">Double Time (2.0x)</option>
                </select>
              </div>
            )}
            
            {(ebType === 'FMLA-P' || ebType === 'FML-UNP') && (
              <div className="mb-2.5">
                <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">FMLA Case</label>
                <select value={ebFmlaCase} onChange={(e) => setEbFmlaCase(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)] box-border">
                  <option value="">-- No Case Selected --</option>
                  {fmlaCases.map(c => (
                    <option key={c.num} value={c.num}>#{c.num}</option>
                  ))}
                </select>
                
                {ebFmlaCase && (
                  <div className="mt-2 p-2 bg-black/5 rounded border border-[var(--border-color)]">
                    {(() => {
                      const c = fmlaCases.find(fc => fc.num === ebFmlaCase);
                      if (!c) return null;
                      
                      const monthStats = getFmlaMonthStats(editDate || activeDate, c.num, logs, fmlaCases);
                      let usageText = '';
                      let isExceeded = false;
                      if (c.freqEpi && c.freqDays) {
                        if (c.leaveType === "Continuous" || c.isContinuous) {
                          const epiExceeded = monthStats.episodes > c.freqEpi;
                          const daysExceeded = monthStats.maxEpisodeLength > c.freqDays;
                          isExceeded = epiExceeded || daysExceeded;
                          usageText = `${monthStats.episodes}/${c.freqEpi} epi, ${monthStats.maxEpisodeLength}/${c.freqDays} days/epi`;
                        } else {
                          const maxDays = c.freqEpi * c.freqDays;
                          isExceeded = monthStats.totalDays > maxDays;
                          usageText = `${monthStats.totalDays} / ${maxDays} days`;
                        }
                      } else {
                        usageText = `${monthStats.totalDays} days used`;
                      }
                      
                      return (
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-bold text-[var(--text-muted)] uppercase">Month Usage:</span>
                          <span className={isExceeded ? 'text-red-500 font-bold' : 'text-[var(--text-main)] font-medium'}>{usageText}</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {ebType === 'OT' && (
              <div className="mb-2.5 p-2 bg-black/5 rounded-lg border border-[var(--border-color)]">
                <label className="text-[10px] font-extrabold text-[var(--swa-blue)] block mb-1.5 text-center">STANDARD SHIFT PRESETS:</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    className="modal-btn bg-[var(--sh-am)] m-0 py-1 text-[9px] h-auto font-black leading-normal"
                    onClick={() => handleEbTimeChange('06:00', '14:00')}
                  >
                    AM (06-14)
                  </button>
                  <button
                    type="button"
                    className="modal-btn bg-[var(--sh-pm)] m-0 py-1 text-[9px] h-auto font-black leading-normal"
                    onClick={() => handleEbTimeChange('14:00', '22:00')}
                  >
                    PM (14-22)
                  </button>
                  <button
                    type="button"
                    className="modal-btn m-0 py-1 text-[9px] h-auto font-black leading-normal"
                    style={{ backgroundColor: 'var(--sh-mid)', color: 'var(--sh-mid-text, white)' }}
                    onClick={() => handleEbTimeChange('22:00', '06:00')}
                  >
                    MID (22-06)
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2.5 mb-2.5">
              <div className="flex-1">
                <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">Start Time</label>
                <input type="time" value={ebStart} onChange={(e) => handleEbTimeChange(e.target.value, ebEnd)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
              </div>
              <div className="flex-1">
                <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">End Time</label>
                <input type="time" value={ebEnd} onChange={(e) => handleEbTimeChange(ebStart, e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-main)] box-border" />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">Calculated Hours</label>
              <input type="number" step="any" value={ebHrs} onChange={(e) => setEbHrs(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-black/5 text-[var(--text-main)] box-border" />
            </div>

            {['TARDY', 'NO-SHOW'].includes(ebType) && (
              <div className="bg-black/5 p-2 rounded-md mb-4">
                <label className="text-[10px] font-bold text-[var(--text-main)] flex items-center justify-center cursor-pointer">
                  <input type="checkbox" checked={ebCoverWithPto} onChange={(e) => setEbCoverWithPto(e.target.checked)} className="mr-1.5 scale-125" /> Cover with PTO
                </label>
              </div>
            )}

            <div className="mb-4">
              <label className="text-[9px] font-extrabold text-[var(--swa-blue)] uppercase mb-0.5 block text-center">Personal Note</label>
              <textarea 
                value={ebNote} 
                onChange={(e) => setEbNote(e.target.value)} 
                placeholder="Shift specific notes..." 
                className="w-full p-2.5 border border-[var(--border-color)] rounded-lg bg-black/5 text-[var(--text-main)] box-border min-h-[60px] text-xs focus:ring-2 focus:ring-[var(--swa-blue)] outline-none"
              />
            </div>

            <button className="modal-btn bg-[var(--swa-blue)]" onClick={handleSaveEditBlock}>SAVE CHANGES</button>
            <button className="modal-btn bg-[var(--pay-green)]" onClick={() => {
              if (editDate && logs[editDate] && editIndex !== null) {
                duplicateEntryToNextDay(editDate, editIndex);
              }
            }}>DUPLICATE TO NEXT DAY</button>
            <button className="modal-btn bg-[var(--swa-red)]" onClick={() => { removeEntry(editDate!, editIndex!); closeModal('editBlock'); }}>DELETE SHIFT</button>
            <button className="modal-btn btn-cancel" onClick={() => closeModal('editBlock')}>CANCEL</button>
          </div>
        </div>
      )}

      {/* FMLA Manager Modal */}
      {modalsState.fmlaManager && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4" onClick={(e) => { if(e.target === e.currentTarget) closeModal('fmlaManager'); }}>
          <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--sub-bg)] flex justify-between items-center">
              <h3 className="text-lg font-black text-[var(--swa-blue)] m-0 tracking-tight">Manage FMLA Cases</h3>
              <button onClick={() => closeModal('fmlaManager')} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {(() => {
                let totalFmlaUsed = 0;
                let totalContinuousHours = 0;
                fmlaCases.forEach(c => {
                  if ((c.leaveType === "Continuous" || c.isContinuous) && c.continuousWeeks) {
                    totalContinuousHours += c.continuousWeeks * 40;
                  }
                });
                for (const d in logs) {
                  if (Array.isArray(logs[d])) {
                    logs[d].forEach(e => {
                      if ((e.type === 'FMLA-P' || e.type === 'FML-UNP')) {
                        totalFmlaUsed += parseFloat(e.hrs as any) || 8;
                      }
                    });
                  }
                }
                const overallRemaining = 480 - totalFmlaUsed - totalContinuousHours;
                return (
                  <div className="mb-4 p-4 bg-[var(--swa-blue)] text-white rounded-xl shadow-sm flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80 mb-0.5">Overall FMLA Balance</p>
                      <p className="text-2xl font-black m-0">{overallRemaining.toFixed(1)}h <span className="text-sm font-medium opacity-80">/ 480h</span></p>
                    </div>
                    <div className="text-right text-xs font-medium opacity-90">
                      <p className="m-0">{totalFmlaUsed.toFixed(1)}h used</p>
                      {totalContinuousHours > 0 && <p className="m-0">{totalContinuousHours}h continuous</p>}
                    </div>
                  </div>
                );
              })()}
              <div className="mb-6 space-y-3">
                {fmlaCases.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)] text-center p-6 bg-[var(--sub-bg)] rounded-xl border border-[var(--border-color)] border-dashed">No cases added yet.</div>
                ) : (
                  fmlaCases.map((c, i) => {
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
                    
                    const remaining = (parseFloat(c.bal as any) || 0) - used;
                    let balText = '';
                    if (c.leaveType === "Continuous" || c.isContinuous) {
                      balText = `<span class="text-[var(--text-muted)] font-bold">Continuous</span>`;
                    } else {
                      balText = c.bal ? `${remaining.toFixed(1)} / ${parseFloat(c.bal as any).toFixed(1)}h remaining <span class="text-red-500 font-bold ml-1">(-${used.toFixed(1)} used)</span>` : `<span class="text-red-500 font-bold">${used.toFixed(1)}h used</span>`;
                    }

                    let expHtml = "";
                    let badgeHtml = null;
                    let borderColorClass = "border-[var(--border-color)]";
                    
                    if (c.startD) {
                      const sDate = new Date(c.startD + "T12:00:00");
                      const eDate = new Date(sDate);
                      eDate.setFullYear(eDate.getFullYear() + 1);
                      eDate.setDate(eDate.getDate() - 1);
                      
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const eDateMidnight = new Date(eDate);
                      eDateMidnight.setHours(0, 0, 0, 0);
                      
                      const diffTime = eDateMidnight.getTime() - today.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      
                      if (diffDays < 0) {
                        badgeHtml = (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ml-auto">
                            <AlertTriangle size={10} /> Expired
                          </span>
                        );
                        borderColorClass = "border-red-300 bg-red-50/30";
                        expHtml = `<span class="text-red-600 font-bold">Expired: ${eDate.toLocaleDateString()}</span>`;
                      } else if (diffDays <= 30) {
                        badgeHtml = (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ml-auto">
                            <Clock size={10} /> Expiring Soon
                          </span>
                        );
                        borderColorClass = "border-amber-300 bg-amber-50/30";
                        expHtml = `<span class="text-amber-600 font-bold">Expires: ${eDate.toLocaleDateString()} (${diffDays} days)</span>`;
                      } else {
                        expHtml = `<span class="text-[var(--text-muted)]">Expires: ${eDate.toLocaleDateString()}</span>`;
                      }
                    }
                    
                    const displayFreq = c.freq || ((c.freqEpi && c.freqDays) ? `${c.freqEpi} episodes / ${c.freqDays} days` : 'N/A');
                    let freqType = c.leaveType === "Continuous" || c.isContinuous ? `Continuous${c.continuousWeeks ? ` (${c.continuousWeeks} weeks)` : ''}` : c.leaveType || 'Intermittent';
                    
                    const viewDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
                    const monthStats = getFmlaMonthStats(viewDateStr, c.num, logs, fmlaCases);
                    let monthUsageHtml = '';
                    if (c.freqEpi && c.freqDays) {
                      if (c.leaveType === "Continuous" || c.isContinuous) {
                        const epiExceeded = monthStats.episodes > c.freqEpi;
                        const daysExceeded = monthStats.maxEpisodeLength > c.freqDays;
                        monthUsageHtml = `<span class="${epiExceeded ? 'text-red-500 font-bold' : ''}">${monthStats.episodes}/${c.freqEpi} epi</span>, <span class="${daysExceeded ? 'text-red-500 font-bold' : ''}">${monthStats.maxEpisodeLength}/${c.freqDays} days/epi</span>`;
                      } else {
                        const maxDays = c.freqEpi * c.freqDays;
                        const daysExceeded = monthStats.totalDays > maxDays;
                        monthUsageHtml = `<span class="${daysExceeded ? 'text-red-500 font-bold' : ''}">${monthStats.totalDays} / ${maxDays} days</span>`;
                      }
                    } else {
                      monthUsageHtml = `<span class="text-[var(--text-muted)]">${monthStats.totalDays} days used</span>`;
                    }

                    return (
                      <div key={i} className={`bg-[var(--card-bg)] p-4 rounded-xl border ${borderColorClass} shadow-sm relative overflow-hidden group transition-all hover:shadow-md`}>
                        <div className="flex items-center gap-2 mb-3 pr-8">
                          <strong className="text-[var(--swa-blue)] text-sm tracking-tight">#{c.num}</strong> 
                          <span className="text-[var(--text-muted)] text-xs font-medium bg-[var(--hover-bg)] px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">{c.rel}{c.note ? ' - '+c.note : ''}</span>
                          {badgeHtml}
                        </div>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">Frequency</span>
                            <span className="font-medium text-[var(--text-main)]">{displayFreq} <span className="text-[10px] text-[var(--text-muted)] ml-1">({freqType})</span></span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">Expiration</span>
                            <span dangerouslySetInnerHTML={{__html: expHtml}}></span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">Month Usage</span>
                            <span dangerouslySetInnerHTML={{__html: monthUsageHtml}}></span>
                          </div>
                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-[var(--border-color)]">
                            <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">Balance</span>
                            <span dangerouslySetInnerHTML={{__html: balText}}></span>
                          </div>
                        </div>
                        
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEditFmlaCase(i)} className="text-[var(--text-muted)] hover:text-[var(--swa-blue)] hover:bg-[var(--swa-blue)]/10 p-1.5 rounded-lg transition-colors" title="Edit Case">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => removeFmlaCase(i)} className="text-[var(--text-muted)] hover:text-[var(--swa-red)] hover:bg-[var(--swa-red)]/10 p-1.5 rounded-lg transition-colors" title="Remove Case">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="bg-[var(--sub-bg)] p-5 rounded-xl border border-[var(--border-color)]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="m-0 text-xs font-black text-[var(--swa-blue)] uppercase tracking-widest flex items-center gap-2">
                    {editingFmlaIndex !== null ? <Edit2 size={14} /> : <PlusCircle size={14} />} 
                    {editingFmlaIndex !== null ? 'Edit Case' : 'Add New Case'}
                  </h4>
                  {editingFmlaIndex !== null && (
                    <button onClick={handleCancelEditFmlaCase} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold transition-colors">
                      Cancel Edit
                    </button>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Case Number</label>
                      <input type="text" value={newFmlaCase} onChange={(e) => setNewFmlaCase(e.target.value)} placeholder="e.g. swa123456" className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                    </div>
                    <div className="w-1/3">
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Relation</label>
                      <select value={newFmlaRel} onChange={(e) => setNewFmlaRel(e.target.value)} className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all">
                        <option value="Self">Self</option>
                        <option value="Spouse">Spouse</option>
                        <option value="Child">Child</option>
                        <option value="Parent">Parent</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Start Date</label>
                      <input type="date" value={newFmlaStart} onChange={(e) => setNewFmlaStart(e.target.value)} className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                    </div>
                    {newFmlaLeaveType !== 'Continuous' && (
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Apprv Hrs</label>
                        <input type="number" value={newFmlaBal} onChange={(e) => setNewFmlaBal(e.target.value)} placeholder="e.g. 480" className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Leave Type</label>
                    <div className="flex gap-2 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-color)]">
                      {(['Intermittent', 'Continuous', 'Medical Leave'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setNewFmlaLeaveType(type)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${newFmlaLeaveType === type ? 'bg-[var(--card-bg)] shadow-sm text-[var(--swa-blue)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-end">
                    {newFmlaLeaveType !== 'Continuous' ? (
                      <>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Episodes / Mo</label>
                          <input type="number" value={newFmlaFreqEpi} onChange={(e) => setNewFmlaFreqEpi(e.target.value)} placeholder="e.g. 2" className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                        </div>
                        <span className="text-[var(--text-muted)] font-bold pb-3">×</span>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Days / Episode</label>
                          <input type="number" value={newFmlaFreqDays} onChange={(e) => setNewFmlaFreqDays(e.target.value)} placeholder="e.g. 2" className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                        </div>
                      </>
                    ) : (
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Continuous Weeks</label>
                        <input type="number" value={newFmlaContinuousWeeks} onChange={(e) => setNewFmlaContinuousWeeks(e.target.value)} placeholder="e.g. 4" className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Notes</label>
                    <input type="text" value={newFmlaNote} onChange={(e) => setNewFmlaNote(e.target.value)} placeholder="Specific Name/Note (Optional)" className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--swa-blue)] outline-none transition-all" />
                  </div>
                  
                  <button onClick={handleAddFmlaCase} className="w-full bg-[var(--swa-blue)] hover:brightness-110 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 mt-2">
                    {editingFmlaIndex !== null ? <Edit2 size={16} /> : <PlusCircle size={16} />} 
                    {editingFmlaIndex !== null ? 'Update Case' : 'Add Case'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-[var(--border-color)] bg-[var(--sub-bg)] flex justify-between items-center">
              <button 
                className="text-[var(--swa-blue)] hover:text-blue-600 font-bold text-sm transition-colors flex items-center gap-2" 
                onClick={() => { closeModal('fmlaManager'); openModal('bulkFmlaEdit'); }}
              >
                <Edit2 size={16} /> Bulk Edit Entries
              </button>
              <button className="bg-[var(--btn-dark)] hover:opacity-90 text-white font-bold py-2.5 px-6 rounded-xl transition-colors shadow-sm" onClick={() => closeModal('fmlaManager')}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FMLA Case Select Modal */}
      {modalsState.fmlaCase && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('fmlaCase'); }}>
          <div className="modal-box max-w-[300px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Select FMLA Case</h3>
            <p className="text-[10px] text-[var(--text-muted)] text-center m-0">Which case are you using for this block?</p>
            <div className="flex flex-col gap-2 mt-4">
              {fmlaCases.map(c => {
                const monthStats = getFmlaMonthStats(activeDate, c.num, logs, fmlaCases);
                let usageText = '';
                let isExceeded = false;
                if (c.freqEpi && c.freqDays) {
                  if (c.leaveType === "Continuous" || c.isContinuous) {
                    const epiExceeded = monthStats.episodes > c.freqEpi;
                    const daysExceeded = monthStats.maxEpisodeLength > c.freqDays;
                    isExceeded = epiExceeded || daysExceeded;
                    usageText = `${monthStats.episodes}/${c.freqEpi} epi, ${monthStats.maxEpisodeLength}/${c.freqDays} days/epi`;
                  } else {
                    const maxDays = c.freqEpi * c.freqDays;
                    isExceeded = monthStats.totalDays > maxDays;
                    usageText = `${monthStats.totalDays} / ${maxDays} days`;
                  }
                } else {
                  usageText = `${monthStats.totalDays} days used`;
                }

                return (
                  <button 
                    key={c.num} 
                    className="modal-btn bg-[var(--swa-blue)] flex flex-col items-center py-2" 
                    onClick={() => processFmlaSave(c.num)}
                  >
                    <span>#{c.num} ({c.rel})</span>
                    <span className={`text-[10px] ${isExceeded ? 'text-red-300 font-bold' : 'text-white/70'}`}>
                      Month Usage: {usageText}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="modal-btn bg-transparent text-[var(--text-muted)] border-none mt-2.5" onClick={() => { closeModal('fmlaCase'); openModal('addBlock'); setSubView('FMLA'); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {modalsState.override && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('override'); }}>
          <div className="modal-box max-w-[400px] p-0 overflow-hidden rounded-2xl">
            <div className="bg-[var(--swa-blue)] p-6 text-white">
              <h3 className="text-center m-0 text-xl font-bold flex items-center justify-center gap-3">
                <ShieldAlert className="w-7 h-7" />
                Performance Letters
              </h3>
              <p className="text-center text-sm text-white/80 m-0 mt-2 font-medium">Manage active attendance overrides.</p>
            </div>
            
            <div className="p-5 bg-[var(--card-bg)] max-h-[75vh] overflow-y-auto">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                  <AlertTriangle className="w-4 h-4 text-[var(--swa-red)]" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-red)] m-0">Active Letters</h4>
                </div>
                {(() => {
                  let pLetters: any[] = [];
                  try { pLetters = JSON.parse(settings.perfLetters || '[]'); } catch (e) {}
                  
                  // Fallback for legacy
                  if (pLetters.length === 0 && settings.attOverride && settings.attOverride !== 'auto') {
                    const parts = settings.attOverride.split('|');
                    pLetters.push({ id: 'legacy', level: parseInt(parts[0], 10), date: parts[1] || '' });
                  }

                  if (pLetters.length === 0) {
                    return (
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-4 text-center">
                        <p className="text-sm font-bold text-[var(--text-muted)] m-0">No active performance letters.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-3">
                      {pLetters.map((l, idx) => {
                        const lvlText = l.level === 3 ? "LEVEL 3 (FLOW)" : l.level === 2 ? "LEVEL 2 (LOW)" : l.level === 1 ? "LEVEL 1 (LOE)" : "LEVEL 0 (CLEAR)";
                        const dateText = l.date ? new Date(l.date + "T00:00:00").toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Expiration';
                        
                        let bgClass = "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200";
                        if (l.level === 1) bgClass = "bg-yellow-100/50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100";
                        if (l.level === 2) bgClass = "bg-orange-100/50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100";
                        if (l.level === 3) bgClass = "bg-red-100/50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100";

                        return (
                          <div key={l.id || idx} className={`flex justify-between items-center p-3 rounded-xl border shadow-sm ${bgClass}`}>
                            <div className="flex flex-col">
                              <span className="text-sm font-black tracking-wide">{lvlText}</span>
                              <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest mt-0.5">Issued: {dateText}</span>
                            </div>
                            <button 
                              className="bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-none rounded-lg p-2 cursor-pointer transition-colors"
                              title="Remove Letter"
                              onClick={() => {
                                const newLetters = pLetters.filter((_, i) => i !== idx);
                                updateSettings({ perfLetters: JSON.stringify(newLetters), attOverride: 'auto' });
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                  <PlusCircle className="w-4 h-4 text-[var(--swa-blue)]" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-blue)] m-0">Add New Letter</h4>
                </div>
                
                <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-4">
                  <div className="mb-4">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">Issue Date (Optional)</label>
                    <input 
                      type="date" 
                      value={overrideDate} 
                      onChange={(e) => setOverrideDate(e.target.value)} 
                      className="w-full p-2.5 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)] transition-all" 
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">If set, the letter will automatically fall off after 12 rolling months.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button className="py-2.5 px-2 rounded-lg font-bold text-xs border border-gray-200 dark:border-gray-700 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm" onClick={() => {
                      let pLetters: any[] = [];
                      try { pLetters = JSON.parse(settings.perfLetters || '[]'); } catch (e) {}
                      pLetters.push({ id: Date.now().toString(), level: 0, date: overrideDate });
                      updateSettings({ perfLetters: JSON.stringify(pLetters), attOverride: 'auto' });
                      setOverrideDate('');
                    }}>+ LEVEL 0 (CLEAR)</button>
                    <button className="py-2.5 px-2 rounded-lg font-bold text-xs border border-yellow-200 dark:border-yellow-800 bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 transition-colors shadow-sm" onClick={() => {
                      let pLetters: any[] = [];
                      try { pLetters = JSON.parse(settings.perfLetters || '[]'); } catch (e) {}
                      pLetters.push({ id: Date.now().toString(), level: 1, date: overrideDate });
                      updateSettings({ perfLetters: JSON.stringify(pLetters), attOverride: 'auto' });
                      setOverrideDate('');
                    }}>+ LEVEL 1 (LOE)</button>
                    <button className="py-2.5 px-2 rounded-lg font-bold text-xs border border-orange-200 dark:border-orange-800 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 transition-colors shadow-sm" onClick={() => {
                      let pLetters: any[] = [];
                      try { pLetters = JSON.parse(settings.perfLetters || '[]'); } catch (e) {}
                      pLetters.push({ id: Date.now().toString(), level: 2, date: overrideDate });
                      updateSettings({ perfLetters: JSON.stringify(pLetters), attOverride: 'auto' });
                      setOverrideDate('');
                    }}>+ LEVEL 2 (LOW)</button>
                    <button className="py-2.5 px-2 rounded-lg font-bold text-xs border border-red-200 dark:border-red-800 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 transition-colors shadow-sm" onClick={() => {
                      let pLetters: any[] = [];
                      try { pLetters = JSON.parse(settings.perfLetters || '[]'); } catch (e) {}
                      pLetters.push({ id: Date.now().toString(), level: 3, date: overrideDate });
                      updateSettings({ perfLetters: JSON.stringify(pLetters), attOverride: 'auto' });
                      setOverrideDate('');
                    }}>+ LEVEL 3 (FLOW)</button>
                  </div>
                </div>
              </div>
              
              <button className="modal-btn btn-cancel w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg transition-all m-0 mt-6" onClick={() => closeModal('override')}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {modalsState.settings && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('settings'); }}>
          <div className="modal-box max-w-[300px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Dashboard Toggles</h3>
            <div>
              <div className="flex items-center justify-between p-2 border-b border-[var(--border-color)]">
                <label className="text-xs font-bold text-[var(--swa-blue)] cursor-pointer">Time Off Balances</label>
                <input type="checkbox" checked={cardPrefs.timeoff} onChange={(e) => updateToggles({ ...cardPrefs, timeoff: e.target.checked })} className="scale-125 cursor-pointer accent-[var(--swa-red)]" />
              </div>
              <div className="flex items-center justify-between p-2 border-b border-[var(--border-color)]">
                <label className="text-xs font-bold text-[var(--swa-blue)] cursor-pointer">Attendance Level</label>
                <input type="checkbox" checked={cardPrefs.att} onChange={(e) => updateToggles({ ...cardPrefs, att: e.target.checked })} className="scale-125 cursor-pointer accent-[var(--swa-red)]" />
              </div>
              <div className="flex items-center justify-between p-2 border-b border-[var(--border-color)]">
                <label className="text-xs font-bold text-[var(--swa-blue)] cursor-pointer">Midnight Shifts</label>
                <input type="checkbox" checked={cardPrefs.mid} onChange={(e) => updateToggles({ ...cardPrefs, mid: e.target.checked })} className="scale-125 cursor-pointer accent-[var(--swa-red)]" />
              </div>
              <div className="flex items-center justify-between p-2">
                <label className="text-xs font-bold text-[var(--swa-blue)] cursor-pointer">Annual Gross Pay</label>
                <input type="checkbox" checked={cardPrefs.pay} onChange={(e) => updateToggles({ ...cardPrefs, pay: e.target.checked })} className="scale-125 cursor-pointer accent-[var(--swa-red)]" />
              </div>
            </div>
            <button className="modal-btn btn-cancel mt-4" onClick={() => closeModal('settings')}>DONE</button>
          </div>
        </div>
      )}

      {/* Tax Settings Modal */}
      {modalsState.taxSettings && (
        <div className="modal flex text-[var(--text-main)]" onClick={(e) => { if(e.target === e.currentTarget) closeModal('taxSettings'); }}>
          <div className="modal-box max-w-[340px] p-6 rounded-3xl shadow-2xl border border-[var(--border-color)] bg-[var(--card-bg)]">
            <div className="flex items-center gap-3 border-b-2 border-[var(--border-color)] pb-3 mb-4">
              <div className="bg-[var(--pay-green)]/15 p-2 rounded-xl text-[var(--pay-green)] shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-[var(--swa-blue)] m-0 uppercase tracking-tight">Tax Setup & Audit</h3>
                <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider m-0">Texas State & Federal Code Settings</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* State Indicator */}
              <div className="bg-[var(--swa-blue)]/5 p-3 rounded-2xl border border-[var(--swa-blue)]/20">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-[var(--swa-blue)] uppercase tracking-wider">State Region:</span>
                  <span className="bg-[var(--swa-blue)]/20 text-[var(--swa-blue)] text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Texas (TX)</span>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[var(--border-color)]/40">
                  <span className="text-[10px] text-[var(--text-muted)] font-black uppercase">State Income Tax:</span>
                  <span className="text-[var(--pay-green)] text-xs font-black">0.00% (No State Tax)</span>
                </div>
                <p className="text-[9px] text-[var(--text-muted)] leading-normal mt-2 mb-0 italic">
                  * Live calculations apply standard FICA adjustments + 0% state income tax for Texas residents.
                </p>
              </div>

              {/* Filing Status */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wide px-1">Filing Status (Federal)</label>
                <select
                  value={settings.taxFilingStatus || 'single'}
                  onChange={(e) => updateSettings({ taxFilingStatus: e.target.value })}
                  className="w-full p-2 border-2 border-[var(--border-color)] rounded-xl bg-[var(--input-bg)] text-[var(--text-main)] font-black text-xs focus:outline-none focus:border-[var(--swa-blue)] transition-colors cursor-pointer"
                >
                  <option value="single">Single Status (Standard Deduct: $15,000)</option>
                  <option value="married">Married Joint Status (Standard Deduct: $30,000)</option>
                  <option value="hoh">Head of Household Status (Standard Deduct: $22,500)</option>
                </select>
              </div>

              {/* Children / Dependents */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wide px-1">Children / Dependents</label>
                <select
                  value={settings.taxDependents || '0'}
                  onChange={(e) => updateSettings({ taxDependents: e.target.value })}
                  className="w-full p-2 border-2 border-[var(--border-color)] rounded-xl bg-[var(--input-bg)] text-[var(--text-main)] font-black text-xs focus:outline-none focus:border-[var(--swa-blue)] transition-colors cursor-pointer"
                >
                  <option value="0">No Children/Dependents</option>
                  <option value="1">1 Child Benefit (-$2,000 Credit)</option>
                  <option value="2">2 Children Benefit (-$4,000 Credit)</option>
                  <option value="3">3 Children Benefit (-$6,000 Credit)</option>
                  <option value="4">4 Children Benefit (-$8,000 Credit)</option>
                  <option value="5">5+ Children Benefit (-$10,000+ Credit)</option>
                </select>
                <span className="text-[8px] text-[var(--text-muted)] italic px-1">
                  * Evaluates standard Child Tax Credits to discount federal liabilities per check.
                </span>
              </div>

              {/* Federal Exemption Toggle */}
              <div className="flex items-center justify-between p-3 bg-[var(--sub-bg)] rounded-2xl border border-[var(--border-color)] mt-1">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-[var(--swa-red)] uppercase tracking-wider">Federal Exempt</span>
                  <span className="text-[8px] text-[var(--text-muted)] leading-tight mt-0.5 max-w-[190px]">Skip ordinary federal tax withholdings</span>
                </div>
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.fedTaxExempt === 'true' ? 'bg-[var(--swa-red)]' : 'bg-gray-200 dark:bg-zinc-700'}`}
                  onClick={() => updateSettings({ fedTaxExempt: settings.fedTaxExempt === 'true' ? 'false' : 'true' })}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.fedTaxExempt === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <button 
              className="w-full mt-6 py-3 bg-[var(--swa-blue)] text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.98] shadow-md shadow-[var(--swa-blue)]/20 cursor-pointer"
              onClick={() => closeModal('taxSettings')}
            >
              Apply & Save
            </button>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {modalsState.bulkAdd && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('bulkAdd'); }}>
          <div className="modal-box max-w-[400px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Bulk Add Shifts</h3>
            
            <div className="flex flex-col gap-3 mt-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-[var(--swa-blue)] block mb-1">START DATE</label>
                  <input type="date" value={baStartDate} onChange={e => setBaStartDate(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-[var(--swa-blue)] block mb-1">END DATE</label>
                  <input type="date" value={baEndDate} onChange={e => setBaEndDate(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border" />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-2 w-2/3">
                  <label className="text-[10px] font-bold text-[var(--swa-blue)] block mb-1">SHIFT TYPE</label>
                  <select value={baType} onChange={e => setBaType(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border">
                    <option value="WORK-AM">AM (0600-1400)</option>
                    <option value="WORK-PM">PM (1400-2200)</option>
                    <option value="WORK-MID">MID (2200-0600)</option>
                    <option value="WORK-PROJ">PROJ (0800-0400)</option>
                    <option value="WORK-SW1">SW1 (1000-1800)</option>
                    <option value="WORK-SW2">SW2 (1800-0200)</option>
                    <option value="WORK-SW3">SW3 (0200-1000)</option>
                    <option value="PTO">PTO</option>
                    <option value="UNPTO">UNPTO</option>
                    <option value="HOL">HOLIDAY</option>
                  </select>
                </div>
                <div className="flex-1 w-1/3">
                  <label className="text-[10px] font-bold text-[var(--swa-blue)] block mb-1">HOURS</label>
                  <input type="number" value={baHrs} onChange={e => setBaHrs(e.target.value)} className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border" />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button className="modal-btn bg-[var(--pay-green)] flex-1 m-0" onClick={handleAddBulkShifts}>ADD SHIFTS</button>
              <button className="modal-btn btn-cancel flex-1 m-0" onClick={() => closeModal('bulkAdd')}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Mid Modal */}
      {modalsState.bulkMid && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('bulkMid'); }}>
          <div className="modal-box max-w-[600px] p-0 overflow-hidden rounded-2xl">
            <div className="bg-[var(--swa-blue)] p-6 text-white">
              <h3 className="text-center m-0 text-xl font-bold flex items-center justify-center gap-3">
                <Moon className="w-7 h-7" />
                Midnight Scheduler
              </h3>
              <p className="text-center text-sm text-white/80 m-0 mt-2 font-medium">Ensure proper Midnight Shift Diff payout overrides.</p>
            </div>
            
            <div className="p-5 bg-[var(--card-bg)] max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                {Array.from({ length: 12 }).map((_, i) => {
                  const mNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                  const mKey = viewYear + '-' + i;
                  const currentVal = midCounts[mKey] !== undefined ? midCounts[mKey] : 'auto';
                  
                  let autoCount = 0;
                  for (let d=1; d<=31; d++) {
                    const ds = `${viewYear}-${String(i+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    if (logs[ds] && Array.isArray(logs[ds])) {
                      logs[ds].forEach(e => {
                        if (e.type === 'WORK-MID' || e.type === 'WORK-SW3' || (e.label && (e.label.startsWith('22') || e.label.startsWith('23') || e.label.startsWith('00') || e.label.startsWith('01') || e.label.startsWith('02')) && e.type.startsWith('WORK'))) {
                          autoCount++;
                        }
                      });
                    }
                  }

                  return (
                    <div key={i} className="bg-[var(--sub-bg)] p-3 rounded-xl border border-[var(--border-color)] flex flex-col items-center shadow-sm hover:shadow-md transition-shadow">
                      <div className="text-xs font-black text-[var(--swa-blue)] mb-1 tracking-wider">{mNames[i]}</div>
                      <div className="text-[10px] font-bold text-[var(--text-muted)] mb-2 uppercase tracking-wide bg-[var(--hover-bg)] px-2 py-0.5 rounded-full">Auto: {autoCount}</div>
                      <select 
                        value={currentVal} 
                        onChange={(e) => saveBulkMid(i, e.target.value)} 
                        className="w-full p-1.5 text-sm font-bold rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)] text-center cursor-pointer"
                      >
                        <option value="auto">Auto</option>
                        {Array.from({length: 31}, (_, k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              
              <button className="modal-btn btn-cancel w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg transition-all m-0" onClick={() => closeModal('bulkMid')}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk FMLA Edit Modal */}
      {modalsState.bulkFmlaEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4" onClick={(e) => { if(e.target === e.currentTarget) closeModal('bulkFmlaEdit'); }}>
          <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--sub-bg)] flex justify-between items-center">
              <h3 className="text-lg font-black text-[var(--swa-blue)] m-0 tracking-tight">Bulk Edit FMLA Entries</h3>
              <button onClick={() => closeModal('bulkFmlaEdit')} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {Object.keys(bulkFmlaEdits).length === 0 ? (
                <div className="text-center text-[var(--text-muted)] py-8 font-bold">No FMLA entries found.</div>
              ) : (
                <div className="space-y-4">
                  {Object.keys(bulkFmlaEdits).map(key => {
                    const [date, indexStr] = key.split('_');
                    const index = parseInt(indexStr, 10);
                    const entry = logs[date]?.[index];
                    if (!entry) return null;
                    
                    return (
                      <div key={key} className="bg-[var(--sub-bg)] p-4 rounded-xl border border-[var(--border-color)] flex flex-wrap gap-4 items-center shadow-sm">
                        <div className="flex-1 min-w-[200px]">
                          <div className="text-sm font-black text-[var(--text-main)]">{new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div className="text-xs font-bold text-[var(--text-muted)] mt-1">Type: {entry.type}</div>
                        </div>
                        
                        <div className="w-24">
                          <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">Hours</label>
                          <input 
                            type="number" 
                            step="any"
                            value={bulkFmlaEdits[key].hrs} 
                            onChange={(e) => setBulkFmlaEdits({...bulkFmlaEdits, [key]: {...bulkFmlaEdits[key], hrs: e.target.value}})}
                            className="w-full p-2 text-sm font-bold rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]"
                          />
                        </div>
                        
                        <div className="w-48">
                          <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">FMLA Case</label>
                          <select 
                            value={bulkFmlaEdits[key].fmlaCase} 
                            onChange={(e) => setBulkFmlaEdits({...bulkFmlaEdits, [key]: {...bulkFmlaEdits[key], fmlaCase: e.target.value}})}
                            className="w-full p-2 text-sm font-bold rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]"
                          >
                            <option value="">None</option>
                            {fmlaCases.map(c => (
                              <option key={c.num} value={c.num}>{c.num} {c.leaveType === "Continuous" || c.isContinuous ? '(Cont)' : ''}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="p-6 bg-[var(--sub-bg)] border-t border-[var(--border-color)] flex gap-3">
              <button onClick={() => closeModal('bulkFmlaEdit')} className="flex-1 py-3 px-4 rounded-xl font-black text-sm uppercase tracking-widest text-[var(--text-main)] bg-[var(--input-bg)] border border-[var(--border-color)] hover:bg-[var(--hover-bg)] transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveBulkFmla} className="flex-1 py-3 px-4 rounded-xl font-black text-sm uppercase tracking-widest text-white bg-[var(--swa-blue)] hover:bg-blue-600 transition-colors shadow-md hover:shadow-lg">
                Save All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Details Modal */}
      {modalsState.attendanceDetails && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('attendanceDetails'); }}>
          <div className="modal-box max-w-[450px] p-0 overflow-hidden rounded-2xl">
            <div className="bg-[var(--swa-red)] p-6 text-white">
              <h3 className="text-center m-0 text-xl font-bold flex items-center justify-center gap-3">
                <AlertTriangle className="w-7 h-7" />
                Attendance History
              </h3>
            </div>
            
            <div className="p-5 bg-[var(--card-bg)] space-y-6 max-h-[75vh] overflow-y-auto">
              {(() => {
                let pLetters: any[] = [];
                try { pLetters = JSON.parse(settings.perfLetters || '[]'); } catch (e) {}
                
                // Fallback for legacy
                if (pLetters.length === 0 && settings.attOverride && settings.attOverride !== 'auto') {
                  const parts = settings.attOverride.split('|');
                  pLetters.push({ id: 'legacy', level: parseInt(parts[0], 10), date: parts[1] || '' });
                }

                const viewDate = new Date(viewYear, viewMonth + 1, 0);
                viewDate.setHours(0,0,0,0);

                const activeLetters = pLetters.filter(l => {
                  if (!l.date) return true;
                  const issueDateObj = new Date(l.date + "T00:00:00");
                  const dropDateObj = new Date(l.date + "T00:00:00");
                  dropDateObj.setFullYear(dropDateObj.getFullYear() + 1);
                  return viewDate < dropDateObj && viewDate >= issueDateObj;
                });

                if (activeLetters.length === 0) return null;

                return (
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                      <ShieldAlert className="w-4 h-4" style={{ color: stats.manualColor }} />
                      <h4 className="text-sm font-black uppercase tracking-widest m-0" style={{ color: stats.manualColor }}>Active Performance Letters</h4>
                    </div>
                    <div className="flex flex-col gap-2">
                      {activeLetters.map((l, idx) => {
                        const lvlText = l.level === 3 ? "LEVEL 3 (FLOW)" : l.level === 2 ? "LEVEL 2 (LOW)" : l.level === 1 ? "LEVEL 1 (LOE)" : "LEVEL 0 (CLEAR)";
                        let dropText = 'No Expiration';
                        if (l.date) {
                          const dropDateObj = new Date(l.date + "T00:00:00");
                          dropDateObj.setFullYear(dropDateObj.getFullYear() + 1);
                          dropText = dropDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                        }
                        return (
                          <div key={l.id || idx} className="bg-orange-100/50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3 flex justify-between items-center shadow-sm">
                            <span className="font-bold text-orange-900 dark:text-orange-100">{lvlText}</span>
                            <span className="text-xs font-bold text-orange-800 dark:text-orange-300">
                              Drops: <span className={dropText !== 'No Expiration' ? 'text-orange-900 dark:text-orange-100' : ''}>{dropText}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs font-bold text-[var(--text-main)] text-right flex justify-end items-center gap-2">
                      <span className="uppercase tracking-widest text-[var(--text-muted)]">Total Level:</span>
                      <span className="bg-[var(--hover-bg)] px-2 py-1 rounded-md" style={{ color: stats.manualColor }}>
                        {stats.manualMet} ({stats.manualLetter})
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                  <TrendingUp className="w-4 h-4 text-[var(--swa-blue)]" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-blue)] m-0">Rolling Year Totals</h4>
                </div>
                
                {/* Single Rolling 365 Days Summary */}
                <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-4 flex flex-col">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[var(--swa-blue)] mb-3 flex justify-between items-center">
                    <span>Rolling Period</span>
                    <span className="opacity-60 font-medium normal-case italic">Past 365 Days</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-[var(--hover-bg)] border border-[var(--border-color)]/30 p-2 rounded-lg">
                      <div className="text-gray-400 font-bold uppercase text-[8px] tracking-wider">UNPTO</div>
                      <div className="font-black text-sm text-[var(--text-main)] mt-0.5">{stats?.unptoHrs || 0}h</div>
                    </div>
                    <div className="bg-[var(--hover-bg)] border border-[var(--border-color)]/30 p-2 rounded-lg">
                      <div className="text-gray-400 font-bold uppercase text-[8px] tracking-wider">UU</div>
                      <div className="font-black text-sm text-[var(--text-main)] mt-0.5">{stats?.uuCount || 0}</div>
                    </div>
                    <div className="bg-[var(--hover-bg)] border border-[var(--border-color)]/30 p-2 rounded-lg">
                      <div className="text-gray-400 font-bold uppercase text-[8px] tracking-wider">Tardy</div>
                      <div className="font-black text-sm text-[var(--text-main)] mt-0.5">{stats?.tardyCount || 0}</div>
                    </div>
                    <div className="bg-[var(--hover-bg)] border border-[var(--border-color)]/30 p-2 rounded-lg">
                      <div className="text-gray-400 font-bold uppercase text-[8px] tracking-wider">No-Show</div>
                      <div className="font-black text-sm text-[var(--text-main)] mt-0.5">{stats?.nsCount || 0}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[var(--swa-red)]" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-red)] m-0">
                      Active Rolling Infractions
                    </h4>
                  </div>
                </div>
                
                <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-2 max-h-[250px] overflow-y-auto space-y-1">
                  {currentAttHistory && currentAttHistory.length > 0 ? (
                    <div>
                      {currentAttHistory.map((item, idx) => {
                        const dStr = new Date(item.date + "T00:00:00").toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        return (
                          <div key={idx} className="flex justify-between items-center py-2.5 px-3 text-sm bg-red-100/50 dark:bg-red-900/20 rounded-lg mb-1 last:mb-0 border border-red-200 dark:border-red-800">
                            <span className="font-medium text-[var(--text-main)]">
                              <strong className="text-[var(--swa-blue)]">{dStr}</strong> 
                              <span className="text-xs opacity-60 ml-1">({item.type})</span>
                            </span>
                            <span className="font-bold text-red-700 dark:text-red-400">{item.val}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center text-sm text-[var(--text-muted)] p-4 font-medium">
                      No active infractions during this rolling year.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                  <PlusCircle className="w-4 h-4 text-[var(--swa-blue)]" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-blue)] m-0">Manual Add Infraction</h4>
                </div>
                
                <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-4 space-y-3">
                  <div className="flex gap-2">
                    <input type="date" value={manualAttDate} onChange={(e) => setManualAttDate(e.target.value)} className="flex-1 p-2 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]" />
                    <select value={manualAttType} onChange={(e) => setManualAttType(e.target.value)} className="flex-1 p-2 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]">
                      <option value="UNPTO">UNPTO</option>
                      <option value="UNPAID-UNSCHED">UNPAID UNSCHED</option>
                      <option value="TARDY">TARDY</option>
                      <option value="NO-SHOW">NO SHOW</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={manualAttHrs} onChange={(e) => setManualAttHrs(e.target.value)} placeholder="Hrs" className="w-[80px] p-2 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]" />
                    <label className="text-xs font-bold flex items-center cursor-pointer text-[var(--text-main)] flex-1">
                      <input type="checkbox" checked={manualAttCover} onChange={(e) => setManualAttCover(e.target.checked)} className="mr-2 w-4 h-4 rounded text-[var(--swa-blue)] focus:ring-[var(--swa-blue)]" /> 
                      Cover w/ PTO (Tardy/NS)
                    </label>
                    <button onClick={handleAddManualInfraction} className="px-4 py-2 bg-[var(--swa-red)] hover:brightness-110 text-white border-none rounded-lg font-bold cursor-pointer text-sm transition-colors shadow-sm">ADD</button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                  <ShieldAlert className="w-4 h-4 text-[var(--swa-blue)]" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-blue)] m-0">Attendance Matrix</h4>
                </div>
                <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-inner">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-[var(--hover-bg)] border-b border-[var(--border-color)]">
                        <th className="p-2"></th>
                        <th className="p-2 text-center font-black uppercase tracking-tighter text-[var(--text-main)]">No Show</th>
                        <th className="p-2 text-center font-black uppercase tracking-tighter text-[var(--text-main)]">Tardy</th>
                        <th className="p-2 text-center font-black uppercase tracking-tighter text-[var(--text-main)]">UPTO</th>
                        <th className="p-2 text-center font-black uppercase tracking-tighter text-[var(--text-main)]">Unpaid Unsched</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-yellow-100/50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100">
                        <td className="p-2 font-black border-r border-yellow-200/50">Threshold 1</td>
                        <td className="p-2 text-center font-bold">1 instance</td>
                        <td className="p-2 text-center font-bold">4 instances</td>
                        <td className="p-2 text-center font-bold">56 hours</td>
                        <td className="p-2 text-center font-bold">3 instances</td>
                      </tr>
                      <tr className="bg-orange-100/50 dark:bg-orange-900/20 text-orange-900 dark:text-orange-100">
                        <td className="p-2 font-black border-r border-orange-200/50">Threshold 2</td>
                        <td className="p-2 text-center font-bold">2 instances</td>
                        <td className="p-2 text-center font-bold">5 instances</td>
                        <td className="p-2 text-center font-bold">64 hours</td>
                        <td className="p-2 text-center font-bold">4 instances</td>
                      </tr>
                      <tr className="bg-red-100/50 dark:bg-red-900/20 text-red-900 dark:text-red-100">
                        <td className="p-2 font-black border-r border-red-200/50">Threshold 3</td>
                        <td className="p-2 text-center font-bold">3 instances</td>
                        <td className="p-2 text-center font-bold">6 instances</td>
                        <td className="p-2 text-center font-bold">72 hours</td>
                        <td className="p-2 text-center font-bold">5 instances</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <button className="modal-btn btn-cancel mt-2 w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg transition-all" onClick={() => closeModal('attendanceDetails')}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Time Off Details Modal */}
      {modalsState.timeoffDetails && (() => {
        const ptoEntries: {date: string, hrs: number, type: string}[] = [];
        const fmlaPEntries: {date: string, hrs: number, type: string}[] = [];
        const holEntries: {date: string, hrs: number, type: string}[] = [];
        const fmlaUnpEntries: {date: string, hrs: number, type: string}[] = [];
        
        Object.keys(logs).forEach(date => {
          if (viewYear && !date.startsWith(viewYear.toString())) return;
          logs[date].forEach(entry => {
            if (entry.type === 'PTO' || entry.type === 'UNPTO' || entry.type === 'MED-P-PTO' || entry.type === 'FMLA-P') {
              ptoEntries.push({ date, hrs: parseFloat(entry.hrs as any) || 8, type: entry.type });
            } 
            if (entry.type === 'FMLA-P') {
              fmlaPEntries.push({ date, hrs: parseFloat(entry.hrs as any) || 8, type: `${entry.type}${entry.fmlaCase ? ` (Case #${entry.fmlaCase})` : ''}` });
            } 
            if (entry.type === 'FML-UNP') {
              fmlaUnpEntries.push({ date, hrs: parseFloat(entry.hrs as any) || 8, type: `${entry.type}${entry.fmlaCase ? ` (Case #${entry.fmlaCase})` : ''}` });
            } 
            if (entry.type === 'HOL') {
              holEntries.push({ date, hrs: parseFloat(entry.hrs as any) || 8, type: entry.type });
            } 
            if (['TARDY', 'NO-SHOW'].includes(entry.type)) {
              const unp = entry.unpaidHrs !== undefined ? parseFloat(entry.unpaidHrs as any) : (parseFloat(entry.hrs as any) || 8);
              const deduction = (parseFloat(entry.hrs as any) || 8) - unp;
              if (deduction > 0) {
                 ptoEntries.push({ date, hrs: deduction, type: `${entry.type} (PTO Covered)` });
              }
            }
          });
        });
        
        ptoEntries.sort((a, b) => b.date.localeCompare(a.date));
        fmlaPEntries.sort((a, b) => b.date.localeCompare(a.date));
        holEntries.sort((a, b) => b.date.localeCompare(a.date));
        fmlaUnpEntries.sort((a, b) => b.date.localeCompare(a.date));

        return (
          <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('timeoffDetails'); }}>
            <div className="modal-box max-w-[450px] p-0 overflow-hidden rounded-2xl">
              <div className="bg-[var(--swa-blue)] p-6 text-white">
                <h3 className="text-center m-0 text-xl font-bold flex items-center justify-center gap-3">
                  <Calendar className="w-7 h-7" />
                  Time Off Balances: {viewYear}
                </h3>
              </div>
              
              <div className="p-5 bg-[var(--card-bg)] space-y-6 max-h-[75vh] overflow-y-auto">
                {/* PTO Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                    <Clock className="w-4 h-4 text-[var(--swa-blue)]" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-blue)] m-0">PTO Breakdown</h4>
                  </div>

                  <div className="space-y-3">
                    {/* Main PTO Card */}
                    <div className="bg-[var(--swa-blue)]/10 border border-[var(--swa-blue)]/20 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="bg-[var(--swa-blue)] p-2.5 rounded-xl text-white shadow-md">
                          <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-black text-[var(--swa-blue)] opacity-60 m-0 tracking-wider">Projected End Balance</p>
                          <p className={`text-3xl font-black m-0 leading-tight ${stats?.ptoEnd < 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>
                            {stats?.ptoEnd !== undefined ? formatPto(stats.ptoEnd) : '0.00'} <span className="text-sm font-bold opacity-60">hrs</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-3">
                        <p className="text-[9px] uppercase font-black text-[var(--text-muted)] opacity-60 m-0 tracking-wider mb-1">Start Balance</p>
                        <p className="text-lg font-black text-[var(--text-main)] m-0">{stats?.ptoStart !== undefined ? formatPto(stats.ptoStart) : '0.00'} hrs</p>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-3">
                        <p className="text-[9px] uppercase font-black text-[var(--text-muted)] opacity-60 m-0 tracking-wider mb-1">Accrual Rate</p>
                        <p className="text-lg font-black text-[var(--text-main)] m-0">{stats?.currentTier?.a !== undefined ? formatPto(stats.currentTier.a) : '0.00'} hrs/mo</p>
                      </div>
                    </div>

                    <div className="bg-[var(--cap-bg)] border border-[var(--border-color)] rounded-xl p-3 flex justify-between items-center">
                      <p className="text-[10px] uppercase font-black text-[var(--text-muted)] opacity-60 m-0 tracking-wider">Maximum Cap</p>
                      <p className="text-sm font-black text-[var(--text-main)] m-0">{stats?.currentTier?.c !== undefined ? formatPto(stats.currentTier.c) : '0.00'} hrs</p>
                    </div>

                    {/* PTO Usage Accordions */}
                    <div className="space-y-3">
                      {ptoEntries.length > 0 && (
                        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                          <button 
                            className="w-full flex justify-between items-center p-4 bg-[var(--sub-bg)] hover:bg-[var(--hover-bg)] transition-colors"
                            onClick={() => setExpandPto(!expandPto)}
                          >
                            <div className="text-left">
                              <p className="text-[11px] font-black uppercase text-[var(--swa-blue)] m-0 tracking-wider">PTO Usage ({viewYear})</p>
                              <p className="text-[10px] text-[var(--text-muted)] m-0 font-bold mt-0.5">
                                PTO: {formatPto(ptoEntries.filter(e => e.type === 'PTO' || e.type === 'UNPTO').reduce((sum, e) => sum + e.hrs, 0))}h | 
                                Tardy/NS: {formatPto(ptoEntries.filter(e => e.type.includes('TARDY') || e.type.includes('NO-SHOW')).reduce((sum, e) => sum + e.hrs, 0))}h
                              </p>
                            </div>
                            <div className="bg-[var(--card-bg)] p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--swa-blue)]">
                              {expandPto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                          </button>
                          {expandPto && (
                            <div className="p-3 bg-[var(--card-bg)] max-h-[200px] overflow-y-auto divide-y divide-[var(--border-color)]">
                              {ptoEntries.map((e, i) => (
                                <div key={i} className="flex justify-between py-2.5 text-[11px] group">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[var(--text-main)]">{e.date}</span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">{e.type}</span>
                                  </div>
                                  <span className="font-black text-[var(--swa-red)]">-{formatPto(e.hrs)} hrs</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {fmlaPEntries.length > 0 && (
                        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                          <button 
                            className="w-full flex justify-between items-center p-4 bg-[var(--sub-bg)] hover:bg-[var(--hover-bg)] transition-colors"
                            onClick={() => setExpandFmlaP(!expandFmlaP)}
                          >
                            <div className="text-left">
                              <p className="text-[11px] font-black uppercase text-[var(--swa-blue)] m-0 tracking-wider">FMLA Paid Usage</p>
                              <p className="text-[10px] text-[var(--text-muted)] m-0 font-bold mt-0.5">Total: {fmlaPEntries.reduce((sum, e) => sum + e.hrs, 0).toFixed(2)}h</p>
                            </div>
                            <div className="bg-[var(--card-bg)] p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--swa-blue)]">
                              {expandFmlaP ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                          </button>
                          {expandFmlaP && (
                            <div className="p-3 bg-[var(--card-bg)] max-h-[200px] overflow-y-auto divide-y divide-[var(--border-color)]">
                              {fmlaPEntries.map((e, i) => (
                                <div key={i} className="flex justify-between py-2.5 text-[11px]">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[var(--text-main)]">{e.date}</span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">{e.type}</span>
                                  </div>
                                  <span className="font-black text-[var(--swa-red)]">-{formatPto(e.hrs)} hrs</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {fmlaUnpEntries.length > 0 && (
                        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                          <button 
                            className="w-full flex justify-between items-center p-4 bg-[var(--sub-bg)] hover:bg-[var(--hover-bg)] transition-colors"
                            onClick={() => setExpandFmlaUnp(!expandFmlaUnp)}
                          >
                            <div className="text-left">
                              <p className="text-[11px] font-black uppercase text-[var(--swa-blue)] m-0 tracking-wider">FMLA Unpaid Usage</p>
                              <p className="text-[10px] text-[var(--text-muted)] m-0 font-bold mt-0.5">Total: {fmlaUnpEntries.reduce((sum, e) => sum + e.hrs, 0).toFixed(2)}h</p>
                            </div>
                            <div className="bg-[var(--card-bg)] p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--swa-blue)]">
                              {expandFmlaUnp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                          </button>
                          {expandFmlaUnp && (
                            <div className="p-3 bg-[var(--card-bg)] max-h-[200px] overflow-y-auto divide-y divide-[var(--border-color)]">
                              {fmlaUnpEntries.map((e, i) => (
                                <div key={i} className="flex justify-between py-2.5 text-[11px]">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[var(--text-main)]">{e.date}</span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">{e.type}</span>
                                  </div>
                                  <span className="font-black text-[var(--swa-red)]">-{formatPto(e.hrs)} hrs</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Holiday Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-1 border-b border-[var(--border-color)]">
                    <Zap className="w-4 h-4 text-[var(--swa-blue)]" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-[var(--swa-blue)] m-0">Holiday Breakdown</h4>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-[var(--swa-blue)]/10 border border-[var(--swa-blue)]/20 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="bg-[var(--swa-blue)] p-2.5 rounded-xl text-white shadow-md">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-black text-[var(--swa-blue)] opacity-60 m-0 tracking-wider">Projected End Balance</p>
                          <p className={`text-3xl font-black m-0 leading-tight ${stats?.holEnd < 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>
                            {((stats?.holEnd || 0) / 8).toFixed(0)} <span className="text-sm font-bold opacity-60">days</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-3">
                        <p className="text-[9px] uppercase font-black text-[var(--text-muted)] opacity-60 m-0 tracking-wider mb-1">Start Balance</p>
                        <p className="text-lg font-black text-[var(--text-main)] m-0">{((stats?.holStart || 0) / 8).toFixed(0)} days</p>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-3">
                        <p className="text-[9px] uppercase font-black text-[var(--text-muted)] opacity-60 m-0 tracking-wider mb-1">Accrual Rate</p>
                        <p className="text-lg font-black text-[var(--text-main)] m-0">1 day / Hol</p>
                      </div>
                    </div>

                    {holEntries.length > 0 && (
                      <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                        <button 
                          className="w-full flex justify-between items-center p-3 bg-[var(--sub-bg)] hover:bg-[var(--hover-bg)] transition-colors"
                          onClick={() => setExpandHol(!expandHol)}
                        >
                          <div className="text-left">
                            <p className="text-[10px] font-black uppercase text-[var(--swa-blue)] m-0">Holiday Usage ({viewYear})</p>
                            <p className="text-[9px] text-[var(--text-muted)] m-0">Total: {holEntries.length} days</p>
                          </div>
                          <span className="text-[var(--swa-blue)] font-bold">{expandHol ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                        </button>
                        {expandHol && (
                          <div className="p-2 bg-[var(--card-bg)] max-h-[150px] overflow-y-auto divide-y divide-[var(--border-color)]">
                            {holEntries.map((e, i) => (
                              <div key={i} className="flex justify-between py-1.5 text-[11px]">
                                <span className="font-medium text-[var(--text-main)]">{e.date} <span className="text-[9px] opacity-60">({e.type})</span></span>
                                <span className="font-bold text-[var(--swa-red)]">-1 day</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button className="modal-btn btn-cancel mt-2 w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg transition-all" onClick={() => closeModal('timeoffDetails')}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pay Details Modal */}
      {modalsState.payDetails && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('payDetails'); }}>
          <div className="modal-box max-w-[350px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Annual Pay Breakdown</h3>
            
            <div className="text-xs font-bold text-[var(--text-main)] flex flex-col gap-2 mt-3">
              <div className="flex justify-between py-1">
                <span>Base Salary:</span> 
                <span className="text-[var(--pay-green)]">${stats?.yg ? (stats.yg - stats.otYearAmt - stats.dtYearAmt - stats.holYearPay - stats.midYearAmt - (stats.sti || 0) + stats.totalYearLoss).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00'}</span>
              </div>
              
              {stats?.sti > 0 && (
                <div className="flex justify-between py-1">
                  <span>STI Bonus:</span> 
                  <span className="text-[var(--pay-green)]">${stats.sti.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                </div>
              )}
              
              {stats?.otYearAmt > 0 && (
                <div className="flex justify-between py-1">
                  <span>Overtime (1.5x):</span> 
                  <span className="text-[var(--ra-gold)]">${stats.otYearAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                </div>
              )}
              
              {stats?.dtYearAmt > 0 && (
                <div className="flex justify-between py-1">
                  <span>Double Time (2.0x):</span> 
                  <span className="text-[var(--ra-gold)]">${stats.dtYearAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                </div>
              )}
              
              {stats?.holYearPay > 0 && (
                <div className="flex justify-between py-1">
                  <span>Holiday Worked (+Pay):</span> 
                  <span className="text-[var(--pay-green)]">${stats.holYearPay.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                </div>
              )}
              
              {stats?.midYearAmt > 0 && (
                <div className="flex justify-between py-1">
                  <span>Midnight Diffs:</span> 
                  <span className="text-[var(--ra-gold)]">${stats.midYearAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                </div>
              )}
              
              {stats?.totalYearLoss > 0 && (
                <>
                  <div className="py-1 font-black border-t border-[var(--border-color)] mt-1">Lost Wages Breakdown:</div>
                  {stats.wopYearLoss > 0 && (
                    <div className="flex justify-between py-0.5 text-[var(--swa-red)] pl-2.5">
                      <span>↳ WOP / Unpaid:</span> 
                      <span>-${stats.wopYearLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                  )}
                  {stats.fmlaUnpYearLoss > 0 && (
                    <div className="flex justify-between py-0.5 text-[var(--swa-red)] pl-2.5">
                      <span>↳ FMLA Unpaid:</span> 
                      <span>-${stats.fmlaUnpYearLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                  )}
                  {stats.infractionYearLoss > 0 && (
                    <div className="flex justify-between py-0.5 text-[var(--swa-red)] pl-2.5">
                      <span>↳ Tardy / No-Show:</span> 
                      <span>-${stats.infractionYearLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                  )}
                </>
              )}
              
              <div className="flex justify-between text-base pt-2 border-t border-[var(--border-color)] mt-1">
                <span><strong>TOTAL GROSS:</strong></span> 
                <span className="text-[var(--pay-green)]"><strong>${stats?.yg?.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) || '0.00'}</strong></span>
              </div>

              <div className="py-2 border-t border-[var(--border-color)] mt-2">
                <div className="font-black mb-2 text-[var(--swa-blue)]">Deductions (Annual Est.)</div>
                <div className="flex justify-between items-center py-1">
                  <div className="flex items-center gap-2">
                    <span className="w-20">401K (%):</span>
                    <input 
                      type="number" 
                      step="any"
                      className="p-1 border border-[var(--border-color)] rounded text-xs w-16 bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-1 focus:ring-[var(--swa-blue)]"
                      value={settings.k401Pct || '0'}
                      onChange={(e) => updateSettings({ k401Pct: e.target.value })}
                    />
                  </div>
                  <span className="text-[var(--swa-red)]">-${stats?.k401YearDed?.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) || '0.00'}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <div className="flex items-center gap-2">
                    <span className="w-20">Insurance ($):</span>
                    <input 
                      type="number" 
                      step="any"
                      className="p-1 border border-[var(--border-color)] rounded text-xs w-16 bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-1 focus:ring-[var(--swa-blue)]"
                      value={settings.insuranceDed || '0'}
                      onChange={(e) => updateSettings({ insuranceDed: e.target.value })}
                    />
                  </div>
                  <span className="text-[var(--swa-red)]">-${stats?.insuranceYearAmt?.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) || '0.00'}</span>
                </div>
              </div>

              <div className="flex justify-between text-base pt-2 border-t border-[var(--border-color)] mt-1">
                <span><strong>ESTIMATED NET:</strong></span> 
                <span className="text-[var(--pay-green)]"><strong>${stats?.estimatedNetYear?.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) || '0.00'}</strong></span>
              </div>
            </div>
            
            <button className="modal-btn btn-cancel mt-4" onClick={() => closeModal('payDetails')}>CLOSE</button>
          </div>
        </div>
      )}

      {/* STI Modal */}
      {modalsState.sti && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('sti'); }}>
          <div className="modal-box max-w-[350px]">
            <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">STI Bonus Calculation</h3>
            
            <div className="flex flex-col gap-3 mt-4">
              <div>
                <label className="text-[10px] font-bold text-[var(--swa-blue)] uppercase mb-1 block">Effective Base Salary ({viewYear - 1})</label>
                <input 
                  type="number" 
                  value={stiBaseSalary} 
                  onChange={(e) => setStiBaseSalary(e.target.value)}
                  className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border"
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-[var(--swa-blue)] uppercase mb-1 block">Bonus Percentage (%)</label>
                <input 
                  type="number" 
                  value={stiBonusPct} 
                  onChange={(e) => setStiBonusPct(e.target.value)}
                  className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border"
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-[var(--swa-blue)] uppercase mb-1 block">Company Percentage (%)</label>
                <input 
                  type="number" 
                  value={stiCompanyPct} 
                  onChange={(e) => setStiCompanyPct(e.target.value)}
                  placeholder="e.g. 125"
                  className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--swa-blue)] uppercase mb-1 block">Personal Performance (%)</label>
                <input 
                  type="number" 
                  value={stiPersonalPct} 
                  onChange={(e) => setStiPersonalPct(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full p-2 border border-[var(--border-color)] rounded bg-[var(--bg-grey)] text-[var(--text-main)] box-border"
                />
              </div>

              {stiPeriods.length > 0 && (
                <div className="bg-[var(--sub-bg)] p-3 rounded-lg border border-[var(--border-color)]">
                  <div className="text-[10px] font-bold text-[var(--swa-blue)] uppercase mb-2">Proration Breakdown ({viewYear - 1})</div>
                  <div className="flex flex-col gap-2">
                    {stiPeriods.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] pb-2 border-b border-[var(--border-color)]/50 last:border-0 last:pb-0">
                        <div className="flex flex-col">
                          <span className="font-bold text-[var(--text-main)]">
                            {p.startDs === p.endDs ? p.startDs : `${p.startDs} to ${p.endDs}`}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {p.days} day{p.days > 1 ? 's' : ''} • Level {p.level} • {p.pct}% STI
                          </span>
                        </div>
                        <div className="font-black text-[var(--swa-blue)] text-right">
                          ${p.salary.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-[var(--border-color)] flex flex-col gap-1 text-[10px]">
                    <div className="flex justify-between font-bold">
                      <span className="text-[var(--text-muted)]">Effective Base Salary:</span>
                      <span className="text-[var(--text-main)]">${parseFloat(stiBaseSalary || '0').toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-[var(--text-muted)]">Effective Bonus:</span>
                      <span className="text-[var(--text-main)]">{stiBonusPct}%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-black/5 p-3 rounded-lg text-center mt-2">
                <div className="text-[10px] font-bold text-[var(--text-main)] uppercase mb-1">Estimated Bonus</div>
                <div className="text-xl font-black text-[var(--pay-green)]">
                  ${((parseFloat(stiBonusPct)/100) * (parseFloat(stiBaseSalary)||0) * (parseFloat(stiCompanyPct)/100) * (parseFloat(stiPersonalPct)/100)).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}
                </div>
              </div>

              <button className="modal-btn bg-[var(--swa-blue)] mt-2" onClick={handleSaveSti}>SAVE TO ANNUAL GROSS</button>
              <button className="modal-btn bg-transparent text-[var(--text-muted)] border-none" onClick={() => closeModal('sti')}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Paycheck Audit Modal */}
      {modalsState.paycheckAudit && selectedPaycheck && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('paycheckAudit'); }}>
          <div className="modal-box max-w-[400px]">
            {(() => {
              const { y, m, d } = selectedPaycheck;
              const pay = calculatePay(y, m, d, logs, midCounts, settings);
              const mName = new Date(y, m, 1).toLocaleString('default', { month: 'long' });
              const hrVal = pay.basePay * 24 / 2080; // Derived from basePay to match calculatePay logic
              
              let periodText = "";
              if (d === 20) {
                periodText = `${mName} 1st - 15th`;
              } else {
                let prevM = m - 1; let prevY = y;
                if (prevM < 0) { prevM = 11; prevY = y - 1; }
                const prevMName = new Date(prevY, prevM, 1).toLocaleString('default', { month: 'long' });
                const lastDay = new Date(prevY, prevM + 1, 0).getDate();
                periodText = `${prevMName} 16th - ${lastDay}th`;
              }

              return (
                <>
                  <h3 className="text-center text-[var(--swa-blue)] mt-0 border-b-2 border-[var(--border-color)] pb-2.5">Paycheck Audit: {mName} {d}th</h3>
                  <p className="text-[10px] text-[var(--text-muted)] text-center mt-1 mb-1 font-bold uppercase tracking-wider">Period: {periodText}</p>
                  <p className="text-[9px] text-[var(--swa-blue)] text-center mb-3 font-bold uppercase">Rate: ${hrVal.toFixed(2)}/hr | Level: {pay.level}</p>
                  
                  <div className="flex justify-between bg-[var(--hover-bg)] p-2 rounded-md mb-4 text-[10px] font-bold">
                    <div className="flex flex-col items-center">
                      <span className="text-[var(--text-muted)] uppercase">Worked</span>
                      <span className="text-[var(--swa-blue)] text-sm">{pay.totalHrsWorked.toFixed(1)}h</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[var(--text-muted)] uppercase">Overtime</span>
                      <span className="text-[var(--ra-gold)] text-sm">{(pay.otHrs + pay.dtHrs).toFixed(1)}h</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[var(--text-muted)] uppercase">Unpaid</span>
                      <span className="text-[var(--swa-red)] text-sm">{pay.totalUnpaidHrs.toFixed(1)}h</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 text-xs font-bold">
                    <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
                      <span>Base Pay (Salary / 24):</span>
                      <span className="text-[var(--pay-green)]">${pay.basePay.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>

                    {(() => {
                      const totalExtraPay = pay.ot + pay.dt + pay.holPay + pay.midAmt + pay.stiAmt;
                      if (totalExtraPay > 0) {
                        return (
                          <div className="flex flex-col border-b border-[var(--border-color)] py-1">
                            <div 
                              className="flex justify-between items-center cursor-pointer hover:bg-[var(--hover-bg)] py-1 px-1 rounded transition-colors"
                              onClick={() => setExpandExtraPay(!expandExtraPay)}
                            >
                              <span className="text-[var(--swa-blue)] flex items-center gap-1">
                                Total Additional Compensation:
                                <span className="text-[10px] opacity-70 bg-[var(--hover-bg)] px-1 rounded">{expandExtraPay ? '▼' : '▶'}</span>
                              </span>
                              <span className="text-[var(--pay-green)]">${totalExtraPay.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            </div>
                            {expandExtraPay && (
                              <div className="flex flex-col pl-3 text-[10px] opacity-90 font-normal mt-1 border-l-2 border-[var(--border-color)] ml-1">
                                {pay.ot > 0 && (
                                  <div className="flex justify-between py-1 border-b border-black/5">
                                    <span>Overtime (1.5x) - {pay.otHrs}h:</span>
                                    <span className="text-[var(--ra-gold)]">${pay.ot.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                  </div>
                                )}

                                {pay.dt > 0 && (
                                  <div className="flex justify-between py-1 border-b border-black/5">
                                    <span>Double Time (2.0x) - {pay.dtHrs}h:</span>
                                    <span className="text-[var(--ra-gold)]">${pay.dt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                  </div>
                                )}

                                {pay.holPay > 0 && (
                                  <div className="flex justify-between py-1 border-b border-black/5">
                                    <span>Holiday Worked (+Pay) - {pay.holHrs}h:</span>
                                    <span className="text-[var(--pay-green)]">${pay.holPay.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                  </div>
                                )}

                                {pay.midAmt > 0 && (
                                  <div className="flex flex-col border-b border-black/5 py-1">
                                    <div className="flex justify-between cursor-pointer group" onClick={() => setShowMidDates(!showMidDates)}>
                                      <span className="group-hover:text-[var(--swa-blue)] transition-colors">Midnight Diffs ({pay.midCount} @ ${ (pay.midAmt / pay.midCount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) }) ▾:</span>
                                      <span className="text-[var(--ra-gold)]">${pay.midAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                    </div>
                                    {showMidDates && (pay as any).midDates && (pay as any).midDates.length > 0 && (
                                      <div className="text-[10px] text-[var(--text-muted)] mt-1 ml-2 font-normal capitalize" style={{lineHeight: 1.2}}>
                                        {(pay as any).midDates.map((dStr: string) => {
                                          const match = dStr.match(/^(\d{4})-(\d{2})-(\d{2})\s*(.*)$/);
                                          if (match) {
                                            const d = parseInt(match[3], 10);
                                            const m = parseInt(match[2], 10) - 1;
                                            const y = parseInt(match[1], 10) % 100;
                                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                            return `${d}, ${monthNames[m]}, ${y} ${match[4]}`;
                                          }
                                          return dStr;
                                        }).join(' | ')}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {pay.stiAmt > 0 && (
                                  <div className="flex justify-between py-1">
                                    <span>STI Bonus:</span>
                                    <span className="text-[var(--pay-green)]">${pay.stiAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {pay.totalLoss > 0 && (
                      <div className="flex flex-col border-b border-[var(--border-color)] py-1 text-[var(--swa-red)]">
                        <div className="flex justify-between">
                          <span>Lost Wages ({pay.totalUnpaidHrs.toFixed(1)}h):</span>
                          <span>-${pay.totalLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                        </div>
                        <div className="flex flex-col pl-3 text-[10px] opacity-80 font-normal">
                          {pay.wopLoss > 0 && (
                            <div className="flex justify-between">
                              <span>• WOP/UNPTO/Unsched ({(pay.wopLoss / hrVal).toFixed(1)}h):</span>
                              <span>-${pay.wopLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            </div>
                          )}
                          {pay.fmlaUnpLoss > 0 && (
                            <div className="flex justify-between">
                              <span>• FMLA Unpaid ({(pay.fmlaUnpLoss / hrVal).toFixed(1)}h):</span>
                              <span>-${pay.fmlaUnpLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            </div>
                          )}
                          {pay.infractionLoss > 0 && (
                            <div className="flex justify-between">
                              <span>• Infractions ({(pay.infractionLoss / hrVal).toFixed(1)}h):</span>
                              <span>-${pay.infractionLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between text-base pt-2 border-t-2 border-[var(--swa-blue)] mt-2">
                      <span><strong>EST. NET PAY:</strong></span>
                      <span className="text-[var(--swa-blue)]"><strong>${pay.net.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></span>
                    </div>

                    <div className="mt-4 border border-[var(--border-color)] rounded-lg p-3 bg-[var(--sub-bg)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-[var(--swa-blue)] uppercase">Deductions</span>
                        {!isEditingDeductions ? (
                          <button 
                            className="text-[10px] bg-[var(--hover-bg)] px-2 py-1 rounded text-[var(--text-main)] hover:bg-[var(--border-color)] transition-colors"
                            onClick={() => {
                              setEditK401Pct(pay.k401Pct.toString());
                              setEditInsuranceDed(pay.insuranceAmt.toString());
                              setIsEditingDeductions(true);
                            }}
                          >
                            Edit
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              className="text-[10px] bg-[var(--swa-blue)] text-white px-2 py-1 rounded hover:opacity-90 transition-opacity"
                              onClick={() => {
                                let newDeds = {}; try { newDeds = JSON.parse(settings.monthlyDeductions || '{}'); } catch(e) {}
                                newDeds[`${y}-${m}`] = {
                                  k401Pct: editK401Pct,
                                  insuranceDed: editInsuranceDed
                                };
                                updateSettings({ monthlyDeductions: JSON.stringify(newDeds) });
                                setIsEditingDeductions(false);
                              }}
                            >
                              Save
                            </button>
                            <button 
                              className="text-[10px] bg-[var(--swa-red)] text-white px-2 py-1 rounded hover:opacity-90 transition-opacity"
                              onClick={() => {
                                let newDeds = {}; try { newDeds = JSON.parse(settings.monthlyDeductions || '{}'); } catch(e) {}
                                delete newDeds[`${y}-${m}`];
                                updateSettings({ monthlyDeductions: JSON.stringify(newDeds) });
                                setIsEditingDeductions(false);
                              }}
                            >
                              Clear Override
                            </button>
                            <button 
                              className="text-[10px] bg-[var(--hover-bg)] px-2 py-1 rounded text-[var(--text-main)] hover:bg-[var(--border-color)] transition-colors"
                              onClick={() => setIsEditingDeductions(false)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditingDeductions ? (
                        <div className="flex flex-col gap-2 mt-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-[var(--text-muted)]">401K (%)</label>
                            <input 
                              type="number" 
                              step="any"
                              className="w-20 p-1 text-right text-xs border border-[var(--border-color)] rounded bg-[var(--input-bg)] text-[var(--text-main)]"
                              value={editK401Pct}
                              onChange={(e) => setEditK401Pct(e.target.value)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-[var(--text-muted)]">Insurance ($)</label>
                            <input 
                              type="number" 
                              step="any"
                              className="w-20 p-1 text-right text-xs border border-[var(--border-color)] rounded bg-[var(--input-bg)] text-[var(--text-main)]"
                              value={editInsuranceDed}
                              onChange={(e) => setEditInsuranceDed(e.target.value)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 text-[11px]">
                          <div className="flex justify-between">
                            <span>401K ({pay.k401Pct}%):</span>
                            <span className="text-[var(--swa-red)]">-${pay.k401Ded.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Insurance:</span>
                            <span className="text-[var(--swa-red)]">-${pay.insuranceAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                          </div>
                          {settings.enableTaxes === 'true' && (
                            <>
                              <div className="flex justify-between border-t border-[var(--border-color)]/40 pt-1.5 mt-1 text-[var(--swa-blue)] font-bold">
                                <span>Taxes Withheld:</span>
                                <span className="text-[var(--swa-red)]">-${(pay.taxAmt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                              </div>
                              <div className="flex flex-col pl-2 text-[10px] opacity-90 gap-0.5 font-medium">
                                <div className="flex justify-between">
                                  <span>• FICA (Federal Insurance 7.65%):</span>
                                  <span>-${(pay.ficaAmt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>• Federal Income Tax ({settings.taxFilingStatus || 'single'}):</span>
                                  <span>{settings.fedTaxExempt === 'true' ? 'EXEMPT ($0.00)' : `-$${(pay.fedTaxAmt || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`}</span>
                                </div>
                                <div className="flex justify-between text-[var(--pay-green)]">
                                  <span>• Texas State Tax (0.00%):</span>
                                  <span>$0.00</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between text-base pt-2 border-t-2 border-[var(--swa-blue)] mt-2">
                      <span><strong>ESTIMATED NET:</strong></span>
                      <span className="text-[var(--pay-green)]"><strong>${pay.estimatedNet.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></span>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-2 bg-[var(--hover-bg)] rounded text-[9px] text-[var(--text-muted)] italic leading-relaxed">
                    * This audit reflects the salary active during the work period. 
                    {m === 1 && d === 5 ? " Note: Feb 5th paycheck covers Jan 16-31 (Pre-Raise)." : ""}
                    {m === 2 && d === 5 ? " Note: March 5th paycheck covers Feb 16-28 (Pre-Raise)." : ""}
                    {m === 2 && d === 20 ? " Note: March 20th paycheck covers Mar 1-15 (Post-Raise)." : ""}
                  </div>
                </>
              );
            })()}
            <button className="modal-btn btn-cancel mt-4" onClick={() => closeModal('paycheckAudit')}>CLOSE</button>
          </div>
        </div>
      )}


      {/* User Guide Modal */}
      {modalsState.userGuide && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('userGuide'); }}>
          <div className="modal-box max-w-[680px] max-h-[92vh] overflow-y-auto p-0 rounded-3xl shadow-2xl border border-[var(--border-color)]">
            {/* Header */}
            <div className="sticky top-0 bg-[var(--card-bg)]/95 backdrop-blur-md p-6 border-b border-[var(--border-color)] z-10 flex justify-between items-center bg-[var(--card-bg)]">
              <div className="flex items-center gap-4">
                <div className="bg-[var(--swa-blue)] p-3 rounded-2xl text-white shadow-lg shadow-[var(--swa-blue)]/20">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[var(--swa-blue)] m-0 uppercase tracking-tight leading-none">Interactive Scheduler Guide</h3>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1">Master your schedule, pay, and attendance tracking</p>
                </div>
              </div>
              <button 
                onClick={() => closeModal('userGuide')}
                className="p-2 hover:bg-[var(--hover-bg)] rounded-xl transition-colors text-[var(--text-muted)] border border-transparent hover:border-[var(--border-color)]"
              >
                <X size={24} />
              </button>
            </div>

            {/* Quick Interactive Tabs */}
            <div className="flex gap-1 p-3 bg-[var(--sub-bg)] border-b border-[var(--border-color)] overflow-x-auto shrink-0 scrollbar-none sticky top-[89px] z-10 backdrop-blur-md">
              {[
                { id: 'overview', label: '📌 Overview', desc: 'Setup & Keys' },
                { id: 'sync', label: '☁️ Cloud Sync', desc: 'Sync & Backup' },
                { id: 'dashboard', label: '🎛️ Dashboard', desc: 'Custom Orders' },
                { id: 'import', label: '📂 Smart Import', desc: 'RosterApps Reports' },
                { id: 'attendance', label: '🛡️ Attendance', desc: 'Rolling Points' },
                { id: 'payFmla', label: '💰 Pay & FMLA', desc: 'Premium Audits' },
                { id: 'rules', label: '⚙️ Op Rules', desc: 'Custom Rules' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveGuideTab(tab.id)}
                  className={`flex-1 min-w-[110px] p-2 rounded-2xl border transition-all text-xs flex flex-col items-center justify-center text-center gap-0.5 cursor-pointer ${
                    activeGuideTab === tab.id
                      ? 'bg-[var(--swa-blue)] border-[var(--swa-blue)] text-white shadow-md font-black'
                      : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:border-[var(--swa-blue)]/35 text-[var(--text-main)] hover:bg-[var(--hover-bg)] font-medium'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold tracking-tight">{tab.label}</span>
                  <span className={`text-[8px] tracking-tighter ${activeGuideTab === tab.id ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{tab.desc}</span>
                </button>
              ))}
            </div>
            
            <div className="p-6 text-[var(--text-main)] space-y-6">
              
              {/* Tab 1: Overview */}
              {activeGuideTab === 'overview' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Welcome to your upgraded <span className="text-[var(--swa-blue)] font-black">SWA Schedule Tracker & Pay Auditing Suite</span>. This specialized applet empowers you with advanced automated rules, personalized summary card layouts, precise paycheck evaluations, and continuous regulatory or attendance auditing.
                    </p>
                  </div>

                  <div className="space-y-4 font-medium">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">1. Initial Setup & Configuration</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-3">
                        <div className="bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] w-8 h-8 rounded-xl flex items-center justify-center font-black shrink-0">H</div>
                        <div>
                          <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Adjust Hire Date</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                            Set your original hiring date in <span className="font-semibold">Settings</span>. The app is equipped with an automated seniority progression matrix that recalculates your straight hourly scale automatically upon each calendar anniversary.
                          </p>
                        </div>
                      </div>

                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-3">
                        <div className="bg-[var(--pay-green)]/10 text-[var(--pay-green)] w-8 h-8 rounded-xl flex items-center justify-center font-black shrink-0">$</div>
                        <div>
                          <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Base Pay & Deductions</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                            Declare your standard base hourly rate, 401(k) pre-tax contribution ratios, and medical/insurance premiums to generate custom projected net salaries on designated payday records.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Calendar Keys Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">2. Calendar Design Key</h4>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed m-0">
                      The schedule grid applies exact Southwest operational guidelines and shifts. Logged items use custom badges and border shapes for rapid distinction:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)]/50 p-2 rounded-xl flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-md bg-[var(--sh-am)] shadow-sm shrink-0" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-normal">AM SHIFT</span>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)]/50 p-2 rounded-xl flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-md bg-[var(--sh-pm)] shadow-sm shrink-0" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-normal">PM SHIFT</span>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)]/50 p-2 rounded-xl flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-md bg-[var(--sh-mid)] shadow-sm shrink-0" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-normal">MID SHIFT</span>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)]/50 p-2 rounded-xl flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-md bg-[var(--ra-gold)] shadow-sm shrink-0" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-normal">OVERTIME (1.5x)</span>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)]/50 p-2 rounded-xl flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-md bg-[var(--ra-purple)] shadow-sm shrink-0" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-normal">PTO / VACATION</span>
                      </div>
                      <div className="bg-[var(--sub-bg)] border border-[var(--border-color)]/50 p-2 rounded-xl flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-md bg-[var(--swa-red)] shadow-sm shrink-0" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-normal">INFRACTION / POINTS</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                    <TrendingUp size={24} className="text-[var(--swa-blue)] shrink-0" />
                    <div>
                      <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Yearly Calendar Matrix View</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                        Toggle to "Yearly View" to display your full 12-month calendar scroll at once. We call out critical holiday periods in bold red boxes and designate your seniority hire anniversary with a celebratory gold-accented header banner.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Sync & Backup */}
              {activeGuideTab === 'sync' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Never lose your schedule again. <span className="text-[var(--swa-blue)] font-black">Cloud Sync</span> automatically backs up your calendar, logs, and settings to the cloud in real-time.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">How Cloud Sync Works</h4>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="bg-[var(--pay-green)]/10 text-[var(--pay-green)] w-8 h-8 rounded-xl flex items-center justify-center font-black shrink-0">1</div>
                        <div>
                          <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Sign In</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                            Click the "Sync Data" button in the header and sign in with your Google account. This links your local data to a secure cloud database.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <div className="bg-[var(--pay-green)]/10 text-[var(--pay-green)] w-8 h-8 rounded-xl flex items-center justify-center font-black shrink-0">2</div>
                        <div>
                          <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Cross-Device Access</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                            Once synced, you can access your exact same schedule, settings, and FMLA tracking across your phone, tablet, or desktop simply by logging in on any device.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="bg-[var(--pay-green)]/10 text-[var(--pay-green)] w-8 h-8 rounded-xl flex items-center justify-center font-black shrink-0">3</div>
                        <div>
                          <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Automatic Saves</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                            Every change you make (adding a shift, modifying pay settings, changing theme) is automatically persisted to the cloud as long as you're logged in.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4 mt-4">
                    <Cloud size={24} className="text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Manual Backups Still Available</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                        You can still manually export and import offline JSON backups from the Settings menu. However, Cloud Sync makes this step completely optional and automated.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Dashboard */}
              {activeGuideTab === 'dashboard' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0 flex items-center gap-2">
                       <Zap size={18} className="text-[var(--swa-blue)] shrink-0" />
                       Did you know? You can now completely customize and reorder your main metrics dashboard via simple drag and drop gestures.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">1. Summary Card Personal Preferences</h4>
                    <div className="space-y-3">
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed m-0">
                        Tailor your metrics precisely to what matters most to you. Long-press or click and hold any card, then drag it into your desired slot:
                      </p>
                      <ul className="space-y-3 pl-4">
                        <li className="text-[11px] text-[var(--text-muted)] mt-1 leading-normal list-disc">
                          <span className="font-black text-[var(--text-main)]">Time Off Balances:</span> View combined pools of current and end-of-year projected Vacation and Holiday balances.
                        </li>
                        <li className="text-[11px] text-[var(--text-muted)] mt-1 leading-normal list-disc">
                          <span className="font-black text-[var(--text-main)]">Status Levels (Attendance / Perf):</span> Get immediate grades on SouthWest Airline's rolling scores.
                        </li>
                        <li className="text-[11px] text-[var(--text-muted)] mt-1 leading-normal list-disc">
                          <span className="font-black text-[var(--text-main)]">Midnight Shifts:</span> Live counters checking your consecutive monthly night rotations.
                        </li>
                        <li className="text-[11px] text-[var(--text-muted)] mt-1 leading-normal list-disc">
                          <span className="font-black text-[var(--text-main)]">Annual Gross Wages:</span> Comprehensive year-to-date calculation summaries.
                        </li>
                      </ul>
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)] text-[10px] text-[var(--text-muted)] italic leading-normal">
                        💡 Reordered configurations are securely stored using offline state parameters, remaining intact across login sessions and data imports.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">2. Wage Masking & Discretion Modes</h4>
                    <div className="flex gap-4 items-start bg-[var(--sub-bg)] p-4 rounded-xl border border-[var(--border-color)]">
                      <ShieldCheck size={24} className="text-[var(--pay-green)] shrink-0" />
                      <div>
                        <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Gross Pay Hiding Controls</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                          Want to show off your shift logs to a co-worker without exposing personal wages? Click the <span className="font-semibold text-[var(--pay-green)]">Eye icon</span> in the header block or double-click anywhere inside the paycheck summary card to toggle censorship shielding. It instantly masks all sensitive gross/net pay metrics with clean placeholder symbols (••••••••).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Smart Import */}
              {activeGuideTab === 'import' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Take advantage of our intelligent RosterApps parser to populate entire calendar months automatically, complete with shifts, pay rates, and detailed notes.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">How to Export RosterApps Calendar:</h4>
                    <div className="space-y-3.5 flex flex-col">
                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                        <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm text-xs">1</div>
                        <div>
                          <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Log in to RosterApps Portal</p>
                          <p className="text-[11px] text-[var(--text-muted)] m-0 leading-normal">Access the official Southwest Airlines schedule terminal on Arcos RosterApps.</p>
                        </div>
                      </div>

                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4 mt-2">
                        <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm text-xs">2</div>
                        <div>
                          <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Navigate to Reports</p>
                          <p className="text-[11px] text-[var(--text-muted)] m-0 leading-normal">Click on the top-level <span className="font-semibold text-[var(--swa-blue)]">REPORTS</span> tab on the navigation bar, and select <span className="font-bold">Month Calendar</span>.</p>
                        </div>
                      </div>

                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4 mt-2">
                        <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm text-xs">3</div>
                        <div>
                          <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Select XLS / CSV Excel Format</p>
                          <p className="text-[11px] text-[var(--text-muted)] m-0 leading-normal">Choose the Month you want to track, and set the format parameter to <span className="text-[var(--pay-green)] font-bold">Excel (XLSX / CSV)</span> instead of PDF.</p>
                        </div>
                      </div>

                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4 mt-2">
                        <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-yellow)] shrink-0 shadow-sm text-xs">4</div>
                        <div>
                          <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Smart Import & Parse</p>
                          <p className="text-[11px] text-[var(--text-muted)] m-0 leading-normal">Drag and drop the sheet into our Smart Import section. The tool translates schedule columns, double time rules, custom midnight rotations, and annotations.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Attendance */}
              {activeGuideTab === 'attendance' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Attendance points are monitored utilizing your configured rolling period (default 12-month). You can customize this period under the Op Rules tab. Any accrued absence point will fall off on its precise anniversary date.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">1. Points & Warning Drop-offs</h4>
                    <div className="space-y-3">
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed m-0">
                        The dashboard actively displays accurate point tallies and computes countdowns for subsequent drop-offs:
                      </p>
                      <ul className="space-y-2.5 pl-4">
                        <li className="text-[11px] text-[var(--text-muted)] leading-normal list-disc">
                          <span className="font-bold text-[var(--text-main)]">Tardies & No-Shows:</span> Triggers fractional point increases. These points are highlighted in red bordered icons directly on the calendar interface.
                        </li>
                        <li className="text-[11px] text-[var(--text-muted)] leading-normal list-disc">
                          <span className="font-bold text-[var(--text-main)]">Conversion Protections:</span> Tardy periods can often be partially offset by using available accrued PTO to secure pay and reduce points depending on contract setups.
                        </li>
                        <li className="text-[11px] text-[var(--text-muted)] leading-normal list-disc">
                          <span className="font-bold text-[var(--text-main)]">Rolling Timer Audits:</span> Click the "Status Levels" summary card, or check your upcoming drop date counter to know the exact days left before your points decrement.
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-[var(--sub-bg)] p-4 rounded-xl border border-[var(--border-color)]">
                    <p className="font-bold text-xs m-0 text-[var(--swa-blue)] uppercase tracking-wider mb-2">Unscheduled Paid Time Off (UNPTO)</p>
                    <p className="text-[11px] text-[var(--text-muted)] leading-normal m-0">
                      When standard accrued vacation pools are exhausted, unscheduled sick days are processed as <span className="text-[var(--swa-red)] font-semibold">UNPTO</span>, alerting you on calculated attendance levels and converting wages to unpaid ratios unless supported by FMLA medical certifications.
                    </p>
                  </div>
                </div>
              )}

              
              
              {/* Tab 6: Rules */}
              {activeGuideTab === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Configure company-specific attendance and pay rules below. These rules are versioned by effective date so past calculations stay intact.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-2">
                      <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider m-0">Rule Versions</h4>
                      <button 
                        onClick={() => {
                          const id = Date.now().toString();
                          const today = new Date().toISOString().split('T')[0];
                          const newRule = { id, effectiveDate: today, rollingPeriodMonths: '12', dtThresholdTotalHrs: '12', dtThresholdOtHrs: '8' };
                          props.updateSettings({ rules: [...(props.settings.rules || []), newRule] });
                        }}
                        className="bg-[var(--swa-blue)] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors shadow-md"
                      >
                        + Add Rule Version
                      </button>
                    </div>

                    {(props.settings.rules || []).length === 0 && (
                      <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm space-y-3 relative">
                         <div className="absolute -top-2.5 -right-2.5 bg-gray-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                            Default (System)
                          </div>
                          <p className="text-xs text-[var(--text-muted)] italic m-0">Currently using standard defaults. Add a version to change these parameters.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                            <div className="bg-[var(--sub-bg)] p-2 rounded-lg border border-[var(--border-color)]">
                               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Rolling Attendance Period</p>
                               <p className="text-xs font-semibold m-0">12 Months</p>
                            </div>
                            <div className="bg-[var(--sub-bg)] p-2 rounded-lg border border-[var(--border-color)]">
                               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">DT After Total Hrs</p>
                               <p className="text-xs font-semibold m-0">12 Hours</p>
                            </div>
                            <div className="bg-[var(--sub-bg)] p-2 rounded-lg border border-[var(--border-color)]">
                               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">DT After OT Hrs</p>
                               <p className="text-xs font-semibold m-0">8 Hours</p>
                            </div>
                          </div>
                      </div>
                    )}

                    {(props.settings.rules || []).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((rule, idx) => (
                      <div key={rule.id} className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm space-y-3 relative group">
                        {idx === 0 && (
                          <div className="absolute -top-2.5 -right-2.5 bg-green-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                            Latest
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Effective Date</label>
                            <input 
                              type="date"
                              value={rule.effectiveDate}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], effectiveDate: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Rolling Period (Months)</label>
                            <input 
                              type="number"
                              value={rule.rollingPeriodMonths}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], rollingPeriodMonths: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 mb-0 leading-tight">Controls when absence points drop off.</p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DT After Total Hrs</label>
                            <input 
                              type="number"
                              value={rule.dtThresholdTotalHrs}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], dtThresholdTotalHrs: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 mb-0 leading-tight">Hours worked in a day before double-time (DT) kicks in.</p>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DT After OT Hrs</label>
                            <input 
                              type="number"
                              value={rule.dtThresholdOtHrs}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], dtThresholdOtHrs: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 mb-0 leading-tight">Overtime hours worked before upgrading to DT.</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            const newRules = (props.settings.rules || []).filter(r => r.id !== rule.id);
                            props.updateSettings({ rules: newRules });
                          }}
                          className="mt-2 text-[var(--swa-red)] hover:text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer"
                        >
                          <Trash2 size={12} /> Delete Version
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 5: Pay & FMLA */}
              {activeGuideTab === 'payFmla' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Conduct accurate salary audits of gross wages, cumulative overtime, premiums, and continuous FMLA cases.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">1. Payday Audits & Premium Lists</h4>
                    <div className="space-y-3 font-medium">
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed m-0">
                        Paydays fall on the **5th and 20th** of each month. Click any of these days on the calendar grid to audit that specific pay period:
                      </p>
                      
                      <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)]">
                        <button className="flex w-full justify-between items-center text-xs font-black uppercase text-[var(--swa-blue)] tracking-widest mb-2 cursor-default">
                          <span>Total Additional Compensation</span>
                          <span className="text-[10px] text-[var(--pay-green)] font-bold">Projected Premium List</span>
                        </button>
                        <p className="text-[11px] text-[var(--text-muted)] leading-normal m-4-0">
                          Clicking this header inside any paycheck detail modal lets you expand a breakdown listing premium allocations:
                        </p>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] text-[var(--text-muted)]">
                          <div className="p-1.5 bg-[var(--card-bg)] rounded border border-[var(--border-color)] font-medium">• Overtime (1.5x) hours</div>
                          <div className="p-1.5 bg-[var(--card-bg)] rounded border border-[var(--border-color)] font-medium">• Double Time (2.0x) hours</div>
                          <div className="p-1.5 bg-[var(--card-bg)] rounded border border-[var(--border-color)] font-medium">• Midnight Differential payments</div>
                          <div className="p-1.5 bg-[var(--card-bg)] rounded border border-[var(--border-color)] font-medium">• Regular Holiday worked rates</div>
                          <div className="p-1.5 bg-[var(--card-bg)] rounded border border-[var(--border-color)] font-medium">• Custom STI Bonus targets</div>
                          <div className="p-1.5 bg-[var(--card-bg)] rounded border border-[var(--border-color)] font-medium">• Seniority pay adjustments</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider border-b border-[var(--border-color)] pb-1">2. FMLA Case Case-Tracking & Frequency Rules</h4>
                    <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-3">
                      <Clock size={24} className="text-[var(--swa-yellow)] shrink-0" />
                      <div>
                        <p className="font-bold text-xs m-0 text-[var(--text-main)] uppercase tracking-wide">Rolling FMLA Allowances</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1 mb-0 leading-normal">
                          Manage FMLA cases securely from Settings (specifying FMLA hourly limits and case numbers). Upon logging FMLA hours, the applet continuously tracks your configured rolling usage. Under SWA rules, if FMLA frequencies exceed allocated monthly caps, excess periods are automatically flagged for UNPTO conversions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Disclaimer Section */}
              <section className="bg-[var(--swa-red)]/5 p-5 rounded-2xl border border-[var(--swa-red)]/20">
                <h4 className="text-[var(--swa-red)] font-black uppercase tracking-wider text-xs flex items-center gap-2 mb-2">
                  <AlertCircle size={16} />
                  Disclaimer
                </h4>
                <p className="text-[9px] leading-relaxed text-[var(--text-muted)] font-medium italic">
                  Use at your own risk. You are solely responsible for keeping track of your own balances and updating your schedules accurately on this app. This tool is for estimation and tracking purposes only and is not an official company record.
                </p>
              </section>
            </div>

            <div className="p-6 bg-[var(--card-bg)] border-t border-[var(--border-color)] sticky bottom-0">
              <button 
                className="w-full py-4 bg-[var(--swa-blue)] text-white font-black rounded-2xl text-xs uppercase tracking-[0.2em] transition-all hover:opacity-90 hover:shadow-xl active:scale-[0.98] shadow-lg shadow-[var(--swa-blue)]/20 cursor-pointer" 
                onClick={() => closeModal('userGuide')}
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Instructions Modal */}
      {modalsState.importInstructions && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('importInstructions'); }}>
          <div className="modal-box max-w-[500px] p-0 rounded-3xl">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--card-bg)]">
              <div className="flex items-center gap-3">
                <div className="bg-[var(--pay-green)]/10 p-2 rounded-xl text-[var(--pay-green)]">
                  <HelpCircle size={20} />
                </div>
                <h3 className="text-lg font-black text-[var(--swa-blue)] m-0 uppercase tracking-tight">RosterApps Import</h3>
              </div>
              <button 
                onClick={() => closeModal('importInstructions')}
                className="p-2 hover:bg-[var(--hover-bg)] rounded-xl transition-colors text-[var(--text-muted)]"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-[var(--text-main)] bg-[var(--card-bg)]">
              <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm">1</div>
                <div>
                  <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Log in to RosterApps</p>
                  <p className="text-xs text-[var(--text-muted)]">Access your account at the official RosterApps portal.</p>
                  <a 
                    href="https://rosterapps.arcos-inc.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[var(--swa-blue)] font-black text-[10px] hover:underline uppercase tracking-wider"
                  >
                    <ExternalLink size={10} />
                    Go to RosterApps
                  </a>
                </div>
              </div>

              <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm">2</div>
                <div>
                  <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Navigate to Reports</p>
                  <p className="text-xs text-[var(--text-muted)]">Click on the <span className="text-[var(--swa-blue)] font-black">REPORTS</span> tab in the top navigation bar.</p>
                </div>
              </div>

              <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm">3</div>
                <div>
                  <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Select "Month Calendar"</p>
                  <p className="text-xs text-[var(--text-muted)]">From the list of reports, choose <span className="font-black">Month Calendar</span>.</p>
                </div>
              </div>

              <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm">4</div>
                <div>
                  <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Configure Report</p>
                  <ul className="space-y-1 mt-2">
                    <li className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <div className="w-1 h-1 rounded-full bg-[var(--border-color)]" />
                      Select the <span className="font-black text-[var(--text-main)]">Month</span> you want to import.
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <div className="w-1 h-1 rounded-full bg-[var(--border-color)]" />
                      Set Report Format to <span className="text-[var(--pay-green)] font-black">EXCEL</span>.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-blue)] shrink-0 shadow-sm">5</div>
                <div>
                  <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Generate & Save</p>
                  <p className="text-xs text-[var(--text-muted)]">Click <span className="bg-[var(--swa-blue)] text-white px-2 py-0.5 rounded text-[10px] font-bold">Show Report</span>. Save the downloaded file.</p>
                </div>
              </div>

              <div className="bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)] flex gap-4">
                <div className="bg-[var(--card-bg)] w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center font-black text-[var(--swa-yellow)] shrink-0 shadow-sm">6</div>
                <div>
                  <p className="font-black text-xs text-[var(--text-main)] mb-1 uppercase tracking-wider">Import Here</p>
                  <p className="text-xs text-[var(--text-muted)]">Click the <span className="font-black">Smart Import</span> button below and select the file you just saved.</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-[var(--sub-bg)] border-t border-[var(--border-color)] flex gap-3">
              <button 
                className="flex-1 py-3 bg-[var(--hover-bg)] text-[var(--text-main)] font-black rounded-2xl text-xs uppercase tracking-widest transition-all hover:opacity-80 active:scale-[0.98]" 
                onClick={() => { closeModal('importInstructions'); openModal('userGuide'); }}
              >
                Back
              </button>
              <button 
                className="flex-1 py-3 bg-[var(--btn-dark)] text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all hover:opacity-90 hover:shadow-lg active:scale-[0.98]" 
                onClick={() => closeModal('importInstructions')}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PTO Correction Modal */}
      {modalsState.correction && (
        <div className="modal flex" onClick={(e) => { if (e.target === e.currentTarget) closeModal('correction'); }}>
          <div className="modal-box max-w-[400px] bg-[var(--card-bg)] border border-[var(--border-color)]">
            <div className="flex justify-between items-center mb-5">
              <div className="flex flex-col">
                <h3 className="m-0 text-xl font-black text-[var(--swa-blue)] tracking-tighter uppercase italic">PTO Adjustments</h3>
                <p className="m-0 text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-1">Correction & Accrual Overrides</p>
              </div>
              <div 
                className="w-8 h-8 rounded-full border border-[var(--border-color)] flex items-center justify-center cursor-pointer hover:bg-black/5"
                onClick={() => closeModal('correction')}
              >
                <X size={16} />
              </div>
            </div>

            <div className="space-y-5">
              {/* SECTION 1: BALANCE CORRECTION */}
              <div className="border border-[var(--border-color)]/60 rounded-xl p-3.5 space-y-3 bg-black/[0.01]">
                <div className="flex items-center gap-1.5 border-b border-[var(--border-color)]/40 pb-2 mb-1">
                  <TrendingUp size={14} className="text-[var(--swa-blue)]" />
                  <span className="text-xs font-black uppercase text-[var(--swa-blue)] tracking-tight">Manual Balance Override</span>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Effective Start Date</label>
                  <input 
                    type="date" 
                    value={corrDate} 
                    onChange={(e) => setCorrDate(e.target.value)}
                    className="w-full p-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] box-border"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5">New PTO Balance (Hours)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={corrPto} 
                      onChange={(e) => setCorrPto(e.target.value)}
                      step="any"
                      placeholder="e.g. 154.5"
                      className="w-full p-2.5 pl-8 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-sm font-black text-[var(--text-main)] box-border"
                    />
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={12} />
                  </div>
                </div>
              </div>

              {/* SECTION 2: ACCRUAL OVERRIDE */}
              <div className="border border-[var(--border-color)]/60 rounded-xl p-3.5 space-y-3 bg-black/[0.01]">
                <div className="flex items-center gap-1.5 border-b border-[var(--border-color)]/40 pb-2 mb-1">
                  <Percent size={14} className="text-[var(--swa-blue)]" />
                  <span className="text-xs font-black uppercase text-[var(--swa-blue)] tracking-tight">Custom Accrual Settings</span>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Accrual Change Date</label>
                  <input 
                    type="date" 
                    value={accDate} 
                    onChange={(e) => setAccDate(e.target.value)}
                    className="w-full p-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] box-border"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Rate (Hrs / Mo)</label>
                    <input 
                      type="number" 
                      value={accRate} 
                      onChange={(e) => setAccRate(e.target.value)}
                      step="any"
                      placeholder="e.g. 15.0"
                      className="w-full p-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] box-border"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Max Cap (Hrs)</label>
                    <input 
                      type="number" 
                      value={accCap} 
                      onChange={(e) => setAccCap(e.target.value)}
                      step="any"
                      placeholder="e.g. 240.0"
                      className="w-full p-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] box-border"
                    />
                  </div>
                </div>
              </div>

              {/* ACTIONS: Save Both / Clear All */}
              <div className="flex gap-2">
                <button 
                  className="flex-1 py-3 bg-[var(--btn-dark)] text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all hover:opacity-90 hover:shadow-lg active:scale-[0.98]" 
                  onClick={() => {
                    updateSettings({ 
                      correctionDate: corrDate, 
                      correctionStartPto: corrPto,
                      accrualChangeDate: accDate,
                      customAccrualRate: accRate,
                      customAccrualCap: accCap
                    });
                    closeModal('correction');
                    showToast("PTO adjustments saved successfully.", 'success');
                  }}
                >
                  Save Adjustments
                </button>
                <button 
                  className="px-4 py-3 bg-[var(--swa-red)]/10 text-[var(--swa-red)] font-black rounded-xl text-[10px] uppercase tracking-widest transition-all hover:bg-[var(--swa-red)]/20"
                  onClick={() => {
                    setCorrDate('');
                    setCorrPto('0');
                    setAccDate('');
                    setAccRate('');
                    setAccCap('');
                    updateSettings({ 
                      correctionDate: '', 
                      correctionStartPto: '0',
                      accrualChangeDate: '',
                      customAccrualRate: '',
                      customAccrualCap: ''
                    });
                    closeModal('correction');
                    showToast("All overrides cleared.", 'warning');
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Pay History Modal */}
      {modalsState.payHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4" onClick={(e) => { if(e.target === e.currentTarget) closeModal('payHistory'); }}>
          <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--sub-bg)] flex justify-between items-center">
              <h3 className="text-lg font-black text-[var(--swa-blue)] m-0 tracking-tight flex items-center gap-2">
                <TrendingUp size={18} />
                Pay Change History
              </h3>
              <button onClick={() => closeModal('payHistory')} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-xl p-4 mb-6">
                <h4 className="text-sm font-bold mb-3 uppercase tracking-wider text-[var(--text-muted)]">{editingPayEventId ? 'Edit Pay Change' : 'Log a Pay Change'}</h4>
                <div className="grid grid-cols-[1fr,1.5fr,1fr,1fr,1fr,2fr,auto] gap-3 items-end">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Date</label>
                    <input 
                      type="date" 
                      className="w-full p-2 border border-[var(--border-color)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 focus:outline-none transition-all"
                      value={newPayEvent.date}
                      onChange={(e) => setNewPayEvent({...newPayEvent, date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Type</label>
                    <select 
                      className="w-full p-2 border border-[var(--border-color)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 focus:outline-none transition-all"
                      value={newPayEvent.type}
                      onChange={(e) => setNewPayEvent({...newPayEvent, type: e.target.value})}
                    >
                      <option value="Raise">Annual Raise</option>
                      <option value="Promotion">Promotion</option>
                      <option value="Adjustment">Market Adjustment</option>
                      <option value="Base">Base Salary</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Old Salary</label>
                    <input 
                      type="text" 
                      placeholder="$"
                      className="w-full p-2 border border-[var(--border-color)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 focus:outline-none transition-all"
                      value={newPayEvent.oldSalary}
                      onChange={(e) => setNewPayEvent({...newPayEvent, oldSalary: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">New Salary</label>
                    <input 
                      type="text" 
                      placeholder="$"
                      className="w-full p-2 border border-[var(--border-color)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 focus:outline-none transition-all"
                      value={newPayEvent.newSalary}
                      onChange={(e) => setNewPayEvent({...newPayEvent, newSalary: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Level</label>
                    <select 
                      className="w-full p-2 border border-[var(--border-color)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 focus:outline-none transition-all"
                      value={newPayEvent.level || ''}
                      onChange={(e) => setNewPayEvent({...newPayEvent, level: e.target.value})}
                    >
                      <option value="">-</option>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                      <option value="P3">P3</option>
                      <option value="P4">P4</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Notes</label>
                    <input 
                      type="text" 
                      placeholder="Optional"
                      className="w-full p-2 border border-[var(--border-color)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:ring-2 focus:ring-[var(--swa-blue)]/20 focus:outline-none transition-all"
                      value={newPayEvent.note}
                      onChange={(e) => setNewPayEvent({...newPayEvent, note: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-2">
                    {editingPayEventId && (
                      <button 
                        onClick={cancelEditPayHistoryEvent}
                        className="h-[34px] px-3 bg-[var(--sub-bg)] text-[var(--text-main)] border border-[var(--border-color)] font-black text-[10px] uppercase tracking-wider rounded-lg hover:bg-[var(--border-color)] transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    <button 
                      onClick={addPayHistoryEvent}
                      className="h-[34px] px-4 bg-[var(--swa-blue)] text-white font-black text-[10px] uppercase tracking-wider rounded-lg hover:bg-opacity-90 transition-colors"
                    >
                      {editingPayEventId ? 'Save' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--card-bg)]">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-[var(--sub-bg)] text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <th className="p-3 border-b border-[var(--border-color)]">Date</th>
                      <th className="p-3 border-b border-[var(--border-color)]">Type</th>
                      <th className="p-3 border-b border-[var(--border-color)] text-right">Old Salary</th>
                      <th className="p-3 border-b border-[var(--border-color)] text-right">New Salary</th>
                      <th className="p-3 border-b border-[var(--border-color)] text-right">Diff</th>
                      <th className="p-3 border-b border-[var(--border-color)] text-center">Level</th>
                      <th className="p-3 border-b border-[var(--border-color)]">Notes</th>
                      <th className="p-3 border-b border-[var(--border-color)] w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!settings.payHistory || settings.payHistory.length === 0) ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-[var(--text-muted)] italic text-xs">No pay history records found.</td>
                      </tr>
                    ) : (
                      [...settings.payHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(event => {
                        const oldNum = parseFloat((event.oldSalary || '').replace(/[^0-9.-]+/g, ""));
                        const newNum = parseFloat((event.newSalary || '').replace(/[^0-9.-]+/g, ""));
                        const diff = (!isNaN(oldNum) && !isNaN(newNum)) ? newNum - oldNum : null;
                        const percent = (diff !== null && oldNum > 0) ? (diff / oldNum) * 100 : null;

                        return (
                        <tr key={event.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--sub-bg)] transition-colors">
                          <td className="p-3 font-bold">{new Date(event.date + "T00:00:00").toLocaleDateString()}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              event.type === 'Promotion' ? 'bg-[var(--swa-blue)]/10 text-[var(--swa-blue)]' : 
                              event.type === 'Adjustment' ? 'bg-[var(--swa-red)]/10 text-[var(--swa-red)]' : 
                              event.type === 'Raise' ? 'bg-[var(--pay-green)]/10 text-[var(--pay-green)]' : 
                              'bg-[var(--text-muted)]/10 text-[var(--text-main)]'
                            }`}>
                              {event.type}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-right text-[var(--text-muted)]">{event.oldSalary || '-'}</td>
                          <td className="p-3 font-mono font-bold text-right text-[var(--text-main)]">{event.newSalary}</td>
                          <td className="p-3 font-mono text-right text-xs">
                            {diff !== null ? (
                              <span className={diff > 0 ? 'text-[var(--pay-green)] font-bold flex flex-col items-end' : diff < 0 ? 'text-[var(--swa-red)] font-bold flex flex-col items-end' : 'text-[var(--text-muted)] flex flex-col items-end'}>
                                <span>{diff > 0 ? '+' : diff < 0 ? '-' : ''}${Math.abs(diff).toFixed(2).replace(/\.00$/, '')}</span>
                                {percent !== null && <span className="text-[10px] opacity-80 mt-0.5">({percent > 0 ? '+' : ''}{percent.toFixed(1)}%)</span>}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center text-xs font-bold text-[var(--swa-blue)]">{event.level || '-'}</td>
                          <td className="p-3 text-xs text-[var(--text-muted)]">{event.note}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => startEditPayHistoryEvent(event)}
                                className="text-[var(--text-muted)] hover:text-[var(--swa-blue)] transition-colors"
                                title="Edit Record"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => removePayHistoryEvent(event.id)}
                                className="text-[var(--text-muted)] hover:text-[var(--swa-red)] transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalsState.ptoWarning && (
        <div className="modal flex" onClick={(e) => { if(e.target === e.currentTarget) closeModal('ptoWarning'); }}>
          <div className="modal-box max-w-[350px] bg-[var(--card-bg)] border border-[var(--border-color)]">
            <div className="flex flex-col items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-[var(--swa-red)]/10 flex items-center justify-center mb-3 text-[var(--swa-red)]">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-center text-[var(--swa-red)] mt-0 font-black uppercase tracking-widest text-lg">Insufficient PTO</h3>
            </div>
            
            <p className="text-center text-[var(--text-main)] text-sm leading-relaxed mb-6 font-medium">
              {ptoWarningMessage}
            </p>
            
            <button 
              className="w-full py-3 bg-[var(--btn-dark)] text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all hover:opacity-90 hover:shadow-lg active:scale-[0.98]" 
              onClick={() => closeModal('ptoWarning')}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

    </>
  );
};
