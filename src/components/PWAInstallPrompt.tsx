import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2, ChevronRight } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallPromptProps {
  variant?: 'banner' | 'button' | 'menu-item';
  onInstalled?: () => void;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ variant = 'banner', onInstalled }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = sessionStorage.getItem('pwa_prompt_dismissed');
    if (isDismissed === 'true') {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (isInstallable) {
      const success = await install();
      if (success && onInstalled) {
        onInstalled();
      }
    }
  };

  // If already installed running in standalone app mode, hide prompt
  if (isInstalled) {
    return null;
  }

  // Variant: Button for header / settings bar
  if (variant === 'button') {
    if (!isInstallable && !isIOS) return null;

    return (
      <>
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all cursor-pointer active:scale-95 shadow-sm"
          title="Install LUV TRACKER App on your device"
        >
          <Smartphone size={13} className="text-[var(--swa-yellow)]" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
        )}
      </>
    );
  }

  // Variant: Menu Item in mobile slide-over or settings
  if (variant === 'menu-item') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[var(--swa-blue)]/15 to-transparent border border-[var(--swa-blue)]/30 text-[var(--swa-blue)] dark:text-blue-300 font-bold text-xs text-left transition-all hover:bg-[var(--swa-blue)]/20 active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--swa-blue)] text-white shadow-sm">
              <Smartphone size={15} />
            </div>
            <div>
              <div className="font-extrabold text-[13px] text-[var(--text-main)]">Add to Home Screen</div>
              <div className="text-[10px] text-[var(--text-muted)] font-medium">Use full-screen like a native phone app</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--text-muted)]" />
        </button>

        {showIOSGuide && (
          <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
        )}
      </>
    );
  }

  // Variant: Banner (Subtle top/bottom banner on mobile)
  if (dismissed || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      <div className="md:hidden mx-3 mb-3 p-3 rounded-2xl bg-gradient-to-r from-[var(--card-bg)] to-[var(--sub-bg)] border border-[var(--swa-blue)]/30 shadow-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--swa-blue)] flex items-center justify-center text-white shrink-0 shadow-sm">
            <Smartphone size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-[var(--text-main)] tracking-tight">Install LUV TRACKER</div>
            <div className="text-[10px] text-[var(--text-muted)] font-semibold truncate">Full-screen phone experience</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-xl bg-[var(--swa-blue)] text-white text-[11px] font-black uppercase tracking-wider shadow-sm hover:brightness-110 active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <Download size={12} />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
      )}
    </>
  );
};

const IOSInstallModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-[var(--card-bg)] border border-[var(--border-color)] p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--swa-blue)] flex items-center justify-center text-white shadow-sm">
              <Smartphone size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-[var(--text-main)] m-0">Install on iPhone / iPad</h3>
              <p className="text-[10px] text-[var(--text-muted)] font-semibold m-0">Add LUV TRACKER to your home screen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--hover-bg)] active:scale-90 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 py-1">
          <div className="flex items-start gap-3 bg-[var(--sub-bg)] p-3 rounded-2xl border border-[var(--border-color)]">
            <div className="w-7 h-7 rounded-lg bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-black flex items-center justify-center shrink-0 text-xs">
              1
            </div>
            <div className="text-xs text-[var(--text-main)] font-medium leading-relaxed">
              Tap the <span className="font-bold text-[var(--swa-blue)] inline-flex items-center gap-0.5"><Share size={12} /> Share</span> button at the bottom of Safari.
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[var(--sub-bg)] p-3 rounded-2xl border border-[var(--border-color)]">
            <div className="w-7 h-7 rounded-lg bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-black flex items-center justify-center shrink-0 text-xs">
              2
            </div>
            <div className="text-xs text-[var(--text-main)] font-medium leading-relaxed">
              Scroll down and tap <span className="font-bold text-[var(--swa-blue)] inline-flex items-center gap-0.5"><PlusSquare size={12} /> Add to Home Screen</span>.
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[var(--sub-bg)] p-3 rounded-2xl border border-[var(--border-color)]">
            <div className="w-7 h-7 rounded-lg bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-black flex items-center justify-center shrink-0 text-xs">
              3
            </div>
            <div className="text-xs text-[var(--text-main)] font-medium leading-relaxed">
              Tap <span className="font-bold text-[var(--pay-green)]">Add</span> in the top right. A shortcut icon will appear on your Home Screen for instant 1-tap access!
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-200 flex items-start gap-2">
          <CheckCircle2 size={16} className="text-[var(--swa-blue)] shrink-0 mt-0.5" />
          <span>Opening from your Home Screen shortcut will keep your schedule, sync, and preferences intact with zero sign-in issues.</span>
        </div>

        {typeof window !== 'undefined' && window.location.hostname.includes('ais-dev-') && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[10px] text-amber-800 dark:text-amber-300 leading-normal">
            <span className="font-bold">Pro Tip:</span> Click <strong>Share</strong> in AI Studio on your desktop to activate your public shared link (<code>ais-pre-...</code>). Adding the shared link to your Home Screen prevents any Google session 401 timeouts!
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[var(--swa-blue)] text-white text-xs font-black uppercase tracking-wider hover:brightness-110 active:scale-98 transition shadow-md"
        >
          Got It
        </button>
      </div>
    </div>
  );
};
