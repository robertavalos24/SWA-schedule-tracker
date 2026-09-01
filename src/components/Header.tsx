import React, { useState, useRef, useEffect } from 'react';
import { Share2, LogIn, LogOut, Database, Download, Upload } from 'lucide-react';
import { ThemeType } from '../types';
import { User } from 'firebase/auth';

interface HeaderProps {
  theme: ThemeType;
  toggleTheme: (theme?: ThemeType) => void;
  openSettings: () => void;
  openGuide: () => void;
  isLocked: boolean;
  user?: User | null;
  login: () => void;
  logout: () => void;
  backupToSheets: () => void;
  forceSyncToCloud: () => void;
  pullFromCloud: () => void;
}

const themeIcons: Record<ThemeType, string> = {
  light: '☀️',
  dark: '🌙',
  ocean: '🌊',
  sunset: '🌅',
  forest: '🌲'
};

const themes: ThemeType[] = ['light', 'dark', 'ocean', 'sunset', 'forest'];

export const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, openSettings, openGuide, isLocked, user, login, logout, backupToSheets, forceSyncToCloud, pullFromCloud }) => {
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: 'SWA Schedule & Attendance',
      text: `Check out my SWA Schedule & Attendance app`,
      url: url,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      const subject = encodeURIComponent(`Check out my SWA Schedule & Attendance app`);
      const body = encodeURIComponent(`Hey, check out this SWA Schedule & Attendance tracker I'm using: ${url}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[var(--header-bg)] text-white shadow-md border-b-[4px] border-[var(--header-border)] transition-colors backdrop-blur-md">
      {/* Top Tri-Color Airline Stripe */}
      <div className="w-full h-1 flex">
        <div className="flex-1 bg-[var(--swa-blue)]"></div>
        <div className="flex-1 bg-[var(--swa-red)]"></div>
        <div className="flex-1 bg-[var(--swa-yellow)]"></div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 flex items-center justify-center bg-white/10 rounded-xl p-1 border border-white/20 shadow-inner">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
              <path d="M50 90 C 20 70, 5 50, 5 30 A 20 20 0 0 1 45 30 A 20 20 0 0 1 85 30 C 85 50, 70 70, 50 90" fill="var(--swa-red)" />
              <path d="M50 90 C 20 70, 5 50, 5 30 A 20 20 0 0 1 45 30 A 20 20 0 0 1 85 30 C 85 50, 70 70, 50 90" fill="var(--swa-yellow)" transform="scale(0.7) translate(21, 15)" />
              <path d="M50 90 C 20 70, 5 50, 5 30 A 20 20 0 0 1 45 30 A 20 20 0 0 1 85 30 C 85 50, 70 70, 50 90" fill="var(--swa-blue)" transform="scale(0.4) translate(75, 50)" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm sm:text-lg tracking-tight italic flex items-center gap-1.5">
              SWA Schedule
              <span className="hidden xs:inline text-[10px] sm:text-xs font-semibold not-italic px-1.5 py-0.5 rounded-full bg-white/15 border border-white/25">2.0</span>
            </span>
            <span className="text-[10px] sm:text-[11px] text-white/70 font-medium tracking-wide hidden sm:block">Attendance & Pay Portal</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Cloud Sync Auth Button */}
          {user ? (
            <div className="flex items-center gap-1 sm:gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15">
              <button 
                className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] font-bold hover:bg-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                onClick={logout}
                title={`Signed in as ${user.email}. Click to sign out.`}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-3.5 h-3.5 rounded-full" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
                <span className="hidden md:inline">Cloud Active</span>
              </button>

              <button 
                className="bg-[var(--swa-orange)] hover:brightness-110 text-white rounded-lg px-2 py-1 text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                onClick={pullFromCloud}
                title="Pull latest data from Firebase cloud"
              >
                <Download size={12} />
                <span className="hidden lg:inline">Pull</span>
              </button>

              <button 
                className="bg-[var(--swa-blue)] hover:brightness-110 text-white rounded-lg px-2 py-1 text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                onClick={forceSyncToCloud}
                title="Push local data to Firebase cloud"
              >
                <Upload size={12} />
                <span className="hidden lg:inline">Push</span>
              </button>
            </div>
          ) : (
            <button 
              className="bg-white/15 hover:bg-white/25 border border-white/20 text-white rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              onClick={login}
              title="Sign in to sync your schedule across devices"
            >
              <LogIn size={13} />
              <span>Sync Cloud</span>
            </button>
          )}

          {/* Backup to Sheets Button */}
          <button 
            className="bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-400/40 text-white rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold transition-all items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer hidden md:flex"
            onClick={backupToSheets}
            title="Backup to Google Sheets"
          >
            <Database size={13} />
            <span className="hidden xl:inline">Google Sheets</span>
          </button>

          {/* Share Button */}
          <button 
            className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            onClick={handleShare}
            title="Share App"
          >
            <Share2 size={13} />
            <span className="hidden lg:inline">Share</span>
          </button>

          {/* Theme Selector */}
          <div className="relative" ref={dropdownRef}>
            <button 
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
              title="Change Theme"
            >
              <span>{themeIcons[theme]}</span>
              <span className="hidden sm:inline capitalize">{theme}</span>
              <span className="text-[9px] opacity-70">▼</span>
            </button>
            
            {isThemeDropdownOpen && (
              <div className="absolute top-full mt-2 right-0 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden z-50 min-w-[150px] p-1 animate-in fade-in slide-in-from-top-2 duration-150">
                {themes.map(t => (
                  <button
                    key={t}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold capitalize flex items-center gap-2 transition-colors cursor-pointer ${theme === t ? 'text-[var(--swa-blue)] bg-[var(--swa-blue)]/10 font-black' : 'text-[var(--text-main)] hover:bg-[var(--hover-bg)]'}`}
                    onClick={() => {
                      toggleTheme(t);
                      setIsThemeDropdownOpen(false);
                    }}
                  >
                    <span className="text-sm">{themeIcons[t]}</span>
                    <span>{t}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings Button */}
          <button 
            className={`border rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5 ${isLocked ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed' : 'bg-white/10 border-white/20 text-white hover:bg-white/20 cursor-pointer'}`}
            onClick={() => { if (!isLocked) openSettings(); }}
            disabled={isLocked}
            title="App Settings"
          >
            ⚙️ <span className="hidden sm:inline">Settings</span>
          </button>

          {/* User Guide Button */}
          <button 
            className="bg-white/10 border border-white/20 text-white rounded-xl w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center font-black text-xs sm:text-sm hover:bg-white/20 transition-all shadow-sm active:scale-95 cursor-pointer"
            onClick={openGuide}
            title="User Guide"
          >
            ?
          </button>
        </div>
      </div>
    </header>
  );
};
