import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error('LUV TRACKER Error Caught by Boundary:', error, errorInfo);
  }

  private handleEmergencyExport = () => {
    try {
      const backup: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('swa_')) {
          backup[key] = localStorage.getItem(key);
        }
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LUV_TRACKER_Emergency_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not export emergency backup: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-6 font-sans">
          <div className="max-w-lg w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl flex flex-col gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 text-2xl font-black">
              ✈️
            </div>
            
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white mb-2">LUV TRACKER Encountered an Issue</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your schedule and attendance data in local storage is safe. You can reload the page or export an emergency backup copy of your data.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 p-4 rounded-xl text-left border border-slate-800 text-xs font-mono text-amber-300/90 overflow-x-auto max-h-36">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 px-5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-sm transition-all shadow-md cursor-pointer"
              >
                Reload App
              </button>
              <button
                onClick={this.handleEmergencyExport}
                className="flex-1 py-3 px-5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 font-bold rounded-xl text-sm transition-all border border-slate-600 cursor-pointer"
              >
                Download Data Backup
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

