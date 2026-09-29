import React, { useMemo, useState } from 'react';
import { LogEntry, LogsState, FmlaCase } from '../types';
import { 
  FileText, Briefcase, Sun, Moon, Plane, Gift, 
  AlertTriangle, Activity, Clock, Coins, Sunset,
  Lock, Unlock, Trash2, LayoutGrid, ListFilter
} from 'lucide-react';
import { getBlockLabel, getBlockTooltip, getBlockClass, getBlockStartHour, calculatePay, calculate, getOtDtSplit, formatPto } from '../utils/calculations';
import { swaHolidays } from '../utils/constants';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarProps {
  viewMonth: number;
  viewYear: number;
  isYearView: boolean;
  isMobile?: boolean;
  mobileCalendarView?: 'grid' | 'list';
  setMobileCalendarView?: (view: 'grid' | 'list') => void;
  direction: number;
  changeMonth: (n: number) => void;
  logs: LogsState;
  fmlaCases: FmlaCase[];
  hireDate: string;
  midCounts: any;
  settings: any;
  openModal: (ds: string) => void;
  openEditBlock: (ds: string, idx: number) => void;
  removeEntry: (ds: string, idx: number) => void;
  showPaycheckAudit: (y: number, m: number, day: number) => void;
  setViewMonth: (m: number) => void;
  setIsYearView: (v: boolean) => void;
  isLocked: boolean;
  lockedMonths?: string[];
  toggleLockMonth?: (year: number, month: number) => void;
  triggerClearMonth?: (year: number, month: number) => void;
}

const getBlockIcon = (tCls: string, size: number) => {
  if (tCls.includes('HOL')) return <Gift size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('PTO')) return <Plane size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('AM')) return <Sun size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('PM')) return <Sunset size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('MID')) return <Moon size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('SW1') || tCls.includes('SW2') || tCls.includes('SW3')) return <Clock size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('PROJ') || tCls.includes('WORK')) return <Briefcase size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('WOP') || tCls.includes('UNPTO') || tCls.includes('UNSCHED') || tCls.includes('TARDY') || tCls.includes('NO-SHOW') || tCls.includes('INF')) return <AlertTriangle size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('FMLA') || tCls.includes('MED-')) return <Activity size={size} className="shrink-0 opacity-80" />;
  if (tCls.includes('OT') || tCls.includes('DT')) return <Coins size={size} className="shrink-0 opacity-80" />;
  return null;
};

const getAdditionalTagStyle = (tCls: string): React.CSSProperties => {
  if (tCls.includes('PTO')) return { borderLeft: '4px solid #ffffff', borderRight: '1px solid rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.3)' };
  if (tCls.includes('HOL')) return { border: '2px dashed #ffffff' };
  if (tCls.includes('FMLA') || tCls.includes('MED-')) return { borderLeft: '4px solid var(--swa-yellow)' };
  if (tCls.includes('WOP') || tCls.includes('UNPTO') || tCls.includes('UNSCHED') || tCls.includes('TARDY') || tCls.includes('NO-SHOW') || tCls.includes('INF')) return { border: '2px dotted #ffffff' };
  if (tCls.includes('OT') || tCls.includes('DT')) return { borderTop: '2px solid #ffffff', borderBottom: '2px solid #ffffff' };
  if (tCls.includes('WORK')) return { borderLeft: '3px solid rgba(255,255,255,0.7)', borderRight: '1px solid rgba(0,0,0,0.1)', borderTop: '1px solid rgba(0,0,0,0.1)', borderBottom: '1px solid rgba(0,0,0,0.1)' };
  return {};
};

export const Calendar: React.FC<CalendarProps> = ({
  viewMonth, viewYear, isYearView, isMobile, mobileCalendarView, setMobileCalendarView,
  direction, changeMonth, logs, fmlaCases, hireDate, midCounts, settings,
  openModal, openEditBlock, removeEntry, showPaycheckAudit, setViewMonth, setIsYearView, isLocked,
  lockedMonths = [], toggleLockMonth, triggerClearMonth
}) => {
  const [internalMobileView, setInternalMobileView] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('swa_mobile_calendar_view') as 'grid' | 'list') || 'grid';
    } catch (e) {
      return 'grid';
    }
  });

  const activeMobileView = mobileCalendarView || internalMobileView;
  const updateMobileView = (v: 'grid' | 'list') => {
    if (setMobileCalendarView) setMobileCalendarView(v);
    setInternalMobileView(v);
    try { localStorage.setItem('swa_mobile_calendar_view', v); } catch (e) {}
  };

  const hireMD = hireDate ? hireDate.substring(5) : null;
  const today = new Date();

  const currentMonthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const isCurrentMonthLocked = isLocked || lockedMonths.includes(currentMonthKey);

  const fallOffDates = useMemo(() => {
    const dates: Record<string, string[]> = {};
    
    // Process infractions
    for (const ds in logs) {
      if (!Array.isArray(logs[ds])) continue;
      logs[ds].forEach(e => {
        if (['TARDY', 'NO-SHOW', 'UNPAID-UNSCHED', 'UNPTO'].includes(e.type)) {
          const d = new Date(ds + "T00:00:00");
          d.setFullYear(d.getFullYear() + 1);
          const fallOffDs = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (!dates[fallOffDs]) dates[fallOffDs] = [];
          dates[fallOffDs].push(`${e.type} Falls Off`);
        }
      });
    }

    // Process performance letters
    let perfLetters: any[] = [];
    try {
      try { perfLetters = JSON.parse(settings.perfLetters || '[]'); } catch(e) { perfLetters = []; }
    } catch (e) {}
    
    perfLetters.forEach(letter => {
      if (letter.date) {
        const d = new Date(letter.date + "T00:00:00");
        d.setFullYear(d.getFullYear() + 1);
        const fallOffDs = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dates[fallOffDs]) dates[fallOffDs] = [];
        const levelName = letter.level === 3 ? "FLOW" : letter.level === 2 ? "LOW" : letter.level === 1 ? "LOE" : `Level ${letter.level}`;
        dates[fallOffDs].push(`${levelName} Falls Off`);
      }
    });

    return dates;
  }, [logs, settings.perfLetters]);

  const variants = {
    enter: (direction: number) => {
      return {
        x: direction > 0 ? 500 : -500,
        opacity: 0
      };
    },
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => {
      return {
        zIndex: 0,
        x: direction < 0 ? 500 : -500,
        opacity: 0
      };
    }
  };

  const renderTag = (e: LogEntry, ds: string, origIdx: number) => {
    const fullLabel = getBlockLabel(e, logs[ds], false, settings, logs, ds);
    const tooltip = getBlockTooltip(e, fmlaCases, logs[ds], settings, logs, ds);
    
    let tCls = getBlockClass(e, logs[ds], settings, logs, ds);

    const tagClass = `tag tag-${tCls}`;

    return (
      <div key={origIdx} className={tooltip ? "tooltip w-full flex justify-center" : "w-full flex justify-center"}>
        <div 
          className={tagClass} 
          style={getAdditionalTagStyle(tCls)}
          onClick={(ev) => { 
            const dStr = new Date(ds + "T00:00:00");
            const mKey = `${dStr.getFullYear()}-${String(dStr.getMonth()+1).padStart(2,'0')}`;
            if (isLocked || lockedMonths.includes(mKey)) return;
            ev.stopPropagation(); 
            openEditBlock(ds, origIdx); 
          }}
        >
          <div className="flex items-center gap-1 overflow-hidden">
            {getBlockIcon(tCls, 10)}
            <span className="truncate">{fullLabel}</span>
            {e.note && <FileText size={10} className="shrink-0 opacity-80" />}
          </div>
          {!isLocked && (
            <div 
              className="puck-del" 
              onClick={(ev) => { ev.stopPropagation(); removeEntry(ds, origIdx); }} 
              title="Delete Puck"
            >
              ×
            </div>
          )}
        </div>
        {tooltip && <span className="tooltiptext text-[10px] max-w-[200px]">{tooltip}</span>}
      </div>
    );
  };

  if (isYearView) {
    return (
      <AnimatePresence mode="wait">
        <motion.div 
          key={`year-${viewYear}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-[30px] py-[15px] items-stretch"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const currentMonthStats = calculate(viewYear, i, logs, midCounts, settings, true);
            const daysInMonth = new Date(viewYear, i + 1, 0).getDate();
            const firstDay = new Date(viewYear, i, 1).getDay();
            
            let ptoUsedThisMonth = 0;
            let holUsedThisMonth = 0;

            return (
              <div key={i} className="bg-[var(--card-bg)] rounded-2xl shadow-sm border border-[var(--border-color)] flex flex-col box-border h-full relative hover:shadow-md transition-shadow hover:z-40">
                <div className="bg-[var(--sub-bg)] flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] rounded-t-2xl shrink-0">
                  <div 
                    className="text-[var(--swa-blue)] font-black text-sm uppercase tracking-widest cursor-pointer transition-colors hover:opacity-80"
                    onClick={() => { setIsYearView(false); setViewMonth(i); }}
                    title={`Jump to ${new Date(viewYear, i).toLocaleString('default', { month: 'long' })}`}
                  >
                    {new Date(viewYear, i).toLocaleString('default', { month: 'long' })}
                  </div>
                  
                  {/* Lock/Unlock and Clear Month Controls */}
                  <div className="flex items-center gap-2">
                    {toggleLockMonth && (
                      <button
                        type="button"
                        onClick={() => toggleLockMonth(viewYear, i)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          lockedMonths.includes(`${viewYear}-${String(i + 1).padStart(2, '0')}`)
                            ? 'bg-[var(--ra-gold)]/10 border-[var(--ra-gold)]/30 text-[var(--ra-gold)] hover:bg-[var(--ra-gold)]/20'
                            : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)]'
                        }`}
                        title={lockedMonths.includes(`${viewYear}-${String(i + 1).padStart(2, '0')}`) ? 'Month is locked. Click to unlock.' : 'Month is unlocked. Click to lock.'}
                      >
                        {lockedMonths.includes(`${viewYear}-${String(i + 1).padStart(2, '0')}`) ? (
                          <Lock size={12} className="stroke-[2.5px]" />
                        ) : (
                          <Unlock size={12} className="stroke-[2px]" />
                        )}
                      </button>
                    )}

                    {triggerClearMonth && (
                      <button
                        type="button"
                        onClick={() => triggerClearMonth(viewYear, i)}
                        disabled={isLocked || lockedMonths.includes(`${viewYear}-${String(i + 1).padStart(2, '0')}`)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          isLocked || lockedMonths.includes(`${viewYear}-${String(i + 1).padStart(2, '0')}`)
                            ? 'opacity-30 cursor-not-allowed border-transparent text-[var(--text-muted)]'
                            : 'bg-transparent border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/40 cursor-pointer'
                        }`}
                        title={isLocked || lockedMonths.includes(`${viewYear}-${String(i + 1).padStart(2, '0')}`) ? 'Locked' : 'Clear Month'}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-7 bg-[var(--card-bg)] border-b border-[var(--border-color)]">
                  {['S','M','T','W','T','F','S'].map((d, idx) => (
                    <div key={idx} className="text-center text-[9px] font-black py-1.5 text-[var(--text-muted)] uppercase">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 auto-rows-[minmax(60px,auto)] bg-[var(--border-color)] gap-[1px] flex-[1_0_auto]">
                  {Array.from({ length: firstDay }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="bg-[var(--sub-bg)] cursor-default flex flex-col items-center justify-start pb-1 box-border min-w-0"></div>
                  ))}
                  
                  {Array.from({ length: daysInMonth }).map((_, dIdx) => {
                    const d = dIdx + 1;
                    const ds = `${viewYear}-${String(i+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const isToday = (viewYear === today.getFullYear() && i === today.getMonth() && d === today.getDate());
                    const isAnni = hireMD && ds.substring(5) === hireMD;
                    
                    let payMarker = null;
                    if (d === 5 || d === 20) {
                      const payResult = calculatePay(viewYear, i, d, logs, midCounts, settings);
                      const netStr = isNaN(payResult.estimatedNet) || payResult.estimatedNet === 0 ? '' : payResult.estimatedNet.toLocaleString('en-US', { maximumFractionDigits: 0 });
                      if (netStr !== '') {
                        const tooltipLines = [
                          `Gross Pay: $${payResult.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                          `Base: $${payResult.basePay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ];
                        if ((payResult.ot + payResult.dt) > 0) tooltipLines.push(`OT/DT: $${(payResult.ot + payResult.dt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                        if (payResult.holPay > 0) tooltipLines.push(`Hol: $${payResult.holPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                        if (payResult.midAmt > 0) tooltipLines.push(`Mid: $${payResult.midAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                        if (payResult.totalLoss > 0) tooltipLines.push(`Loss: -$${payResult.totalLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                        if (payResult.k401Ded > 0 || payResult.insuranceAmt > 0) {
                          tooltipLines.push(`Deductions: -$${(payResult.k401Ded + payResult.insuranceAmt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                          tooltipLines.push(`Est. Net: $${payResult.estimatedNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                        }
                        const tooltipText = tooltipLines.join('\n');
                        payMarker = (
                          <div
                            className="pay-marker !text-[7px] !px-1 !py-0 !bottom-0.5 !right-0.5"
                            title={tooltipText}
                            onClick={(ev) => { ev.stopPropagation(); showPaycheckAudit(viewYear, i, d); }}
                          >
                            ${netStr}
                          </div>
                        );
                      }
                    }

                    let cellCls = 'bg-[var(--card-bg)] flex flex-col cursor-pointer transition-colors items-center justify-start pb-1 box-border min-w-0 hover:bg-[var(--hover-bg)]';
                    if (swaHolidays[ds]) cellCls += ' !bg-[var(--hol-bg)]';
                    if (isToday) cellCls += ' !bg-[var(--swa-blue)]/10 ring-2 ring-inset ring-[var(--swa-blue)] z-10';
                    if (isAnni) cellCls += ' !bg-[var(--anni-bg)] ring-2 ring-inset ring-[var(--swa-yellow)] z-10';

                    let valHtml = null;
                    let daySummary = "";
                    const monthKey = `${viewYear}-${String(i+1).padStart(2,'0')}`;
                    const isMonthLocked = isLocked || lockedMonths.includes(monthKey);

                    if (logs[ds] && Array.isArray(logs[ds])) {
                      const sortedLogs = [...logs[ds]].map((e, idx) => ({...e, _origIdx: idx}));
                      sortedLogs.sort((a,b) => getBlockStartHour(a) - getBlockStartHour(b));
                      
                      let workedHrs = 0;
                      let offHrs = 0;
                      let otHrs = 0;
                      let dtHrs = 0;
                      let wopHrs = 0;
                      let infHrs = 0;

                      sortedLogs.forEach(e => {
                        if (!e.type) return;
                        const h = parseFloat(e.hrs as any) || 0;
                        if (e.type.startsWith('WORK-')) workedHrs += h;
                        if (['PTO', 'FMLA-P', 'FML-UNP', 'MED-P', 'MED-UNP', 'MED-P-PTO', 'HOL'].includes(e.type)) offHrs += h;
                        if (e.type === 'WOP') wopHrs += h;
                        if (['UNPTO', 'UNPAID-UNSCHED', 'TARDY', 'NO-SHOW'].includes(e.type)) {
                          if (['TARDY', 'NO-SHOW'].includes(e.type)) {
                            const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : h;
                            infHrs += unp;
                          } else {
                            infHrs += h;
                          }
                        }
                        if (e.type === 'OT') {
                          const { otH, dtH } = getOtDtSplit(e, sortedLogs, settings, logs, ds);
                          otHrs += otH;
                          dtHrs += dtH;
                        }
                        if (e.type === 'DT') {
                          dtHrs += h;
                        }
                      });

                      const summaryParts = [];
                      if (workedHrs > 0) summaryParts.push(`Worked: ${Number(workedHrs.toFixed(2))}h`);
                      if (offHrs > 0) summaryParts.push(`Off: ${Number(offHrs.toFixed(2))}h`);
                      if (wopHrs > 0) summaryParts.push(`WOP: ${Number(wopHrs.toFixed(2))}h`);
                      if (infHrs > 0) summaryParts.push(`Infraction: ${Number(infHrs.toFixed(2))}h`);
                      if (otHrs > 0) summaryParts.push(`OT: ${Number(otHrs.toFixed(2))}h`);
                      if (dtHrs > 0) summaryParts.push(`DT: ${Number(dtHrs.toFixed(2))}h`);
                      
                      const detailedTooltips = sortedLogs.map(e => getBlockTooltip(e, fmlaCases, sortedLogs, settings, logs, ds));
                      daySummary = summaryParts.join(' | ');
                      if (detailedTooltips.length > 0) {
                        daySummary += "\n\n" + detailedTooltips.join("\n---\n");
                      }

                      valHtml = (
                        <div className="flex-[1_1_auto] w-full flex flex-col items-center justify-start gap-[2px] min-w-0 px-1">
                          {sortedLogs.map(e => {
                            if (!e.type) return null;
                            if(['PTO','UNPTO','FMLA-P','MED-P-PTO'].includes(e.type)) ptoUsedThisMonth += (parseFloat(e.hrs as any)||8);
                            if(['HOL'].includes(e.type)) holUsedThisMonth++;
                            
                            let tCls = getBlockClass(e, sortedLogs, settings, logs, ds);

                            return (
                              <div 
                                key={e._origIdx} 
                                className={`tag-${tCls} text-[8px] font-bold px-1 py-[1px] rounded-sm leading-tight truncate max-w-full w-max shadow-sm flex items-center gap-0.5 cursor-pointer hover:brightness-110 active:scale-95 transition-all`} 
                                style={getAdditionalTagStyle(tCls)}
                                onClick={(ev) => { 
                                  if (isMonthLocked) return;
                                  ev.stopPropagation(); 
                                  openEditBlock(ds, e._origIdx); 
                                }}
                              >
                                {getBlockIcon(tCls, 8)}
                                {getBlockLabel(e, sortedLogs, true, settings, logs, ds)}
                                {e.note && <FileText size={8} className="shrink-0 opacity-70" />}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    const fallOffs = fallOffDates[ds];
                    if (fallOffs && fallOffs.length > 0) {
                      cellCls += ' ring-1 ring-inset ring-[var(--swa-orange)]';
                    }

                    return (
                      <div 
                        key={d} 
                        className={`${cellCls} relative group hover:z-50`} 
                        title={isMonthLocked ? "Locked" : "Add a block"} 
                        onClick={() => { if (!isMonthLocked) openModal(ds); }}
                      >
                        <div className={`text-[10px] py-1 w-full text-center ${isToday ? 'text-[var(--swa-blue)]' : 'text-[var(--text-main)]'} font-bold mb-[2px]`}>{d}</div>
                        
                        {swaHolidays[ds] && <div className="sched-hol-banner">{swaHolidays[ds]}</div>}
                        
                        {isAnni && <div className="anni-banner">🎂 Anniversary</div>}

                        {valHtml}
                        {payMarker}
                        {fallOffs && fallOffs.length > 0 && (
                          <div className="text-[8px] font-bold text-[var(--swa-orange)] w-[90%] text-center px-0.5 truncate bg-[var(--swa-orange)]/10 rounded mt-auto mb-1 mx-auto" title={fallOffs.join('\n')}>
                            Fall Off
                          </div>
                        )}
                        {daySummary && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[300px] bg-[var(--tooltip-bg)] text-[var(--tooltip-text)] text-[10px] font-bold rounded-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] pointer-events-none shadow-xl whitespace-pre-wrap border border-[var(--border-color)]">
                            {daySummary}
                            {fallOffs && fallOffs.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/20 text-[var(--swa-orange)]">
                                ⚠️ Fall Offs:
                                {fallOffs.map((fo, i) => <div key={i}>• {fo}</div>)}
                              </div>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--tooltip-bg)]"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="p-3 bg-[var(--card-bg)] border-t border-[var(--border-color)] mt-auto shrink-0">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--swa-blue)]/10 rounded-lg p-2 border border-[var(--swa-blue)]/20">
                      <div className="text-[8px] uppercase font-black text-[var(--swa-blue)] opacity-70 mb-0.5 tracking-wider">Avail PTO <span className="opacity-60">(+{formatPto(currentMonthStats.currentTier.a)})</span></div>
                      <div className={`text-xs font-black ${currentMonthStats.ptoEnd < 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>{formatPto(currentMonthStats.ptoEnd)}</div>
                    </div>
                    <div className="bg-[var(--ra-gold)]/10 rounded-lg p-2 border border-[var(--ra-gold)]/20">
                      <div className="text-[8px] uppercase font-black text-[var(--ra-gold)] opacity-70 mb-0.5 tracking-wider">Avail HOL</div>
                      <div className={`text-xs font-black ${currentMonthStats.holEnd < 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>{(currentMonthStats.holEnd/8).toFixed(0)}</div>
                    </div>
                    <div className="bg-[var(--sub-bg)] rounded-lg p-2 border border-[var(--border-color)]">
                      <div className="text-[8px] uppercase font-black text-[var(--text-muted)] opacity-70 mb-0.5 tracking-wider">PTO Used</div>
                      <div className="text-xs font-black text-[var(--text-main)]">{formatPto(ptoUsedThisMonth)}h</div>
                    </div>
                    <div className="bg-[var(--sub-bg)] rounded-lg p-2 border border-[var(--border-color)]">
                      <div className="text-[8px] uppercase font-black text-[var(--text-muted)] opacity-70 mb-0.5 tracking-wider">HOL Used</div>
                      <div className="text-xs font-black text-[var(--text-main)]">{holUsedThisMonth}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    );
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  if (!isYearView && activeMobileView === 'list') {
    return (
      <div className="bg-transparent shadow-none border-none overflow-hidden pb-6">
        {/* Calendar View Toggle: Month Grid vs Agenda List */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center p-1 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] shadow-xs">
            <button
              type="button"
              onClick={() => updateMobileView('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                (activeMobileView as string) === 'grid'
                  ? 'bg-[var(--swa-blue)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <LayoutGrid size={13} />
              <span>Month Grid</span>
            </button>
            <button
              type="button"
              onClick={() => updateMobileView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                (activeMobileView as string) === 'list'
                  ? 'bg-[var(--swa-blue)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <ListFilter size={13} />
              <span>Agenda List</span>
            </button>
          </div>
          <div className="text-[11px] font-bold text-[var(--text-muted)] hidden sm:block">
            Chronological Agenda View
          </div>
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div 
            key={`${viewYear}-${viewMonth}-mobile-list`}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = Math.abs(offset.x) * velocity.x;
              if (swipe < -10000) {
                changeMonth(1);
              } else if (swipe > 10000) {
                changeMonth(-1);
              }
            }}
            className="flex flex-col bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm"
          >
            {Array.from({ length: daysInMonth }).map((_, dIdx) => {
              const d = dIdx + 1;
              const ds = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const isToday = (viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate());
              const isAnni = hireMD && ds.substring(5) === hireMD;
              const dayOfWeek = new Date(viewYear, viewMonth, d).toLocaleDateString('en-US', { weekday: 'short' });
              const fallOffs = fallOffDates[ds];
              
              let dElCls = 'flex flex-row items-center py-2.5 px-3 border-b border-[var(--border-color)] cursor-pointer transition-colors gap-2 min-h-[52px]';
              
              if (swaHolidays[ds]) dElCls += ' !bg-[var(--hol-bg)]';
              if (isToday) dElCls += ' !bg-[var(--swa-blue)]/10 ring-2 ring-inset ring-[var(--swa-blue)] z-10';
              if (isAnni) dElCls += ' !bg-[var(--anni-bg)]';
              
              if (!isToday && !swaHolidays[ds] && !isAnni) {
                dElCls += ' bg-transparent hover:bg-[var(--hover-bg)]';
              }

              let valHtml = null;
              if (logs[ds] && Array.isArray(logs[ds]) && logs[ds].length > 0) {
                const dayLogs = [...logs[ds]].map((e, idx) => ({...e, _origIdx: idx}));
                dayLogs.sort((a,b) => getBlockStartHour(a) - getBlockStartHour(b));
                
                valHtml = (
                  <div className="flex flex-wrap gap-1 items-center">
                    {dayLogs.map(e => {
                      if(!e.type) return null;
                      const fullLabel = getBlockLabel(e, logs[ds], false, settings, logs, ds);
                      let tCls = getBlockClass(e, logs[ds], settings, logs, ds);
                      
                      return (
                        <div 
                          key={e._origIdx} 
                          className={`tag-${tCls} px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shadow-sm cursor-pointer hover:brightness-110 active:scale-95 transition-all`}
                          style={getAdditionalTagStyle(tCls)}
                          onClick={(ev) => { 
                            if (isCurrentMonthLocked) return;
                            ev.stopPropagation(); 
                            openEditBlock(ds, e._origIdx); 
                          }}
                        >
                          {getBlockIcon(tCls, 11)}
                          <span>{fullLabel}</span>
                          {e.note && <FileText size={10} className="shrink-0 opacity-80" />}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              let payMarker = null;
              if(d === 5 || d === 20) {
                const payResult = calculatePay(viewYear, viewMonth, d, logs, midCounts, settings);
                const netStr = isNaN(payResult.estimatedNet) || payResult.estimatedNet === 0 ? '' : payResult.estimatedNet.toLocaleString('en-US', {maximumFractionDigits: 0});
                if (netStr !== '') {
                  const tooltipLines = [
                    `Gross Pay: $${payResult.net.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`,
                    `Base: $${payResult.basePay.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`
                  ];
                  if ((payResult.ot+payResult.dt) > 0) tooltipLines.push(`OT/DT: $${(payResult.ot+payResult.dt).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                  if (payResult.holPay > 0) tooltipLines.push(`Hol: $${payResult.holPay.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                  if (payResult.midAmt > 0) tooltipLines.push(`Mid: $${payResult.midAmt.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                  if (payResult.totalLoss > 0) tooltipLines.push(`Loss: -$${payResult.totalLoss.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                  if (payResult.k401Ded > 0 || payResult.insuranceAmt > 0) {
                    tooltipLines.push(`Deductions: -$${(payResult.k401Ded + payResult.insuranceAmt).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                    tooltipLines.push(`Est. Net: $${payResult.estimatedNet.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                  }
                  
                  const tooltipText = tooltipLines.join('\n');
                  payMarker = (
                    <div 
                      className="pay-marker !relative !bottom-auto !right-auto !transform-none" 
                      title={tooltipText} 
                      onClick={(e) => { e.stopPropagation(); showPaycheckAudit(viewYear, viewMonth, d); }}
                    >
                      ${netStr}
                    </div>
                  );
                }
              }

              return (
                <div 
                  key={d} 
                  id={`day-item-${ds}`} 
                  className={dElCls} 
                  onClick={() => { if (!isCurrentMonthLocked) openModal(ds); }}
                >
                  {/* Left Column: Date */}
                  <div className={`w-11 shrink-0 flex flex-col items-center justify-center ${isToday ? 'text-[var(--swa-blue)]' : 'text-[var(--text-muted)]'}`}>
                    <span className="text-[10px] uppercase font-bold">{dayOfWeek}</span>
                    <span className={`text-xl font-black leading-none ${isToday ? 'text-[var(--swa-blue)]' : 'text-[var(--text-main)]'}`}>{d}</span>
                  </div>
                  
                  {/* Middle Column: Events */}
                  <div className="flex-1 flex flex-col gap-1 min-w-0 py-0">
                    {isAnni && <span className="text-[9px] bg-[var(--anni-bg)] px-1.5 py-0.5 rounded-full text-[var(--text-main)] font-bold w-max">🎂 Anniversary</span>}
                    {swaHolidays[ds] && <span className="text-[9px] bg-[var(--ra-dark-green)] px-1.5 py-0.5 rounded-full text-white font-bold w-max shadow-sm">{swaHolidays[ds]}</span>}
                    {fallOffs && fallOffs.length > 0 && (
                      <div className="text-[9px] bg-[var(--swa-red)]/10 text-[var(--swa-red)] font-bold px-1.5 py-0.5 rounded-full w-max mt-0.5">
                        ⚠️ {fallOffs.length > 1 ? `${fallOffs.length} Fall Offs` : fallOffs[0]}
                      </div>
                    )}
                    {valHtml || (
                      <span className="text-[11px] text-[var(--text-muted)]/50 italic font-medium">Tap to log shift</span>
                    )}
                  </div>

                  {/* Right Column: Pay Marker */}
                  {payMarker && (
                    <div className="shrink-0 ml-1">
                      {payMarker}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="bg-transparent shadow-none border-none overflow-hidden pb-6">
      {/* Calendar View Toggle: Month Grid vs Agenda List */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center p-1 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] shadow-xs">
          <button
            type="button"
            onClick={() => updateMobileView('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeMobileView === 'grid'
                ? 'bg-[var(--swa-blue)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <LayoutGrid size={13} />
            <span>Month Grid</span>
          </button>
          <button
            type="button"
            onClick={() => updateMobileView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeMobileView === 'list'
                ? 'bg-[var(--swa-blue)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <ListFilter size={13} />
            <span>Agenda List</span>
          </button>
        </div>
        <div className="text-[11px] font-bold text-[var(--text-muted)] hidden sm:block">
          Calendar Grid View
        </div>
      </div>

      <div className="grid grid-cols-7 bg-transparent mb-1.5">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, idx) => (
          <div key={d} className="text-center font-black text-[var(--text-muted)] uppercase text-[10px] sm:text-xs py-1.5 tracking-wider">
            <span className="sm:hidden">{['S','M','T','W','T','F','S'][idx]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>
      
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div 
          key={`${viewYear}-${viewMonth}-grid`}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(e, { offset, velocity }) => {
            const swipe = Math.abs(offset.x) * velocity.x;
            if (swipe < -10000) {
              changeMonth(1);
            } else if (swipe > 10000) {
              changeMonth(-1);
            }
          }}
          className="grid grid-cols-7 auto-rows-[minmax(60px,auto)] sm:auto-rows-[minmax(130px,auto)] gap-[1px] bg-[var(--border-color)] rounded-2xl shadow-sm border border-[var(--border-color)] overflow-hidden"
        >
          {Array.from({ length: firstDay }).map((_, idx) => {
            return <div key={`empty-${idx}`} className="bg-[var(--sub-bg)] h-full p-1 sm:p-2 relative flex flex-col items-center text-center box-border min-w-0"></div>;
          })}
          
          {Array.from({ length: daysInMonth }).map((_, dIdx) => {
            const d = dIdx + 1;
            const ds = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = (viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate());
            const isAnni = hireMD && ds.substring(5) === hireMD;
            
            const idx = firstDay + dIdx;
            const totalCells = firstDay + daysInMonth;
            const lastCellIndex = totalCells - 1;
            const firstCellOfLastRow = Math.floor(lastCellIndex / 7) * 7;

            let dElCls = 'bg-[var(--card-bg)] h-full p-1 sm:p-2 relative cursor-pointer flex flex-col items-center text-center box-border min-w-0 hover:bg-[var(--hover-bg)] transition-colors';

            const fallOffs = fallOffDates[ds];
            if (fallOffs && fallOffs.length > 0) {
              dElCls += ' ring-1 ring-inset ring-[var(--swa-red)]';
            }

            if (swaHolidays[ds]) dElCls += ' !bg-[var(--hol-bg)]';
            if (isToday) dElCls += ' !bg-[var(--swa-blue)]/10 ring-2 ring-inset ring-[var(--swa-blue)] z-10';
            if (isAnni) dElCls += ' !bg-[var(--anni-bg)]';

            let valHtml = null;
            if (logs[ds] && Array.isArray(logs[ds])) {
              const dayLogs = [...logs[ds]].map((e, idx) => ({...e, _origIdx: idx}));
              dayLogs.sort((a,b) => getBlockStartHour(a) - getBlockStartHour(b));
              
              valHtml = (
                <div className="flex-[1_1_auto] w-full flex flex-col items-center justify-start gap-[2px] sm:gap-[4px] min-w-0 pt-0.5 sm:pt-3">
                  {dayLogs.map(e => {
                    if(!e.type) return null;
                    const tCls = getBlockClass(e, logs[ds], settings, logs, ds);
                    return (
                      <React.Fragment key={e._origIdx}>
                        {/* Desktop Detailed Tag */}
                        <div className="hidden sm:contents">
                          {renderTag(e, ds, e._origIdx)}
                        </div>
                        {/* Mobile Micro Chip */}
                        <div 
                          className="sm:hidden w-full"
                          onClick={(ev) => {
                            if (isCurrentMonthLocked) return;
                            ev.stopPropagation();
                            openEditBlock(ds, e._origIdx);
                          }}
                        >
                          <div 
                            className={`tag-${tCls} !w-full !max-w-none !py-0.5 !px-1 !text-[8px] font-black !rounded !m-0 truncate text-center shadow-xs`}
                            style={getAdditionalTagStyle(tCls)}
                          >
                            {e.type.replace('WORK-', '')} {e.hrs ? `${e.hrs}h` : ''}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            }

            let payMarker = null;
            if(d === 5 || d === 20) {
              const payResult = calculatePay(viewYear, viewMonth, d, logs, midCounts, settings);
              const netStr = isNaN(payResult.estimatedNet) || payResult.estimatedNet === 0 ? '' : payResult.estimatedNet.toLocaleString('en-US', {maximumFractionDigits: 0});
              if (netStr !== '') {
                const tooltipLines = [
                  `Gross Pay: $${payResult.net.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`,
                  `Base: $${payResult.basePay.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`
                ];
                if ((payResult.ot+payResult.dt) > 0) tooltipLines.push(`OT/DT: $${(payResult.ot+payResult.dt).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                if (payResult.holPay > 0) tooltipLines.push(`Hol: $${payResult.holPay.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                if (payResult.midAmt > 0) tooltipLines.push(`Mid: $${payResult.midAmt.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                if (payResult.totalLoss > 0) tooltipLines.push(`Loss: -$${payResult.totalLoss.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                if (payResult.k401Ded > 0 || payResult.insuranceAmt > 0) {
                  tooltipLines.push(`Deductions: -$${(payResult.k401Ded + payResult.insuranceAmt).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                  tooltipLines.push(`Est. Net: $${payResult.estimatedNet.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`);
                }
                
                const tooltipText = tooltipLines.join('\n');
                payMarker = (
                  <div 
                    className="pay-marker !text-[7px] sm:!text-[9px] !px-1 sm:!px-1.5 !py-0 sm:!py-0.5 !bottom-0.5 sm:!bottom-1.5 !right-0.5 sm:!right-1.5" 
                    title={tooltipText} 
                    onClick={(e) => { e.stopPropagation(); showPaycheckAudit(viewYear, viewMonth, d); }}
                  >
                    ${netStr}
                  </div>
                );
              }
            }

            return (
              <div 
                key={d} 
                id={`day-item-${ds}`} 
                className={dElCls} 
                title={isCurrentMonthLocked ? "Locked" : "Add a block"} 
                onClick={() => { if (!isCurrentMonthLocked) openModal(ds); }}
              >
                {isToday ? <strong className="text-[var(--swa-blue)] text-xs sm:text-base">{d}</strong> : <b className="text-[var(--text-main)] text-xs sm:text-base">{d}</b>}
                {isAnni && <div className="anni-banner text-[6px] sm:text-[7px]">🎂 ANNIV</div>}
                {swaHolidays[ds] && <div className="sched-hol-banner text-[6px] sm:text-[7px]">{swaHolidays[ds]}</div>}
                {fallOffs && fallOffs.length > 0 && (
                  <div className="text-[8px] sm:text-[9px] bg-[var(--swa-red)]/10 text-[var(--swa-red)] font-bold px-1 py-0.5 rounded-full mb-0.5 w-max truncate" title={fallOffs.join('\n')}>
                    ⚠️ Fall Off
                  </div>
                )}
                {valHtml}
                {payMarker}
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
