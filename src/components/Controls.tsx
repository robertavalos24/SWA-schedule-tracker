import React from 'react';
import { Trash2, Plus, Undo2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar as CalendarIcon, CalendarDays, CalendarClock } from 'lucide-react';
import { useModalStore } from '../store/useModalStore';

interface ControlsProps {
  viewMonth: number;
  viewYear: number;
  isYearView: boolean;
  moveMonth: (n: number) => void;
  moveYear: (n: number) => void;
  setViewMonth: (m: number) => void;
  jumpToToday: () => void;
  toggleView: () => void;
  undoLogs: () => void;
  canUndo: boolean;
  isLocked: boolean;
  copyPreviousMonth: () => void;
  exportICS: () => void;
  lockedMonths?: string[];
  toggleLockMonth?: (year: number, month: number) => void;
  triggerClearMonth?: (year: number, month: number) => void;
}

export const Controls: React.FC<ControlsProps> = ({
  viewMonth, viewYear, isYearView, moveMonth, moveYear, setViewMonth, jumpToToday, toggleView, undoLogs, canUndo, isLocked,
  copyPreviousMonth, exportICS, lockedMonths = [], toggleLockMonth, triggerClearMonth
}) => {
  const { openModal } = useModalStore();

  const months = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", 
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  const currentMonthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const isCurrentMonthLocked = isLocked || lockedMonths.includes(currentMonthKey);

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 justify-center bg-[var(--card-bg)] p-3 rounded-2xl shadow-sm border border-[var(--border-color)]">
        <div className="flex justify-center md:justify-start gap-2 flex-wrap">
          {!isYearView && (
            <>
              <button 
                onClick={() => triggerClearMonth ? triggerClearMonth(viewYear, viewMonth) : openModal('confirmClearMonth')} 
                disabled={isCurrentMonthLocked}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isCurrentMonthLocked ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700/50 cursor-not-allowed' : 'bg-[var(--swa-red)]/10 text-[var(--swa-red)] border border-[var(--swa-red)]/30 cursor-pointer hover:bg-[var(--swa-red)]/20 hover:border-[var(--swa-red)]/50'}`}
                title={isCurrentMonthLocked ? "Locked" : "Clear all entries for this month"}
              >
                <Trash2 size={14} /> Clear Month
              </button>

              {toggleLockMonth && (
                <button 
                  onClick={() => toggleLockMonth(viewYear, viewMonth)} 
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    lockedMonths.includes(currentMonthKey)
                      ? 'bg-[var(--ra-gold)]/15 text-[var(--ra-gold)] border border-[var(--ra-gold)]/40 hover:bg-[var(--ra-gold)]/25'
                      : 'bg-[var(--text-muted)]/10 text-[var(--text-main)] border border-[var(--border-color)] hover:bg-[var(--hover-bg)]'
                  }`}
                  title="Lock or unlock this month to prevent accidental changes"
                >
                  {lockedMonths.includes(currentMonthKey) ? (
                    <>🔒 Locked</>
                  ) : (
                    <>🔓 Lock Month</>
                  )}
                </button>
              )}
            </>
          )}

          <button 
            onClick={undoLogs} 
            disabled={!canUndo || isCurrentMonthLocked}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${(canUndo && !isCurrentMonthLocked) ? 'bg-[var(--text-muted)]/10 text-[var(--text-main)] border border-[var(--text-muted)]/30 cursor-pointer hover:bg-[var(--text-muted)]/20 hover:border-[var(--text-muted)]/50' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700/50 cursor-not-allowed'}`}
            title={isCurrentMonthLocked ? "Locked" : "Undo last action"}
          >
            <Undo2 size={14} /> Undo
          </button>
        </div>
        
        <div className="flex items-center justify-center gap-1.5 bg-[var(--sub-bg)] p-1.5 rounded-xl border border-[var(--border-color)]">
        <button 
          onClick={() => moveYear(-1)} 
          className="text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] p-1.5 rounded-lg transition-colors"
          title="Previous Year"
        >
          <ChevronsLeft size={18} />
        </button>
        
        {!isYearView && (
          <button 
            onClick={() => moveMonth(-1)} 
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] p-1.5 rounded-lg transition-colors"
            title="Previous Month"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        
        {!isYearView ? (
          <div className="mx-2 flex items-center justify-center px-2">
            <div className="relative flex items-center">
              <select 
                className="border-none bg-transparent text-lg font-black text-[var(--text-main)] uppercase cursor-pointer outline-none text-center tracking-wider relative z-10 pr-6 appearance-none"
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value))}
                style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
              >
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-main)] opacity-50 z-20">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <span className="text-lg font-black text-[var(--text-main)] ml-1.5 tracking-wider">{viewYear}</span>
          </div>
        ) : (
          <strong className="mx-4 text-[var(--text-main)] uppercase text-lg font-black tracking-wider block">
            Annual {viewYear}
          </strong>
        )}

        {!isYearView && (
          <button 
            onClick={() => moveMonth(1)} 
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] p-1.5 rounded-lg transition-colors"
            title="Next Month"
          >
            <ChevronRight size={18} />
          </button>
        )}
        
        <button 
          onClick={() => moveYear(1)} 
          className="text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] p-1.5 rounded-lg transition-colors"
          title="Next Year"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
      
      <div className="flex justify-center md:justify-end gap-2 flex-wrap">
        <button 
          onClick={exportICS} 
          className="flex items-center gap-1.5 bg-[var(--pay-green)]/10 text-[var(--pay-green)] border border-[var(--pay-green)]/30 px-3 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all hover:bg-[var(--pay-green)]/20"
          title="Export to ICS (Calendar Sync)"
        >
          <CalendarClock size={14} /> Sync
        </button>
        <button 
          onClick={jumpToToday} 
          className="flex items-center gap-1.5 bg-[var(--swa-orange)]/10 text-[var(--swa-orange)] border border-[var(--swa-orange)]/30 px-3 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all hover:bg-[var(--swa-orange)]/20 hover:border-[var(--swa-orange)]/50"
        >
          <CalendarIcon size={14} /> Today
        </button>
        <button 
          onClick={toggleView} 
          className="flex items-center gap-1.5 bg-[var(--swa-blue)] text-white border border-[var(--swa-blue)]/50 px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all hover:bg-[var(--swa-blue)]/80 shadow-md"
        >
          <CalendarDays size={14} /> {isYearView ? "Monthly View" : "Yearly View"}
        </button>
      </div>
    </div>
    </div>
  );
};
