import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker for offline caching and Home Screen execution in production,
// and unregister any stale development service worker that causes 401 session errors on dev previews.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    }).catch(() => {});
  } else {
    let swRegistration: ServiceWorkerRegistration | undefined;
    let isReloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isReloading) {
        isReloading = true;
        window.location.reload();
      }
    });

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateSW(true);
      },
      onRegisteredSW(_swUrl, registration) {
        swRegistration = registration;
      },
    });

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        try {
          const reg = swRegistration || (await navigator.serviceWorker.getRegistration());
          if (reg) {
            await reg.update();
            if (reg.waiting) {
              await updateSW(true);
              if (!isReloading) {
                isReloading = true;
                window.location.reload();
              }
            }
          }
        } catch {
          // Ignore transient offline errors during SW update check
        }
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
