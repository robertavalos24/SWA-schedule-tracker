import React, { useState } from 'react';
import { 
  Sun, Moon, Sunset, Coffee, ArrowLeftRight, Plane, Activity, 
  Plus, Calendar as CalendarIcon, X, Check, Clock, ChevronRight
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface QuickLogSpeedDialProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveShift: (type: string, hrs?: string, extraOptions?: any, targetDate?: string) => void;
  onOpenFullModal: (dateStr: string) => void;
  defaultDate?: string;
  isLocked: boolean;
}

export const QuickLogSpeedDial: React.FC<QuickLogSpeedDialProps> = ({
  isOpen,
  onClose,
  onSaveShift,
  onOpenFullModal,
  defaultDate,
  isLocked
}) => {
  const { showToast } = useToast();
  
  // Format today's YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(defaultDate || getTodayStr());
  const [selectedHours, setSelectedHours] = useState<string>('8');

  React.useEffect(() => {
    if (defaultDate) {
      setSelectedDate(defaultDate);
    }
  }, [defaultDate, isOpen]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([15, 30]);
      }
    } catch (e) {}
  };

  const handleQuickLog = (type: string, hrs: string = '8', extraOptions: any = {}) => {
    if (isLocked) {
      showToast('Calendar is locked. Unlock to log shifts.', 'error');
      return;
    }
    triggerHaptic();
    onSaveShift(type, hrs, extraOptions, selectedDate);
    onClose();
  };

  const presets = [
    {
      id: 'am',
      name: 'AM Shift',
      time: '06:00 – 14:30',
      hrs: '8',
      type: 'WORK-AM',
      icon: <Sun size={20} className="text-amber-500" />,
      color: 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300'
    },
    {
      id: 'pm',
      name: 'PM Shift',
      time: '14:00 – 22:30',
      hrs: '8',
      type: 'WORK-PM',
      icon: <Sunset size={20} className="text-orange-500" />,
      color: 'border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-300'
    },
    {
      id: 'mid',
      name: 'MID Shift',
      time: '22:00 – 06:30',
      hrs: '8',
      type: 'WORK-MID',
      icon: <Moon size={20} className="text-indigo-500" />,
      color: 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
    },
    {
      id: 'rdo',
      name: 'RDO / Off',
      time: 'Scheduled Day Off',
      hrs: '0',
      type: 'WOP',
      extra: { label: 'RDO' },
      icon: <Coffee size={20} className="text-emerald-500" />,
      color: 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
    },
    {
      id: 'trade-off',
      name: 'Traded Off',
      time: 'Giveaway to Coworker',
      hrs: '8',
      type: 'WOP',
      extra: { label: 'TRADED OFF' },
      icon: <ArrowLeftRight size={20} className="text-purple-500" />,
      color: 'border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300'
    },
    {
      id: 'trade-in',
      name: 'Picked Up Shift',
      time: 'Trade Pickup (Straight Time)',
      hrs: '8',
      type: 'WORK-AM',
      extra: { label: 'PICKUP' },
      icon: <Plus size={20} className="text-blue-500" />,
      color: 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300'
    },
    {
      id: 'pto',
      name: 'PTO / Vacation',
      time: 'Paid Time Off',
      hrs: '8',
      type: 'PTO',
      icon: <Plane size={20} className="text-sky-500" />,
      color: 'border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300'
    },
    {
      id: 'fmla',
      name: 'FMLA / Sick',
      time: 'Paid or Unpaid Leave',
      hrs: '8',
      type: 'FMLA-P',
      icon: <Activity size={20} className="text-rose-500" />,
      color: 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300'
    }
  ];

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-[var(--card-bg)] border border-[var(--border-color)] rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom-6">
        {/* Swipe Handle for Mobile */}
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto sm:hidden -mt-1 mb-1"></div>

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--swa-blue)] flex items-center justify-center text-white shadow-sm">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-[var(--text-main)] m-0 leading-tight">Quick Log Shift</h2>
              <p className="text-[11px] text-[var(--text-muted)] font-medium m-0">Fast one-tap logging for common shifts</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:bg-[var(--hover-bg)] cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Target Date Selector */}
        <div className="bg-[var(--sub-bg)] p-3 rounded-2xl border border-[var(--border-color)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-[var(--swa-blue)]" />
            <span className="text-xs font-bold text-[var(--text-main)]">Target Date:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-main)] font-black text-xs px-3 py-1.5 rounded-xl outline-none focus:border-[var(--swa-blue)] transition cursor-pointer"
          />
        </div>

        {/* Shift Presets Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleQuickLog(preset.type, preset.hrs, preset.extra)}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-sm ${preset.color}`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="p-1.5 rounded-xl bg-white/60 dark:bg-black/20 shadow-xs">
                  {preset.icon}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                  {preset.hrs}h
                </span>
              </div>
              <div>
                <div className="font-black text-xs leading-tight mb-0.5">{preset.name}</div>
                <div className="text-[10px] opacity-75 font-medium truncate">{preset.time}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Full shift builder trigger */}
        <div className="pt-1">
          <button
            onClick={() => {
              onClose();
              onOpenFullModal(selectedDate);
            }}
            className="w-full py-2.5 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--sub-bg)] hover:bg-[var(--hover-bg)] text-[var(--text-main)] font-bold text-xs flex items-center justify-between transition active:scale-[0.99] cursor-pointer"
          >
            <span>Custom Hours, OT, Holiday, or Multi-Shift...</span>
            <ChevronRight size={15} className="text-[var(--text-muted)]" />
          </button>
        </div>
      </div>
    </div>
  );
};
