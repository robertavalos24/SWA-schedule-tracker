import React, { useState, useRef, useEffect } from 'react';
import { Share2, LogIn, LogOut, Database, Download, Upload, Cloud, AlertTriangle, RefreshCw } from 'lucide-react';
import { ThemeType, CloudSyncState } from '../types';
import { User } from 'firebase/auth';
import { useModalStore } from '../store/useModalStore';
import { PWAInstallPrompt } from './PWAInstallPrompt';

interface HeaderProps {
  theme: ThemeType;
  toggleTheme: (theme?: ThemeType) => void;
  openSettings: () => void;
  openGuide: () => void;
  isLocked: boolean;
  user?: User | null;
  cloudSyncState?: CloudSyncState;
  cloudSyncError?: string | null;
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

export const BUILD_ID = '2026-11-12 18:10 PST';

const themes: ThemeType[] = ['light', 'dark', 'ocean', 'sunset', 'forest'];

export const Header: React.FC<HeaderProps> = ({
  theme,
  toggleTheme,
  openSettings,
  openGuide,
  isLocked,
  user,
  cloudSyncState = 'idle',
  cloudSyncError = null,
  login,
  logout,
  backupToSheets,
  forceSyncToCloud,
  pullFromCloud
}) => {
  const { openModal } = useModalStore();
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
      title: 'LUV TRACKER — SWA Schedule & Attendance',
      text: `Check out my LUV TRACKER SWA Attendance & Pay Tracker`,
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
      const subject = encodeURIComponent(`Check out LUV TRACKER — SWA Schedule & Attendance`);
      const body = encodeURIComponent(`Hey, check out this LUV TRACKER SWA Attendance & Pay tracker I'm using: ${url}`);
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
              LUV TRACKER
              <span className="hidden xs:inline text-[10px] sm:text-xs font-semibold not-italic px-1.5 py-0.5 rounded-full bg-white/15 border border-white/25">2.0</span>
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] sm:text-[11px] text-white/70 font-medium tracking-wide hidden sm:inline">SWA Attendance & Pay Portal</span>
              <span className="text-[9px] sm:text-[10px] text-white/60 font-mono tracking-tight" data-testid="build-id">
                Build {BUILD_ID}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Cloud Sync Auth Button */}
          {user ? (
            <div className="flex items-center gap-1 sm:gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15">
              {cloudSyncState === 'error' || cloudSyncError ? (
                <button
                  className="bg-rose-500/25 text-rose-200 border border-rose-400/50 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] font-bold hover:bg-rose-500/35 transition-all flex items-center gap-1.5 cursor-pointer"
                  onClick={() => openModal('cloudStatus')}
                  title={`Sync Failed: ${cloudSyncError || 'Unable to sync with Firestore'}. Click for details.`}
                >
                  <AlertTriangle size={13} className="text-rose-300 shrink-0" />
                  <span>Sync Failed</span>
                </button>
              ) : cloudSyncState === 'syncing' ? (
                <button
                  className="bg-sky-500/20 text-sky-100 border border-sky-400/30 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] font-bold hover:bg-sky-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  onClick={() => openModal('cloudStatus')}
                  title={`Syncing schedule for ${user.email}...`}
                >
                  <RefreshCw size={12} className="text-sky-300 animate-spin shrink-0" />
                  <span className="hidden md:inline">Syncing...</span>
                </button>
              ) : cloudSyncState === 'synced' ? (
                <button 
                  className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] font-bold hover:bg-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  onClick={() => openModal('cloudStatus')}
                  title={`Cloud synced as ${user.email}. Click for Cloud & Firebase Diagnostics.`}
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-3.5 h-3.5 rounded-full" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  )}
                  <span className="hidden md:inline">Cloud Active</span>
                </button>
              ) : (
                <button
                  className="bg-white/15 text-white/90 border border-white/25 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] font-bold hover:bg-white/25 transition-all flex items-center gap-1.5 cursor-pointer"
                  onClick={() => openModal('cloudStatus')}
                  title={`Signed in as ${user.email} (waiting for Push or Pull). Click for Cloud Diagnostics.`}
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-3.5 h-3.5 rounded-full" />
                  ) : (
                    <Cloud size={12} className="text-white/80 shrink-0" />
                  )}
                  <span className="hidden md:inline">Signed In</span>
                </button>
              )}

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

              <button
                className="text-white/70 hover:text-white hover:bg-white/15 rounded-lg p-1 text-[11px] transition-all cursor-pointer"
                onClick={logout}
                title="Sign out of Firebase account"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button 
                className="bg-white/15 hover:bg-white/25 border border-white/20 text-white rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                onClick={login}
                title="Sign in to sync your schedule across devices"
              >
                <LogIn size={13} />
                <span>Sync Cloud</span>
              </button>
              <button
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl p-1.5 sm:p-2 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                onClick={() => openModal('cloudStatus')}
                title="Firebase & Cloud Diagnostics"
              >
                <Cloud size={13} />
              </button>
            </div>
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

          {/* PWA Install Button */}
          <PWAInstallPrompt variant="button" />

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

      {user && (cloudSyncState === 'error' || cloudSyncError) && (
        <div className="bg-rose-950/90 border-t border-rose-500/40 px-3 sm:px-6 py-1.5 text-rose-100 text-[11px] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
            <span className="font-semibold truncate">
              Cloud Sync Error: {cloudSyncError || 'Failed to sync changes to Firestore.'}
            </span>
          </div>
          <button
            onClick={forceSyncToCloud}
            className="px-2.5 py-0.5 rounded bg-rose-500 hover:bg-rose-400 text-white font-bold text-[10px] shrink-0 cursor-pointer transition-colors"
          >
            Retry Push
          </button>
        </div>
      )}
    </header>
  );
};
