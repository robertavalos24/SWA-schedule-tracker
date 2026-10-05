import React, { useState } from 'react';
import { 
  Calendar, CalendarCheck, Plus, BarChart3, Menu, 
  DollarSign, Clock, ShieldCheck, Moon, X, Settings as SettingsIcon,
  Cloud, FileSpreadsheet, Download, Upload, Moon as MoonIcon, Sun as SunIcon,
  ChevronRight, Smartphone, RefreshCw
} from 'lucide-react';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { ThemeType } from '../types';
import { formatPto } from '../utils/calculations';

interface MobileBottomNavProps {
  currentView: 'grid' | 'list';
  onToggleCalendarView: () => void;
  onJumpToToday: () => void;
  onOpenQuickLog: () => void;
  onOpenSettings: () => void;
  onOpenGuide: () => void;
  stats: any;
  theme: ThemeType;
  toggleTheme: (theme?: ThemeType) => void;
  user: any;
  login: () => void;
  logout: () => void;
  forceSyncToCloud: () => void;
  pullFromCloud: () => void;
  onOpenModal: (name: any) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onToggleCalendarView,
  onJumpToToday,
  onOpenQuickLog,
  onOpenSettings,
  onOpenGuide,
  stats,
  theme,
  toggleTheme,
  user,
  login,
  logout,
  forceSyncToCloud,
  pullFromCloud,
  onOpenModal,
}) => {
  const [activeSheet, setActiveSheet] = useState<'stats' | 'menu' | null>(null);

  const triggerHaptic = () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch (e) {}
  };

  const getDaysUntil = (dateStr?: string) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === 'No Expiration') return null;
    const dropDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dropDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <>
      {/* Floating Mobile Bottom Nav Bar (Pill Design) */}
      <div className="fixed bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.25rem))] left-3 right-3 sm:left-6 sm:right-6 z-40 md:hidden pointer-events-none">
        <nav 
          className="pointer-events-auto max-w-md mx-auto bg-[var(--card-bg)]/90 backdrop-blur-xl border border-[var(--border-color)]/80 rounded-3xl px-3 py-2 shadow-2xl shadow-slate-900/10 transition-all"
          aria-label="Mobile Navigation"
        >
          <div className="flex items-center justify-around">
            {/* Calendar / View Switcher */}
            <button
              onClick={() => {
                triggerHaptic();
                onToggleCalendarView();
              }}
              className="flex flex-col items-center justify-center flex-1 py-1 px-1 text-[var(--text-muted)] hover:text-[var(--swa-blue)] active:scale-95 transition-all cursor-pointer"
            >
              <Calendar size={18} className="stroke-[2.2px]" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">
                {currentView === 'grid' ? 'Agenda' : 'Grid'}
              </span>
            </button>

            {/* Today Button */}
            <button
              onClick={() => {
                triggerHaptic();
                onJumpToToday();
              }}
              className="flex flex-col items-center justify-center flex-1 py-1 px-1 text-[var(--text-muted)] hover:text-[var(--swa-blue)] active:scale-95 transition-all cursor-pointer"
            >
              <CalendarCheck size={18} className="stroke-[2.2px]" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">Today</span>
            </button>

            {/* Center Quick-Log Button - Flush inside floating pill with vibrant gradient */}
            <div className="flex-1 flex justify-center">
              <button
                onClick={() => {
                  triggerHaptic();
                  onOpenQuickLog();
                }}
                className="w-11 h-11 rounded-full bg-gradient-to-tr from-[var(--swa-blue)] via-[#1e4fc2] to-[var(--swa-orange)] text-white flex items-center justify-center shadow-md shadow-[var(--swa-blue)]/30 active:scale-90 hover:scale-105 transition-all cursor-pointer"
                aria-label="Quick Log Shift"
                title="Quick Log Shift"
              >
                <Plus size={22} className="stroke-[2.5px]" />
              </button>
            </div>

            {/* Stats Button */}
            <button
              onClick={() => {
                triggerHaptic();
                setActiveSheet(activeSheet === 'stats' ? null : 'stats');
              }}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all cursor-pointer active:scale-95 ${
                activeSheet === 'stats' ? 'text-[var(--swa-blue)] font-black' : 'text-[var(--text-muted)] hover:text-[var(--swa-blue)]'
              }`}
            >
              <BarChart3 size={18} className="stroke-[2.2px]" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">Stats</span>
            </button>

            {/* Menu / Settings Button */}
            <button
              onClick={() => {
                triggerHaptic();
                setActiveSheet(activeSheet === 'menu' ? null : 'menu');
              }}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all cursor-pointer active:scale-95 ${
                activeSheet === 'menu' ? 'text-[var(--swa-blue)] font-black' : 'text-[var(--text-muted)] hover:text-[var(--swa-blue)]'
              }`}
            >
              <Menu size={18} className="stroke-[2.2px]" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">Menu</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Stats Summary Bottom Sheet */}
      {activeSheet === 'stats' && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveSheet(null); }}
        >
          <div className="w-full bg-[var(--card-bg)] border-t border-[var(--border-color)] rounded-t-3xl shadow-2xl p-4 pb-[max(5rem,env(safe-area-inset-bottom))] space-y-3.5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-6">
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto -mt-1 mb-1"></div>
            
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-[var(--swa-blue)]" />
                <h3 className="text-sm font-black text-[var(--text-main)] m-0">Monthly Executive Stats</h3>
              </div>
              <button 
                onClick={() => setActiveSheet(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--hover-bg)] active:scale-90 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-2.5">
                {/* UNPTO Hours */}
                <div className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)]">
                  <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider mb-0.5">UNPTO Hours</div>
                  <div className={`text-xl font-black ${stats.unptoHrs > 0 ? 'text-[var(--swa-red)]' : 'text-[var(--pay-green)]'}`}>
                    {stats.unptoHrs !== undefined ? Number(stats.unptoHrs.toFixed(1)) : 0}<span className="text-xs opacity-60 ml-0.5">h</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    UU Absences: <span className="font-bold text-[var(--text-main)]">{stats.uuCount || 0}</span>
                  </div>
                </div>

                {/* Next Point Drop */}
                <div className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)]">
                  <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider mb-0.5">Next Point Drop</div>
                  <div className="text-xl font-black text-[var(--swa-blue)]">
                    {getDaysUntil(stats.dropDateText) !== null 
                      ? `${getDaysUntil(stats.dropDateText)}d` 
                      : (stats.dropDateText && stats.dropDateText !== 'N/A' ? stats.dropDateText : 'None')}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    Date: <span className="font-bold text-[var(--text-main)]">{stats.dropDateText && stats.dropDateText !== 'N/A' ? stats.dropDateText : 'None'}</span>
                  </div>
                </div>

                {/* Attendance Status */}
                <div className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)]">
                  <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider mb-0.5">Attendance</div>
                  <div className="text-xl font-black" style={{ color: stats.attColor || 'var(--pay-green)' }}>
                    {stats.attLetter || 'Clean'}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    Level: <span className="font-bold text-[var(--text-main)]">{stats.attMet || 0}</span>
                  </div>
                </div>

                {/* PTO Remaining */}
                <div className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)]">
                  <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider mb-0.5">Avail PTO</div>
                  <div className="text-xl font-black text-[var(--swa-blue)]">
                    {formatPto(stats.ptoEnd || 0)}<span className="text-xs opacity-60 ml-0.5">h</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    HOL: <span className="font-bold text-[var(--text-main)]">{stats.holEnd ? (stats.holEnd / 8).toFixed(0) : 0} days</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setActiveSheet(null);
                onOpenModal('ytdSummary');
              }}
              className="w-full py-2.5 rounded-xl bg-[var(--swa-blue)] text-white text-xs font-black uppercase tracking-wider hover:brightness-110 active:scale-98 transition shadow-sm flex items-center justify-center gap-1.5"
            >
              <span>View Full YTD & Pay Breakdown</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Slide-Up Menu Drawer */}
      {activeSheet === 'menu' && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveSheet(null); }}
        >
          <div className="w-full bg-[var(--card-bg)] border-t border-[var(--border-color)] rounded-t-3xl shadow-2xl p-4 pb-[max(5rem,env(safe-area-inset-bottom))] space-y-3.5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-6">
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto -mt-1 mb-1"></div>
            
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
              <div className="flex items-center gap-2">
                <Menu size={18} className="text-[var(--swa-blue)]" />
                <h3 className="text-sm font-black text-[var(--text-main)] m-0">Quick Menu & Tools</h3>
              </div>
              <button 
                onClick={() => setActiveSheet(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--hover-bg)] active:scale-90 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* PWA Home Screen Install Item */}
            <PWAInstallPrompt variant="menu-item" />

            {/* Cloud Sync Status & Actions */}
            <div className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud size={16} className={user ? "text-[var(--pay-green)]" : "text-[var(--text-muted)]"} />
                  <span className="text-xs font-bold text-[var(--text-main)]">
                    {user ? `Signed in as ${user.email?.split('@')[0]}` : 'Cloud Sync (Offline)'}
                  </span>
                </div>
                {user ? (
                  <button 
                    onClick={logout}
                    className="text-[10px] font-black text-[var(--swa-red)] hover:underline"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button 
                    onClick={login}
                    className="px-2.5 py-1 rounded-lg bg-[var(--swa-blue)] text-white text-[10px] font-black uppercase tracking-wider"
                  >
                    Sign In
                  </button>
                )}
              </div>

              {user && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={forceSyncToCloud}
                    className="flex-1 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-main)] flex items-center justify-center gap-1 active:scale-95"
                  >
                    <RefreshCw size={11} />
                    <span>Push to Cloud</span>
                  </button>
                  <button
                    onClick={pullFromCloud}
                    className="flex-1 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-main)] flex items-center justify-center gap-1 active:scale-95"
                  >
                    <Download size={11} />
                    <span>Pull Cloud Data</span>
                  </button>
                </div>
              )}
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setActiveSheet(null);
                  onOpenModal('bidLineImport');
                }}
                className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)] text-left hover:bg-[var(--hover-bg)] active:scale-95 transition"
              >
                <FileSpreadsheet size={16} className="text-[var(--swa-blue)] mb-1" />
                <div className="text-xs font-bold text-[var(--text-main)]">Bid Line (.xlsx)</div>
                <div className="text-[10px] text-[var(--text-muted)]">Select Tab & Line</div>
              </button>

              <button
                onClick={() => {
                  setActiveSheet(null);
                  onOpenSettings();
                }}
                className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)] text-left hover:bg-[var(--hover-bg)] active:scale-95 transition"
              >
                <SettingsIcon size={16} className="text-[var(--swa-blue)] mb-1" />
                <div className="text-xs font-bold text-[var(--text-main)]">Settings</div>
                <div className="text-[10px] text-[var(--text-muted)]">Salary, Hire Date, Levels</div>
              </button>

              <button
                onClick={() => {
                  setActiveSheet(null);
                  onOpenModal('fmlaManager');
                }}
                className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)] text-left hover:bg-[var(--hover-bg)] active:scale-95 transition"
              >
                <ShieldCheck size={16} className="text-[var(--swa-yellow)] mb-1" />
                <div className="text-xs font-bold text-[var(--text-main)]">FMLA & Cases</div>
                <div className="text-[10px] text-[var(--text-muted)]">Balances and Expirations</div>
              </button>

              <button
                onClick={() => {
                  setActiveSheet(null);
                  onOpenModal('payHistory');
                }}
                className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)] text-left hover:bg-[var(--hover-bg)] active:scale-95 transition"
              >
                <DollarSign size={16} className="text-[var(--pay-green)] mb-1" />
                <div className="text-xs font-bold text-[var(--text-main)]">Pay Tables</div>
                <div className="text-[10px] text-[var(--text-muted)]">Step Scales & Rates</div>
              </button>

              <button
                onClick={() => {
                  setActiveSheet(null);
                  onOpenGuide();
                }}
                className="p-3 rounded-2xl bg-[var(--sub-bg)] border border-[var(--border-color)] text-left hover:bg-[var(--hover-bg)] active:scale-95 transition"
              >
                <CalendarCheck size={16} className="text-purple-500 mb-1" />
                <div className="text-xs font-bold text-[var(--text-main)]">User Guide</div>
                <div className="text-[10px] text-[var(--text-muted)]">Rules & Shift Codes</div>
              </button>
            </div>

            {/* Theme Toggle */}
            <div className="pt-1 flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[var(--text-muted)]">Color Theme:</span>
              <div className="flex gap-1.5">
                {(['light', 'dark', 'ocean', 'sunset', 'forest'] as ThemeType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTheme(t)}
                    className={`px-2 py-1 rounded-lg text-xs capitalize font-bold transition ${
                      theme === t
                        ? 'bg-[var(--swa-blue)] text-white shadow-xs'
                        : 'bg-[var(--sub-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
