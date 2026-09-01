import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[2000] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border pointer-events-auto transform transition-all duration-300 translate-y-0 opacity-100 ${
              toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/80 dark:border-emerald-800 dark:text-emerald-100' :
              toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/80 dark:border-red-800 dark:text-red-100' :
              'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/80 dark:border-blue-800 dark:text-blue-100'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-500 dark:text-emerald-400" />}
            {toast.type === 'error' && <AlertCircle size={18} className="text-red-500 dark:text-red-400" />}
            {toast.type === 'info' && <Info size={18} className="text-blue-500 dark:text-blue-400" />}
            
            <span className="text-sm font-medium">{toast.message}</span>
            
            <button 
              onClick={() => removeToast(toast.id)}
              className="ml-2 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
