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
    <div className="bg-[var(--card-bg)] p-4 rounded-2xl mb-6 shadow-sm border border-black/5 box-border flex flex-col gap-4">
      {/* First Row */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[110px] flex flex-col justify-between">
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 whitespace-nowrap">
            <Calendar size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            Hire Date
          </label>
          <input 
            type="date" 
            className="p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all"
            value={settings.hireDate}
            onChange={(e) => updateSettings({ hireDate: e.target.value })}
          />
        </div>

        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[70px] max-w-[100px] flex flex-col justify-between">
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 whitespace-nowrap">
            <User size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            Lvl
          </label>
          <div className="relative">
            <select 
              className={`p-2 pr-8 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all appearance-none cursor-pointer relative z-10 ${(settings.payHistory && settings.payHistory.length > 0) ? 'opacity-80 pointer-events-none' : ''}`}
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
              style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
            >
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[120px] flex flex-col justify-between">
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 whitespace-nowrap">
            <Calendar size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            PTO As Of
          </label>
          <input 
            type="date" 
            className="p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all"
            value={settings.asOfDate}
            onChange={(e) => updateSettings({ asOfDate: e.target.value })}
          />
        </div>

        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[90px] flex flex-col justify-between">
          <label 
            className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 cursor-pointer hover:text-[var(--swa-orange)] transition-colors whitespace-nowrap"
            onClick={() => openModal('correction')}
            title="Add a balance correction"
          >
            <TrendingUp size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            PTO Bal
            {(settings.correctionDate || settings.accrualChangeDate) && <span className="w-1.5 h-1.5 rounded-full bg-[var(--swa-orange)] animate-pulse ml-auto" title="Correction / Accrual Override Applied"></span>}
          </label>
          <input 
            type="number" 
            step="any"
            className="p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all"
            value={settings.startPto}
            onChange={(e) => updateSettings({ startPto: e.target.value })}
          />
        </div>

        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[170px] flex flex-col justify-between">
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 whitespace-nowrap">
            <DollarSign size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            Base Salary (Jan-Feb)
          </label>
          <input 
            type="text" 
            className={`p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all ${settings.payHistory && settings.payHistory.length > 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
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

        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[120px] flex flex-col justify-between">
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 whitespace-nowrap">
            <Info size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            Hourly Rate
          </label>
          <div className="p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--hover-bg)] font-black text-[var(--swa-blue)] text-center">
            {hourlyRate}
          </div>
        </div>

        <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[80px] flex flex-col justify-between">
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center gap-1.5 px-1 whitespace-nowrap">
            <Percent size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
            Raise
          </label>
          <select 
            className="p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all appearance-none cursor-pointer"
            value={settings.pctIncrease}
            onChange={(e) => updateSettings({ pctIncrease: e.target.value })}
          >
            {Array.from({length: 21}, (_, i) => i * 0.5).map(val => (
              <option key={val} value={val.toFixed(1)}>{val.toFixed(1)}%</option>
            ))}
          </select>
        </div>

        <div 
          className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] group flex-1 min-w-[190px] flex flex-col justify-between"
          title="Input current Mar-Dec salary to auto-calculate Jan-Feb Base Salary based on Raise %"
        >
          <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center justify-between px-1 whitespace-nowrap">
            <div className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--swa-blue)] transition-colors" onClick={() => openModal('ytdSummary')}>
              <DollarSign size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
              Current Salary (Mar-Dec)
            </div>
            <div title="Click to view Annual Pay Breakdown">
              <Edit2 size={10} className="opacity-60 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => openModal('ytdSummary')} />
            </div>
          </label>
          <input 
            type="text" 
            className={`p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-black text-center focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all ${settings.payHistory && settings.payHistory.length > 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
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

        {calculatedSalary !== endOfYearSalary && (
          <div className="bg-[var(--sub-bg)] p-2 rounded-xl border border-[var(--border-color)] flex-1 min-w-[160px] flex flex-col justify-between">
            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase mb-1.5 flex items-center justify-between px-1 whitespace-nowrap">
              <div className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--swa-blue)] transition-colors" onClick={() => openModal('ytdSummary')}>
                <DollarSign size={10} className="text-[var(--swa-blue)] flex-shrink-0" />
                Latest Salary (Dec 31)
              </div>
              <div title="Includes any promotions or adjustments during the year.">
                <Info size={10} className="opacity-60 cursor-help" />
              </div>
            </label>
            <input 
              type="text" 
              className="p-2 border border-[var(--border-color)] rounded-lg text-xs w-full box-border bg-[var(--input-bg)] text-[var(--text-main)] font-black text-center focus:outline-none focus:ring-2 focus:ring-[var(--swa-blue)]/20 transition-all opacity-80 cursor-default"
              value={endOfYearSalary}
              readOnly
            />
          </div>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-stretch gap-3 border-t border-[var(--border-color)] pt-4 mt-2">
      {/* Action Buttons */}
        <div className="relative group flex-1 min-w-[150px]">
          <button 
            onClick={() => openModal('fmlaManager')}
            className={`flex items-center justify-center gap-2 p-2.5 font-black cursor-pointer bg-[var(--input-bg)] text-[var(--swa-blue)] border-2 border-[var(--border-color)] rounded-xl w-full h-full transition-all hover:border-[var(--swa-blue)] hover:shadow-sm relative ${fmlaStatus === 'danger' ? 'animate-pulse border-[var(--swa-red)] shadow-[0_0_8px_var(--swa-red)]' : fmlaStatus === 'warning' ? 'animate-pulse border-[var(--swa-orange)] shadow-[0_0_8px_var(--swa-orange)]' : ''}`}
          >
            <Briefcase size={14} />
            Manage FMLA
            {fmlaStatus !== 'none' && (
              <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${fmlaStatus === 'danger' ? 'bg-[var(--swa-red)]' : 'bg-[var(--swa-orange)]'} animate-ping`} />
            )}
            {fmlaStatus !== 'none' && (
              <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${fmlaStatus === 'danger' ? 'bg-[var(--swa-red)]' : 'bg-[var(--swa-orange)]'}`} />
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

        <button 
          onClick={() => openModal('sti')}
          className="flex-1 min-w-[150px] flex items-center justify-center gap-2 p-2.5 font-black cursor-pointer bg-[var(--input-bg)] text-[var(--pay-green)] border-2 border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--pay-green)] hover:shadow-sm"
        >
          <TrendingUp size={14} />
          STI Bonus
        </button>

        <button 
          onClick={() => openModal('payHistory')}
          className="flex-1 min-w-[150px] flex items-center justify-center gap-2 p-2.5 font-black cursor-pointer bg-[var(--input-bg)] text-[var(--swa-blue)] border-2 border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--swa-blue)] hover:shadow-sm"
        >
          <Plus size={14} />
          Add Promotion
        </button>

        <button 
          onClick={() => openModal('payHistory')}
          className="flex-1 min-w-[150px] flex items-center justify-center gap-2 p-2.5 font-black cursor-pointer bg-[var(--input-bg)] text-[var(--swa-red)] border-2 border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--swa-red)] hover:shadow-sm"
        >
          <Plus size={14} />
          Market Adjustment
        </button>

        <button 
          onClick={() => openModal('payHistory')}
          className="flex-1 min-w-[150px] flex items-center justify-center gap-2 p-2.5 font-black cursor-pointer bg-[var(--input-bg)] text-[var(--text-main)] border-2 border-[var(--border-color)] rounded-xl h-full transition-all hover:border-[var(--text-main)] hover:shadow-sm"
        >
          <History size={14} />
          Pay History
        </button>
      </div>

      {/* Row 3 - Tax settings */}
      <div className="border-t border-[var(--border-color)] pt-4 mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 bg-[var(--sub-bg)] px-3 py-2 rounded-xl border border-[var(--border-color)]">
            <span className="text-[10px] font-black text-[var(--swa-blue)] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[var(--pay-green)]" />
              Taxes Withholding
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
            <div className="flex items-center gap-2.5 text-xs font-semibold text-[var(--text-main)] bg-[var(--sub-bg)] px-3 py-2 rounded-xl border border-[var(--border-color)]">
              <span>Filing: <span className="text-[var(--swa-blue)] font-black uppercase text-[10px]">{settings.taxFilingStatus || 'single'}</span></span>
              <span className="text-[var(--border-color)]">|</span>
              <span>Children: <span className="text-[var(--swa-blue)] font-black text-xs">{settings.taxDependents || '0'}</span></span>
              {settings.fedTaxExempt === 'true' && (
                <>
                  <span className="text-[var(--border-color)]">|</span>
                  <span className="bg-[var(--swa-red)]/10 text-[var(--swa-red)] text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase">Fed Exempt</span>
                </>
              )}
              <button 
                onClick={() => openModal('taxSettings')}
                className="ml-2 text-[10px] text-[var(--swa-blue)] hover:underline font-black uppercase tracking-wider flex items-center gap-1"
              >
                ⚙️ Adjust
              </button>
            </div>
          )}
        </div>
        {settings.enableTaxes === 'true' && (
          <div className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5 bg-[var(--sub-bg)] px-3 py-2 rounded-xl border border-[var(--border-color)] text-right">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--pay-green)] animate-pulse"></span>
            TX STATE TAX APPLIED (0.00% RATE)
          </div>
        )}
        
        <button 
          onClick={resetAppData}
          className="ml-auto text-[10px] font-black uppercase tracking-wider text-[var(--swa-red)] hover:bg-[var(--swa-red)]/10 px-3 py-2 rounded-xl border border-[var(--swa-red)]/30 transition-colors flex items-center gap-1.5"
          title="Factory Reset App Data"
        >
          <Trash2 size={13} /> Reset App Data
        </button>
      </div>
    </div>
  );
};
