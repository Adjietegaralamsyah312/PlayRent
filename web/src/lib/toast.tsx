import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Undo / retry affordance — rendered as a ghost button. */
  action?: { label: string; onClick: () => void };
  /** Autodismiss ms. 0 = sticky (errors with actions). */
  duration: number;
}

interface ToastApi {
  toast: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  success: (message: string, action?: Toast['action']) => string;
  error: (message: string, action?: Toast['action']) => string;
  warning: (message: string) => string;
  info: (message: string) => string;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-success/40 bg-success-soft text-success',
  error: 'border-danger/40 bg-danger-soft text-danger-text',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  info: 'border-info/40 bg-info-soft text-info',
};

let seq = 0;
const nextId = () => `t${++seq}-${Date.now()}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // One timer per toast — cleared when the toast is dismissed or the provider
  // unmounts, so a closed toast never keeps a timer alive (FE-020).
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>((input) => {
    const id = nextId();
    const duration = input.duration ?? (input.action ? 8000 : 4200);
    setToasts((list) => [...list, { ...input, id, duration }].slice(-3));
    if (duration > 0) {
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  // Every pending timer dies with the provider.
  useEffect(() => () => {
    timers.current.forEach((handle) => window.clearTimeout(handle));
    timers.current.clear();
  }, []);

  const api = useMemo<ToastApi>(() => ({
    toast,
    dismiss,
    success: (message, action) => toast({ tone: 'success', message, action }),
    error: (message, action) => toast({ tone: 'error', message, action, duration: action ? 0 : 6000 }),
    warning: (message) => toast({ tone: 'warning', message, duration: 6000 }),
    info: (message) => toast({ tone: 'info', message }),
  }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast)] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 pb-[var(--spacing-safe-bottom)]"
        role="region"
        aria-label="Notifikasi"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
              className={`pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-e3)] ${TONE_CLASS[t.tone]}`}
              style={{ animation: 'pr-slide-up var(--duration-base) var(--ease-out)' }}
            >
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-body-sm leading-snug text-text">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action?.onClick(); dismiss(t.id); }}
                  className="shrink-0 rounded-[var(--radius-sm)] px-2 py-0.5 text-label font-[var(--font-weight-medium)] text-text underline-offset-2 hover:underline"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-text-muted hover:text-text"
                aria-label="Tutup notifikasi"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
