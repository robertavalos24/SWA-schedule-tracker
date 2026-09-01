import React, { useState } from 'react';
import { TrendingUp, Calendar, ShieldCheck, Moon, Eye, EyeOff, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { CardPrefs, FmlaCase, LogsState } from '../types';
import { useModalStore } from '../store/useModalStore';
import { useToast } from '../contexts/ToastContext';
import { formatPto } from '../utils/calculations';

interface DashboardProps {
  cardPrefs: CardPrefs;
  updateCardPrefs: (prefs: CardPrefs) => void;
  stats: any;
  isYearView: boolean;
  fmlaCases: FmlaCase[];
  logs: LogsState;
  isLocked: boolean;
  viewYear: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  cardPrefs, updateCardPrefs, stats, isYearView, fmlaCases, logs, isLocked, viewYear
}) => {
  const { modals: modalsState, openModal } = useModalStore();
  const { showToast } = useToast();
  const isYtdSummaryOpen = modalsState.ytdSummary;

  const [isPayCensored, setIsPayCensored] = useState(true);
  const [isPtoExpanded, setIsPtoExpanded] = useState(false);
  const [showReminders, setShowReminders] = useState(false);

  React.useEffect(() => {
    // Initial notifications check
    if (overallFmlaRemaining < 40) {
      showToast(`Warning: Overall FMLA balance is low (${overallFmlaRemaining.toFixed(1)}h remaining).`, 'error');
    }
    
    fmlaExpirationWarnings.forEach(w => {
      showToast(`FMLA Case #${w.num} is expiring in ${w.daysUntil} days.`, 'warning');
    });

    if (attDays !== null && attDays <= 14 && attDays >= 0) {
      showToast(`An attendance point will drop off in ${attDays} days!`, 'success');
    }
  }, []); // Only on mount

  React.useEffect(() => {
    if (!isYtdSummaryOpen) {
      setIsPayCensored(true);
    }
  }, [isYtdSummaryOpen]);

  const getDaysUntil = (dateStr: string) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === 'No Expiration') return null;
    const dropDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffTime = dropDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const attDays = getDaysUntil(stats.dropDateText);
  const perfDays = getDaysUntil(stats.manualDropDateText);

  // Calculate FMLA warnings
  const fmlaWarnings = (fmlaCases || []).filter(c => c.leaveType !== "Continuous" && !c.isContinuous).map(c => {
    let used = 0;
    const year = c.startD ? c.startD.split('-')[0] : new Date().getFullYear().toString();
    for (const ds in logs) {
      if (Array.isArray(logs[ds])) {
        logs[ds].forEach(e => {
          if (e.type === 'FMLA-P' || e.type === 'FML-UNP') {
            if (fmlaCases.length <= 1 || String(e.fmlaCase) === String(c.num)) {
              used += parseFloat(e.hrs as any) || 8;
            }
          }
        });
      }
    }
    const remaining = (c.bal || 0) - used;
    return { ...c, remaining, year };
  }).filter(c => c.remaining < 40);

  // FMLA Expiration Calculations (Assume 1 year from start date if not specified)
  const fmlaExpirationWarnings = (fmlaCases || []).map(c => {
    if (!c.startD) return null;
    const startDate = new Date(c.startD + "T00:00:00");
    const expDate = new Date(startDate);
    expDate.setFullYear(expDate.getFullYear() + 1);
    
    const ds = expDate.toISOString().split('T')[0];
    const daysUntil = getDaysUntil(ds);
    return { 
      num: c.num, 
      expDate: ds,
      daysUntil 
    };
  }).filter(c => c !== null && c.daysUntil !== null && c.daysUntil <= 30 && c.daysUntil >= 0) as { num: string, expDate: string, daysUntil: number }[];

  let totalFmlaUsed = 0;
  let totalContinuousHours = 0;
  (fmlaCases || []).forEach(c => {
    if ((c.leaveType === "Continuous" || c.isContinuous) && c.continuousWeeks) {
      totalContinuousHours += c.continuousWeeks * 40;
    }
  });
  for (const ds in logs) {
    if (Array.isArray(logs[ds])) {
      logs[ds].forEach(e => {
        if (e.type === 'FMLA-P' || e.type === 'FML-UNP') {
          totalFmlaUsed += parseFloat(e.hrs as any) || 8;
        }
      });
    }
  }
  const overallFmlaRemaining = 480 - totalFmlaUsed - totalContinuousHours;

  return (
    <div className="flex flex-col gap-2.5 mb-4">
      {/* Reminders / Alerts Section */}
      {(fmlaWarnings.length > 0 || fmlaExpirationWarnings.length > 0 || overallFmlaRemaining < 40 || (attDays !== null && attDays <= 30) || (perfDays !== null && perfDays <= 30)) && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-3 rounded-xl flex flex-col gap-2 shadow-sm mb-2">
          <div 
            className="font-bold flex items-center justify-between text-[var(--text-main)] pb-2 uppercase tracking-tighter text-[11px] text-[var(--swa-blue)] cursor-pointer select-none"
            onClick={() => setShowReminders(!showReminders)}
          >
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-[var(--swa-orange)]" /> Upcoming Reminders & Notifications
            </div>
            {showReminders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
          
          {showReminders && (
            <div className="flex flex-col gap-2 border-t border-[var(--border-color)] pt-2">
              {overallFmlaRemaining < 40 && (
                <div className="text-xs font-semibold text-[var(--swa-red)] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--swa-red)]"></span>
                  Overall FMLA Balance — Only <span className="font-black">{overallFmlaRemaining.toFixed(1)} hours</span> remaining!
                </div>
              )}

          {fmlaWarnings.map(w => (
            <div key={w.num} className="text-xs font-semibold text-[var(--swa-red)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--swa-red)]"></span>
              FMLA Case #{w.num} ({w.year}) — Only <span className="font-black">{w.remaining.toFixed(1)} hours</span> remaining!
            </div>
          ))}

          {fmlaExpirationWarnings.map(w => (
            <div key={w.num} className="text-xs font-semibold text-[var(--swa-orange)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--swa-orange)]"></span>
              FMLA Case #{w.num} is expiring in <span className="font-black">{w.daysUntil} days</span> ({w.expDate})
            </div>
          ))}

          {attDays !== null && attDays <= 30 && attDays >= 0 && (
            <div className="text-xs font-semibold text-[var(--swa-orange)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--swa-orange)]"></span>
              Attendance point dropping off in <span className="font-black">{attDays} days</span> ({stats.dropDateText})
            </div>
          )}

          {perfDays !== null && perfDays <= 30 && perfDays >= 0 && (
            <div className="text-xs font-semibold text-[var(--swa-orange)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--swa-orange)]"></span>
              Performance point dropping off in <span className="font-black">{perfDays} days</span> ({stats.manualDropDateText})
            </div>
          )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2.5">
        {(cardPrefs.cardOrder || ['timeoff', 'att', 'mid', 'pay']).map((cardId) => {
          if (cardId === 'timeoff' && (!isYearView && cardPrefs.timeoff)) {
            return (
              <div 
                key={cardId}
                draggable={!isLocked}
                onDragStart={(e) => { e.dataTransfer.setData('cardId', cardId); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('cardId');
                  if (draggedId && draggedId !== cardId) {
                    const currentOrder = cardPrefs.cardOrder || ['timeoff', 'att', 'mid', 'pay'];
                    const dragIndex = currentOrder.indexOf(draggedId);
                    const dropIndex = currentOrder.indexOf(cardId);
                    if (dragIndex > -1 && dropIndex > -1) {
                      const newOrder = [...currentOrder];
                      newOrder.splice(dragIndex, 1);
                      newOrder.splice(dropIndex, 0, draggedId);
                      updateCardPrefs({ ...cardPrefs, cardOrder: newOrder });
                    }
                  }
                }}
                className={`bg-[var(--card-bg)] p-4 rounded-xl shadow-sm text-center border-b-4 border-[var(--swa-blue)] transition-all duration-300 flex flex-col justify-between items-center box-border h-full relative overflow-hidden ${isLocked ? 'cursor-default opacity-90' : 'cursor-grab hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing'}`}
                onClick={() => { if (!isLocked) openModal('timeoffDetails'); }}
                title={isLocked ? "Locked" : "Drag to reorder, click to view"}
              >
                <div className="absolute top-0 left-0 w-full h-1 flex opacity-50">
                  <div className="flex-1 bg-[var(--swa-blue)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-red)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-yellow)] transition-colors"></div>
                </div>
                <div className="w-full flex justify-between items-start mb-2">
                  <h3 className="m-0 text-[11px] uppercase text-[var(--swa-blue)] font-bold tracking-wider">Time Off Balances</h3>
                  <div className="bg-[var(--swa-blue)]/10 p-1 rounded text-[var(--swa-blue)]">
                    <Calendar size={14} />
                  </div>
                </div>
                <div className="flex w-full justify-around items-start mb-2 gap-1 px-1">
                  <div className="flex flex-col items-center flex-1">
                    <p className="m-0 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Projected PTO</p>
                    <p className={`m-0 text-xl font-black tracking-tight ${stats.ptoEnd < 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>
                      {formatPto(stats.ptoEnd)}<span className="text-xs opacity-60 ml-0.5">h</span>
                    </p>
                  </div>
                  <div className="w-[1px] h-8 bg-[var(--border-color)]"></div>
                  <div className="flex flex-col items-center flex-1">
                    <p className="m-0 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Projected HOL</p>
                    <p className={`m-0 text-xl font-black tracking-tight ${stats.holEnd < 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>
                      {(stats.holEnd / 8).toFixed(0)}<span className="text-xs opacity-60 ml-0.5">d</span>
                    </p>
                  </div>
                </div>

                {isPtoExpanded && (
                  <div className="w-full space-y-2 mt-2 pt-3 border-t border-[var(--border-color)] animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-[var(--swa-blue)]/80 mb-1 px-1">
                      <span>Accrual & Caps</span>
                      <span className="bg-[var(--swa-blue)]/5 px-1.5 py-0.5 rounded italic">Tier: {stats.currentTier.y}+ Years</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--border-color)]/30 flex flex-col items-center">
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">Accrual Rate</span>
                        <div className="text-sm font-black text-[var(--text-main)]">
                          {formatPto(stats.currentTier.a)}<span className="text-[10px] opacity-50 ml-0.5">h/mo</span>
                        </div>
                      </div>
                      <div className="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--border-color)]/30 flex flex-col items-center">
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">Maximum Cap</span>
                        <div className="text-sm font-black text-[var(--text-main)]">
                          {formatPto(stats.currentTier.c)}<span className="text-[10px] opacity-50 ml-0.5">h</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] px-1">
                      <span>Start Balance</span>
                      <span className="text-[var(--text-main)]">{formatPto(stats.ptoStart)}h</span>
                    </div>
                  </div>
                )}

                <div 
                  className="mt-3 w-full bg-[var(--hover-bg)] hover:bg-[var(--border-color)]/20 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[9px] font-black text-[var(--swa-blue)] uppercase tracking-widest transition-all cursor-pointer border border-[var(--border-color)]/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPtoExpanded(!isPtoExpanded);
                  }}
                >
                  {isPtoExpanded ? (
                    <>Hide Accrual Details <ChevronUp size={12} /></>
                  ) : (
                    <>Show Accrual Details <ChevronDown size={12} /></>
                  )}
                </div>
              </div>
            );
          }

          if (cardId === 'att' && cardPrefs.att) {
            return (
              <div 
                key={cardId}
                draggable={!isLocked}
                onDragStart={(e) => { e.dataTransfer.setData('cardId', cardId); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('cardId');
                  if (draggedId && draggedId !== cardId) {
                    const currentOrder = cardPrefs.cardOrder || ['timeoff', 'att', 'mid', 'pay'];
                    const dragIndex = currentOrder.indexOf(draggedId);
                    const dropIndex = currentOrder.indexOf(cardId);
                    if (dragIndex > -1 && dropIndex > -1) {
                      const newOrder = [...currentOrder];
                      newOrder.splice(dragIndex, 1);
                      newOrder.splice(dropIndex, 0, draggedId);
                      updateCardPrefs({ ...cardPrefs, cardOrder: newOrder });
                    }
                  }
                }}
                className={`bg-[var(--card-bg)] p-4 rounded-xl shadow-sm text-center border-b-4 border-[var(--swa-blue)] transition-all duration-300 flex flex-col justify-between items-center box-border h-full relative overflow-hidden ${stats.tMet > 0 ? `alert-lvl-${stats.tMet}` : ''} ${isLocked ? 'cursor-default opacity-90' : 'cursor-grab hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing'}`}
                onClick={() => { if (!isLocked) openModal('attendanceDetails'); }}
                title={isLocked ? "Locked" : "Drag to reorder, click to view"}
              >
                <div className="absolute top-0 left-0 w-full h-1 flex opacity-50">
                  <div className="flex-1 bg-[var(--swa-blue)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-red)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-yellow)] transition-colors"></div>
                </div>
                <div className="w-full flex justify-between items-start mb-2">
                  <h3 className="m-0 text-[11px] uppercase text-[var(--swa-blue)] font-bold tracking-wider">Status Levels</h3>
                  <div className="bg-[var(--swa-blue)]/10 p-1 rounded text-[var(--swa-blue)]" style={{ color: stats.attColor, backgroundColor: `${stats.attColor}1A` }}>
                    <ShieldCheck size={14} />
                  </div>
                </div>

                {isYearView && (
                  <div className="w-full mb-3 text-center">
                    <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-mono block">
                      {stats.isAsOfToday ? `As of Today: ${stats.todayStr}` : `Final Year-End Status`}
                    </span>
                  </div>
                )}

                <div className="w-full flex justify-between items-center mb-4 gap-2">
                  <div className="flex flex-col items-center flex-1">
                    <p className="m-0 text-[9px] font-black text-[var(--text-main)] opacity-60 uppercase tracking-widest">Attendance</p>
                    <p className="m-0 text-xl font-black tracking-tight" style={{ color: stats.attColor }}>
                      {stats.attLetter}
                    </p>
                  </div>
                  <div className="flex flex-col items-center flex-1">
                    <p className="m-0 text-[9px] font-black text-[var(--text-main)] opacity-60 uppercase tracking-widest">Performance</p>
                    <p className="m-0 text-xl font-black tracking-tight" style={{ color: stats.manualColor }}>
                      {stats.manualLetter}
                    </p>
                  </div>
                </div>

                <div className="w-full space-y-1 mt-auto">
                  <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)]">
                    <span>Numeric Level</span>
                    <span>{stats.attMet} (Att) / {stats.manualMet} (Perf)</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-[var(--text-muted)]">Att Drop</span>
                    <span className={`font-black ${stats.dropDateText !== 'N/A' ? 'text-[var(--swa-red)]' : 'text-[var(--swa-blue)]'}`}>{stats.dropDateText}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-[var(--text-muted)]">Perf Drop</span>
                    <span className={`font-black ${stats.manualDropDateText !== 'N/A' ? 'text-[var(--swa-red)]' : 'text-[var(--swa-blue)]'}`}>{stats.manualDropDateText}</span>
                  </div>

                </div>

                <div className="mt-3 flex items-center justify-center gap-2 text-[9px] font-black text-[var(--swa-blue)] uppercase tracking-widest">
                  <span className="opacity-80">{isLocked ? "Locked" : "Click for Details"}</span>
                  {!isLocked && (
                    <>
                      <span className="opacity-20">|</span>
                      <button 
                        className="opacity-80 hover:opacity-100 transition-opacity bg-transparent border-none p-0 cursor-pointer font-black uppercase tracking-widest text-[9px]"
                        onClick={(e) => { e.stopPropagation(); openModal('override'); }}
                      >
                        Override
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }

          if (cardId === 'mid' && (!isYearView && cardPrefs.mid)) {
            return (
              <div 
                key={cardId}
                draggable={!isLocked}
                onDragStart={(e) => { e.dataTransfer.setData('cardId', cardId); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('cardId');
                  if (draggedId && draggedId !== cardId) {
                    const currentOrder = cardPrefs.cardOrder || ['timeoff', 'att', 'mid', 'pay'];
                    const dragIndex = currentOrder.indexOf(draggedId);
                    const dropIndex = currentOrder.indexOf(cardId);
                    if (dragIndex > -1 && dropIndex > -1) {
                      const newOrder = [...currentOrder];
                      newOrder.splice(dragIndex, 1);
                      newOrder.splice(dropIndex, 0, draggedId);
                      updateCardPrefs({ ...cardPrefs, cardOrder: newOrder });
                    }
                  }
                }}
                className={`bg-[var(--card-bg)] p-4 rounded-xl shadow-sm text-center border-b-4 border-[var(--swa-blue)] transition-all duration-300 flex flex-col justify-between items-center box-border h-full relative overflow-hidden ${isLocked ? 'cursor-default opacity-90' : 'cursor-grab hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing'}`}
                onClick={() => { if (!isLocked) openModal('bulkMid'); }}
                title={isLocked ? "Locked" : "Drag to reorder, click to view"}
              >
                <div className="absolute top-0 left-0 w-full h-1 flex opacity-50">
                  <div className="flex-1 bg-[var(--swa-blue)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-red)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-yellow)] transition-colors"></div>
                </div>
                <div className="w-full flex justify-between items-start mb-2">
                  <h3 className="m-0 text-[11px] uppercase text-[var(--swa-blue)] font-bold tracking-wider">Midnight Shifts</h3>
                  <div className="bg-[var(--swa-blue)]/10 p-1 rounded text-[var(--swa-blue)]">
                    <Moon size={14} />
                  </div>
                </div>

                <div className="flex flex-col items-center mb-4">
                  <p className="m-0 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Monthly Count</p>
                  <p className="m-0 text-2xl font-black tracking-tight text-[var(--swa-blue)]">
                    {stats.midMonthCount}
                  </p>
                </div>

                <div className="w-full space-y-1 mt-auto">
                  <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] border-b border-[var(--border-color)] pb-1">
                    <span>Month Diff</span>
                    <span className="text-[var(--ra-gold)]">${stats.midMonthAmt.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] pt-1">
                    <span>Year Total</span>
                    <span className="text-[var(--ra-gold)]">${stats.midYearAmt.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-3 text-[9px] font-black text-[var(--swa-blue)] uppercase tracking-widest opacity-50">
                  Click for Details
                </div>
              </div>
            );
          }

          if (cardId === 'pay' && cardPrefs.pay) {
            return (
              <div 
                key={cardId}
                draggable={!isLocked}
                onDragStart={(e) => { e.dataTransfer.setData('cardId', cardId); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('cardId');
                  if (draggedId && draggedId !== cardId) {
                    const currentOrder = cardPrefs.cardOrder || ['timeoff', 'att', 'mid', 'pay'];
                    const dragIndex = currentOrder.indexOf(draggedId);
                    const dropIndex = currentOrder.indexOf(cardId);
                    if (dragIndex > -1 && dropIndex > -1) {
                      const newOrder = [...currentOrder];
                      newOrder.splice(dragIndex, 1);
                      newOrder.splice(dropIndex, 0, draggedId);
                      updateCardPrefs({ ...cardPrefs, cardOrder: newOrder });
                    }
                  }
                }}
                className={`bg-[var(--card-bg)] p-4 rounded-xl shadow-sm text-center border-b-4 border-[var(--pay-green)] transition-all duration-300 flex flex-col justify-between items-center box-border h-full relative overflow-hidden ${isLocked ? 'cursor-default opacity-90' : 'cursor-grab hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing'}`}
                onClick={() => {
                  if (isLocked) return;
                  if (isPayCensored) {
                    setIsPayCensored(false);
                  } else {
                    openModal('ytdSummary');
                  }
                }}
                onDoubleClick={() => { if (!isLocked) setIsPayCensored(true); }}
                title={isLocked ? "Locked" : (isPayCensored ? "Drag to reorder, click to reveal" : "Double-click to hide")}
              >
                <div className="absolute top-0 left-0 w-full h-1 flex opacity-50">
                  <div className="flex-1 bg-[var(--swa-blue)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-red)] transition-colors"></div>
                  <div className="flex-1 bg-[var(--swa-yellow)] transition-colors"></div>
                </div>
                <div className="w-full flex justify-between items-start mb-2">
                  <h3 className="m-0 text-[11px] uppercase text-[var(--swa-blue)] font-bold tracking-wider">Annual Gross Pay</h3>
                  <button 
                    className="bg-[var(--pay-green)]/10 p-1 rounded text-[var(--pay-green)] hover:bg-[var(--pay-green)]/20 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPayCensored(!isPayCensored);
                    }}
                    title={isPayCensored ? "Click to reveal" : "Click to hide"}
                  >
                    {isPayCensored ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                
                <p className="m-0 mb-4 text-2xl font-black text-[var(--pay-green)] tracking-tight">
                  {isPayCensored ? '••••••••' : `$${stats.yg.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                </p>
                
                <div className={`w-full space-y-1 mt-auto transition-opacity duration-300 ${isPayCensored ? 'opacity-0' : 'opacity-100'}`}>
                  <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] border-b border-[var(--border-color)] pb-1">
                    <span>OT/DT</span>
                    <span className="text-[var(--ra-gold)]">${(stats.otYearAmt + stats.dtYearAmt).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] border-b border-[var(--border-color)] pb-1">
                    <span>Holiday</span>
                    <span className="text-[var(--pay-green)]">${stats.holYearPay.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-[var(--swa-red)] pt-1">
                    <span>Deductions</span>
                    <span>-${(stats.k401YearDed + stats.insuranceYearAmt).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-[var(--pay-green)] pt-1 border-t border-[var(--border-color)]">
                    <span>Est. Net</span>
                    <span>${stats.estimatedNetYear.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
                
                <div className="mt-3 text-[9px] font-black text-[var(--swa-blue)] uppercase tracking-widest opacity-50">
                  {isPayCensored ? 'Click to Reveal' : 'Click for Breakdown'}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};
