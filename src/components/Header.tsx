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
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsThemeDropdownOpen(false);
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
    <header className="bg-[var(--header-bg)] text-white p-5 pb-2.5 flex items-center justify-between border-b-[5px] border-[var(--header-border)] shadow-md flex-wrap gap-2.5 transition-colors relative z-50">
      <div className="absolute top-0 left-0 w-full h-1 flex">
        <div className="flex-1 bg-[var(--swa-blue)] transition-colors"></div>
        <div className="flex-1 bg-[var(--swa-red)] transition-colors"></div>
        <div className="flex-1 bg-[var(--swa-yellow)] transition-colors"></div>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <div className="w-6 h-6 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
            <path d="M50 90 C 20 70, 5 50, 5 30 A 20 20 0 0 1 45 30 A 20 20 0 0 1 85 30 C 85 50, 70 70, 50 90" fill="var(--swa-red)" className="transition-colors" />
            <path d="M50 90 C 20 70, 5 50, 5 30 A 20 20 0 0 1 45 30 A 20 20 0 0 1 85 30 C 85 50, 70 70, 50 90" fill="var(--swa-yellow)" transform="scale(0.7) translate(21, 15)" className="transition-colors" />
            <path d="M50 90 C 20 70, 5 50, 5 30 A 20 20 0 0 1 45 30 A 20 20 0 0 1 85 30 C 85 50, 70 70, 50 90" fill="var(--swa-blue)" transform="scale(0.4) translate(75, 50)" className="transition-colors" />
          </svg>
        </div>
        <div className="font-black text-xl italic whitespace-nowrap">SWA Schedule & Attendance</div>
      </div>
      <div className="flex gap-2.5 mt-2.5 items-center">
        {user ? (
          <button 
            className="bg-white/10 border border-white/20 text-white rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 cursor-pointer text-xs font-bold hover:bg-white/20 transition-all flex items-center gap-1 sm:gap-1.5 shadow-sm active:scale-95"
            onClick={logout}
            title={`Signed in as ${user.email}. Click to sign out.`}
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-4 h-4 rounded-full" />
            ) : (
              <LogOut size={13} />
            )}
            <span className="text-[10px] sm:text-xs text-green-200 font-bold">Synced</span>
          </button>
        ) : (
          <button 
            className="bg-white/10 border border-white/20 text-white rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 cursor-pointer text-xs font-bold hover:bg-white/20 transition-all flex items-center gap-1 sm:gap-1.5 shadow-sm active:scale-95"
            onClick={login}
            title="Sign in to sync your data across devices"
          >
            <LogIn size={13} />
            <span className="text-[10px] sm:text-xs text-blue-200 font-bold">Sync Data</span>
          </button>
        )}
        {user && (
          <>
            <button 
              className="bg-[var(--swa-orange)] border border-white/20 text-white rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 cursor-pointer text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1 sm:gap-1.5 shadow-sm active:scale-95"
              onClick={pullFromCloud}
              title="Force pull data down from the cloud (overwrites local)"
            >
              <Download size={13} />
              <span className="text-[10px] sm:text-xs">Pull Cloud</span>
            </button>
            <button 
              className="bg-[var(--swa-blue)] border border-white/20 text-white rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 cursor-pointer text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1 sm:gap-1.5 shadow-sm active:scale-95"
              onClick={forceSyncToCloud}
              title="Force push your local device data up to the cloud"
            >
              <Upload size={13} />
              <span className="text-[10px] sm:text-xs">Push Local</span>
            </button>
          </>
        )}
        <button 
          className="bg-[var(--pay-green)] border border-white/20 text-white rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 cursor-pointer text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1 sm:gap-1.5 shadow-sm active:scale-95 hidden md:flex"
          onClick={backupToSheets}
          title="Backup to Google Sheets"
        >
          <Database size={13} />
          <span className="text-[10px] sm:text-xs">Backup to Sheets</span>
        </button>
        <button 
          className="bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2 cursor-pointer text-xs font-bold hover:bg-white/20 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          onClick={handleShare}
          title="Share via Email"
        >
          <Share2 size={14} />
          <span className="hidden sm:inline">Share</span>
        </button>
        <div className="relative" ref={dropdownRef}>
          <button 
            className="bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2 cursor-pointer text-xs font-bold hover:bg-white/20 transition-all capitalize flex items-center gap-1.5 shadow-sm active:scale-95"
            onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
          >
            <span>{themeIcons[theme]}</span>
            <span className="hidden sm:inline">{theme}</span>
            <span className="text-[10px] ml-1 opacity-70">▼</span>
          </button>
          
          {isThemeDropdownOpen && (
            <div className="absolute top-full mt-2 right-0 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden z-50 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-200">
              {themes.map(t => (
                <button
                  key={t}
                  className={`w-full text-left px-4 py-3 text-xs font-bold capitalize flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${theme === t ? 'text-[var(--swa-blue)] bg-[var(--swa-blue)]/5' : 'text-[var(--text-main)]'}`}
                  onClick={() => {
                    toggleTheme(t);
                    setIsThemeDropdownOpen(false);
                  }}
                >
                  <span>{themeIcons[t]}</span>
                  <span>{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button 
          className={`border rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5 ${isLocked ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed' : 'bg-white/10 border-white/20 text-white hover:bg-white/20 cursor-pointer'}`}
          onClick={() => { if (!isLocked) openSettings(); }}
          disabled={isLocked}
        >
          ⚙️ <span className="hidden sm:inline">Settings</span>
        </button>
        <button 
          className="bg-white/10 border border-white/20 text-white rounded-xl w-9 h-9 flex items-center justify-center cursor-pointer text-sm font-bold hover:bg-white/20 transition-all shadow-sm active:scale-95"
          onClick={openGuide}
          title="User Guide"
        >
          ?
        </button>
      </div>
    </header>
  );
};
