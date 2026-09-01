import React, { useState } from 'react';
import { Settings, FmlaCase, LogsState } from '../types';
import { Calendar, User, DollarSign, Percent, TrendingUp, Briefcase, Plus, Edit2, Info, Clock, ShieldCheck, History, Trash2 } from 'lucide-react';
import { useModalStore } from '../store/useModalStore';

interface SettingsBarProps {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  baseSalary: string;
  calculatedSalary: string;
  endOfYearSalary: string;
  hourlyRate: string;
  fmlaCases: FmlaCase[];
  logs: LogsState;
  viewYear: number;
  effectiveLevel: string;
  resetAppData: () => void;
}

export const SettingsBar: React.FC<SettingsBarProps> = ({ 
  settings, updateSettings, baseSalary, calculatedSalary, endOfYearSalary, hourlyRate, fmlaCases, logs, viewYear, effectiveLevel, resetAppData
}) => {
  const { openModal } = useModalStore();
  const [tempCalculatedSalary, setTempCalculatedSalary] = useState<string | undefined>(undefined);
  const [tempBaseSalary, setTempBaseSalary] = useState<string | undefined>(undefined);

  const formatSalaryInput = (val: string) => {
    const num = parseFloat(val.replace(/[^0-9.-]+/g, "")) || 0;
    return "$" + num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  };

  const unformatSalaryInput = (val: string) => {
    return val.replace(/[^0-9.-]+/g, "");
  };

  let fmlaStatus: 'none' | 'warning' | 'danger' = 'none';
  if (fmlaCases && fmlaCases.length > 0) {
    const today = new Date();
    for (const c of fmlaCases) {
      if (c.startD) {
        const sDate = new Date(c.startD + "T12:00:00");
        const eDate = new Date(sDate);
        eDate.setFullYear(eDate.getFullYear() + 1);
        eDate.setDate(eDate.getDate() - 1);
        
        const diffTime = eDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 7) {
          fmlaStatus = 'danger';
          break; // Highest priority
        } else if (diffDays <= 30) {
          fmlaStatus = 'warning';
        }
      }
    }
  }

  return (
    <div className="bg-[var(--card-bg)] p-3 sm:p-5 rounded-2xl mb-4 sm:mb-6 shadow-sm border border-[var(--border-color)] box-border flex flex-col gap-3 sm:gap-4 transition-all">
      {/* Primary Parameters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2 sm:gap-3">
        {/* Hire Date */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between">
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 whitespace-nowrap">
            <Calendar size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            Hire Date
          </label>
          <input 
            type="date" 
            className="p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all"
            value={settings.hireDate}
            onChange={(e) => updateSettings({ hireDate: e.target.value })}
          />
        </div>

        {/* Level */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between">
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 whitespace-nowrap">
            <User size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            Level
          </label>
          <div className="relative">
            <select 
              className={`p-1.5 sm:p-2 pr-6 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all appearance-none cursor-pointer ${(settings.payHistory && settings.payHistory.length > 0) ? 'opacity-80 pointer-events-none' : ''}`}
              value={(settings.payHistory && settings.payHistory.length > 0) ? effectiveLevel : settings.empLevel}
              disabled={(settings.payHistory && settings.payHistory.length > 0)}
              onChange={(e) => {
                const newLevel = e.target.value;
                let newStiBonusPct = settings.stiBonusPct;
                if (newLevel === 'P1') newStiBonusPct = '0';
                else if (newLevel === 'P2') newStiBonusPct = '4';
                else if (newLevel === 'P3' || newLevel === 'P4') newStiBonusPct = '5';
                updateSettings({ empLevel: newLevel, stiBonusPct: newStiBonusPct });
              }}
            >
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <svg width="8" height="5" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        {/* PTO As Of */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between">
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 whitespace-nowrap">
            <Calendar size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            PTO As Of
          </label>
          <input 
            type="date" 
            className="p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all"
            value={settings.asOfDate}
            onChange={(e) => updateSettings({ asOfDate: e.target.value })}
          />
        </div>

        {/* PTO Balance */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between">
          <label 
            className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 cursor-pointer hover:text-[var(--swa-orange)] transition-colors whitespace-nowrap"
            onClick={() => openModal('correction')}
            title="Click to add a PTO balance correction"
          >
            <TrendingUp size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            PTO Bal
            {(settings.correctionDate || settings.accrualChangeDate) && <span className="w-2 h-2 rounded-full bg-[var(--swa-orange)] animate-pulse ml-auto" title="Correction applied"></span>}
          </label>
          <input 
            type="number" 
            step="any"
            className="p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all"
            value={settings.startPto}
            onChange={(e) => updateSettings({ startPto: e.target.value })}
          />
        </div>

        {/* Base Salary */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1">
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 whitespace-nowrap">
            <DollarSign size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            Base (Jan-Feb)
          </label>
          <input 
            type="text" 
            className={`p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all ${settings.payHistory && settings.payHistory.length > 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
            value={tempBaseSalary !== undefined ? tempBaseSalary : baseSalary}
            readOnly={!!(settings.payHistory && settings.payHistory.length > 0)}
            onFocus={(e) => {
              if (settings.payHistory && settings.payHistory.length > 0) return;
              setTempBaseSalary(unformatSalaryInput(baseSalary));
            }}
            onBlur={(e) => {
              if (settings.payHistory && settings.payHistory.length > 0) return;
              const formatted = formatSalaryInput(e.target.value);
              updateSettings({ 
                salary: formatted,
                initialSalary: formatted,
                baseYear: viewYear.toString(),
                initialYear: viewYear.toString()
              });
              setTempBaseSalary(undefined);
            }}
            onChange={(e) => {
              if (settings.payHistory && settings.payHistory.length > 0) return;
              setTempBaseSalary(e.target.value);
            }}
          />
        </div>

        {/* Hourly Rate */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between">
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 whitespace-nowrap">
            <Clock size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            Hourly Rate
          </label>
          <div className="p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--hover-bg)] font-black text-[var(--swa-blue)] text-center truncate">
            {hourlyRate}
          </div>
        </div>

        {/* Raise % */}
        <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between">
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5 whitespace-nowrap">
            <Percent size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
            Raise %
          </label>
          <select 
            className="p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all appearance-none cursor-pointer"
            value={settings.pctIncrease}
            onChange={(e) => updateSettings({ pctIncrease: e.target.value })}
          >
            {Array.from({length: 21}, (_, i) => i * 0.5).map(val => (
              <option key={val} value={val.toFixed(1)}>{val.toFixed(1)}%</option>
            ))}
          </select>
        </div>

        {/* Current Salary (Mar-Dec) */}
        <div 
          className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] group flex flex-col justify-between col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1"
          title="Input current Mar-Dec salary to auto-calculate Jan-Feb Base Salary based on Raise %"
        >
          <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center justify-between whitespace-nowrap">
            <div className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--swa-blue)] transition-colors truncate" onClick={() => openModal('ytdSummary')}>
              <DollarSign size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
              Mar-Dec Salary
            </div>
            <div title="Click to view Annual Pay Breakdown">
              <Edit2 size={11} className="opacity-60 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => openModal('ytdSummary')} />
            </div>
          </label>
          <input 
            type="text" 
            className={`p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-black text-center focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all ${settings.payHistory && settings.payHistory.length > 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
            value={tempCalculatedSalary !== undefined ? tempCalculatedSalary : calculatedSalary}
            readOnly={!!(settings.payHistory && settings.payHistory.length > 0)}
            onFocus={(e) => {
              if (settings.payHistory && settings.payHistory.length > 0) return;
              setTempCalculatedSalary(unformatSalaryInput(calculatedSalary));
            }}
            onChange={(e) => {
              if (settings.payHistory && settings.payHistory.length > 0) return;
              setTempCalculatedSalary(e.target.value);
              const numVal = parseFloat(e.target.value.replace(/[^0-9.-]+/g, "")) || 0;
              const pct = parseFloat(settings.pctIncrease) || 0;
              const calculatedJanFeb = numVal / (1 + (pct / 100));
              const formattedJanFeb = "$" + calculatedJanFeb.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
              updateSettings({
                salary: formattedJanFeb,
                initialSalary: formattedJanFeb,
                baseYear: viewYear.toString(),
                initialYear: viewYear.toString()
              });
            }}
            onBlur={() => {
              setTempCalculatedSalary(undefined);
            }}
          />
        </div>

        {/* Latest Salary (Dec 31) */}
        {calculatedSalary !== endOfYearSalary && (
          <div className="bg-[var(--sub-bg)] p-2 sm:p-2.5 rounded-xl border border-[var(--border-color)] flex flex-col justify-between col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1">
            <label className="text-[10px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center justify-between whitespace-nowrap">
              <div className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--swa-blue)] transition-colors truncate" onClick={() => openModal('ytdSummary')}>
                <DollarSign size={12} className="text-[var(--swa-blue)] flex-shrink-0" />
                Dec 31 Salary
              </div>
              <div title="Includes any promotions or adjustments during the year.">
                <Info size={11} className="opacity-60 cursor-help" />
              </div>
            </label>
            <input 
              type="text" 
              className="p-1.5 sm:p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-black text-center focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all opacity-80 cursor-default"
              value={endOfYearSalary}
              readOnly
            />
          </div>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 border-t border-[var(--border-color)] pt-3 sm:pt-4">
        {/* FMLA Manage */}
        <div className="relative group">
          <button 
            onClick={() => openModal('fmlaManager')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 font-bold text-xs cursor-pointer bg-[var(--input-bg)] text-[var(--swa-blue)] border border-[var(--border-color)] rounded-xl w-full h-full transition-all hover:border-[var(--swa-blue)] hover:bg-[var(--hover-bg)] active:scale-95 shadow-sm relative ${fmlaStatus === 'danger' ? 'animate-pulse border-[var(--swa-red)] shadow-[0_0_8px_var(--swa-red)]' : fmlaStatus === 'warning' ? 'animate-pulse border-[var(--swa-orange)] shadow-[0_0_8px_var(--swa-orange)]' : ''}`}
          >
            <Briefcase size={14} className="flex-shrink-0" />
            <span className="truncate">Manage FMLA</span>
            {fmlaStatus !== 'none' && (
              <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${fmlaStatus === 'danger' ? 'bg-[var(--swa-red)]' : 'bg-[var(--swa-orange)]'} animate-ping`} />
            )}
            {fmlaStatus !== 'none' && (
              <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${fmlaStatus === 'danger' ? 'bg-[var(--swa-red)]' : 'bg-[var(--swa-orange)]'}`} />
            )}
          </button>
          
          {fmlaCases && fmlaCases.length > 0 && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max min-w-[200px] bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-main)] text-[11px] rounded-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none shadow-xl">
              <div className="font-black mb-2 border-b border-[var(--border-color)] pb-2 text-[var(--swa-blue)] uppercase tracking-wider flex items-center gap-2">
                <Info size={12} />
                FMLA Balance
              </div>
              <div className="space-y-1.5">
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
                    <div className="flex justify-between gap-4 mb-2 pb-2 border-b border-[var(--border-color)]">
                      <span className="font-bold text-[var(--swa-blue)]">Overall (480h):</span>
                      <span className={`font-black ${overallRemaining <= 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>
                        {overallRemaining.toFixed(1)}h
                      </span>
                    </div>
                  );
                })()}
                {fmlaCases.map((c, i) => {
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
                  if ((c.leaveType === "Continuous" || c.isContinuous)) {
                    return (
                      <div key={i} className="flex justify-between gap-4">
                        <span className="font-bold">Case #{c.num}:</span>
                        <span className="font-black text-[var(--text-muted)]">Continuous</span>
                      </div>
                    );
                  }

                  const remaining = (parseFloat(c.bal as any) || 0) - used;
                  return (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="font-bold">Case #{c.num}:</span>
                      <span className={`font-black ${remaining <= 0 ? 'text-[var(--swa-red)]' : 'text-[var(--text-main)]'}`}>
                        {c.bal ? `${remaining.toFixed(1)}h` : `-${used.toFixed(1)}h`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* STI Bonus */}
        <button 
          onClick={() => openModal('sti')}
          className="flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 font-bold text-xs cursor-pointer bg-[var(--input-bg)] text-[var(--pay-green)] border border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--pay-green)] hover:bg-[var(--hover-bg)] active:scale-95 shadow-sm"
        >
          <TrendingUp size={14} className="flex-shrink-0" />
          <span className="truncate">STI Bonus</span>
        </button>

        {/* Promotion */}
        <button 
          onClick={() => openModal('payHistory')}
          className="flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 font-bold text-xs cursor-pointer bg-[var(--input-bg)] text-[var(--swa-blue)] border border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--swa-blue)] hover:bg-[var(--hover-bg)] active:scale-95 shadow-sm"
        >
          <Plus size={14} className="flex-shrink-0" />
          <span className="truncate">Add Promotion</span>
        </button>

        {/* Market Adjustment */}
        <button 
          onClick={() => openModal('payHistory')}
          className="flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 font-bold text-xs cursor-pointer bg-[var(--input-bg)] text-[var(--swa-red)] border border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--swa-red)] hover:bg-[var(--hover-bg)] active:scale-95 shadow-sm"
        >
          <Plus size={14} className="flex-shrink-0" />
          <span className="truncate">Market Adj</span>
        </button>

        {/* Pay History */}
        <button 
          onClick={() => openModal('payHistory')}
          className="flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 font-bold text-xs cursor-pointer bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--text-main)] hover:bg-[var(--hover-bg)] active:scale-95 shadow-sm col-span-2 sm:col-span-1"
        >
          <History size={14} className="flex-shrink-0" />
          <span className="truncate">Pay History</span>
        </button>
      </div>

      {/* Row 3 - Tax settings & Utilities */}
      <div className="border-t border-[var(--border-color)] pt-3 sm:pt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 bg-[var(--sub-bg)] px-3 py-1.5 sm:py-2 rounded-xl border border-[var(--border-color)]">
            <span className="text-[10px] sm:text-[11px] font-black text-[var(--swa-blue)] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[var(--pay-green)] flex-shrink-0" />
              Taxes
            </span>
            <button 
              type="button"
              className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.enableTaxes === 'true' ? 'bg-[var(--pay-green)]' : 'bg-gray-200 dark:bg-zinc-700'}`}
              onClick={() => {
                const newVal = settings.enableTaxes === 'true' ? 'false' : 'true';
                updateSettings({ enableTaxes: newVal });
                if (newVal === 'true') {
                  openModal('taxSettings');
                }
              }}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.enableTaxes === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {settings.enableTaxes === 'true' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-main)] bg-[var(--sub-bg)] px-3 py-1.5 sm:py-2 rounded-xl border border-[var(--border-color)] flex-wrap">
              <span>Filing: <span className="text-[var(--swa-blue)] font-black uppercase text-[10px] sm:text-xs">{settings.taxFilingStatus || 'single'}</span></span>
              <span className="text-[var(--border-color)]">|</span>
              <span>Dep: <span className="text-[var(--swa-blue)] font-black">{settings.taxDependents || '0'}</span></span>
              {settings.fedTaxExempt === 'true' && (
                <>
                  <span className="text-[var(--border-color)]">|</span>
                  <span className="bg-[var(--swa-red)]/10 text-[var(--swa-red)] text-[9px] px-1.5 py-0.5 rounded font-black uppercase">Fed Exempt</span>
                </>
              )}
              <button 
                onClick={() => openModal('taxSettings')}
                className="ml-1 text-[10px] sm:text-[11px] text-[var(--swa-blue)] hover:underline font-black uppercase tracking-wider cursor-pointer"
              >
                ⚙️ Adjust
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
          {settings.enableTaxes === 'true' && (
            <div className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider hidden lg:flex items-center gap-1.5 bg-[var(--sub-bg)] px-2.5 py-1.5 rounded-xl border border-[var(--border-color)]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--pay-green)] animate-pulse"></span>
              TX State Tax (0.00%)
            </div>
          )}
          
          <button 
            onClick={resetAppData}
            className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[var(--swa-red)] hover:bg-[var(--swa-red)]/10 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-[var(--swa-red)]/30 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Factory Reset App Data"
          >
            <Trash2 size={12} />
            <span className="hidden xs:inline">Reset</span> App
          </button>
        </div>
      </div>
    </div>
  );
};
