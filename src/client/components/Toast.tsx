import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * Application-wide notification surface.
 *
 * Replaces window.alert(), which blocks the Electron main thread, cannot be styled, and is not
 * available at all in some embedded contexts - and replaces the several places where a failed API
 * call went to console.warn and the user simply saw nothing happen.
 */

export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
}

interface ToastContextValue {
  notify: (kind: ToastKind, message: string, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  // Errors stay until dismissed: they usually carry the only copy of a failure message.
  error: 0,
};

let nextId = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string, detail?: string) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, kind, message, detail }]);

      const timeout = AUTO_DISMISS_MS[kind];
      if (timeout > 0) {
        setTimeout(() => dismiss(id), timeout);
      }
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (message, detail) => notify('success', message, detail),
      error: (message, detail) => notify('error', message, detail),
      info: (message, detail) => notify('info', message, detail),
    }),
    [notify]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const KIND_STYLES: Record<ToastKind, { border: string; icon: React.ReactNode }> = {
  success: {
    border: 'border-emerald-500/50',
    icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />,
  },
  error: {
    border: 'border-red-500/50',
    icon: <AlertCircle className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />,
  },
  info: {
    border: 'border-cyan-500/50',
    icon: <Info className="h-5 w-5 shrink-0 text-cyan-400" aria-hidden="true" />,
  },
};

const ToastCard: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const style = KIND_STYLES[toast.kind];

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border ${style.border} bg-[#111827] p-3 shadow-lg`}
    >
      {style.icon}
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-slate-100">{toast.message}</p>
        {toast.detail && <p className="mt-1 break-words text-xs text-slate-400">{toast.detail}</p>}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-1 text-slate-500 hover:bg-[#1e293b] hover:text-slate-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return ctx;
}
