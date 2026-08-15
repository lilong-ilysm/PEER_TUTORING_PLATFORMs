/**
 * Toast notifications for background actions.
 *
 * Messages are announced through a polite live region so a screen-reader user
 * learns that an action succeeded, rather than being left guessing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from '../components/ui/icons';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, tone, message }]);
      // Errors stay until dismissed; they usually need reading and acting on.
      if (tone !== 'error') {
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  const tones: Record<ToastTone, { classes: string; icon: ReactNode }> = {
    success: {
      classes: 'border-emerald-300 bg-emerald-50 text-emerald-900',
      icon: <CheckIcon />,
    },
    error: { classes: 'border-rose-300 bg-rose-50 text-rose-900', icon: <AlertIcon /> },
    info: { classes: 'border-sky-300 bg-sky-50 text-sky-900', icon: <InfoIcon /> },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        // Sits above the mobile tab bar so it never covers navigation.
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        role="region"
        aria-label="Notifications"
      >
        <div aria-live="polite" aria-atomic="false" className="sr-only">
          {toasts.map((toast) => (
            <p key={toast.id}>{toast.message}</p>
          ))}
        </div>

        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-pop animate-slide-up',
              tones[toast.tone].classes,
            )}
          >
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
              {tones[toast.tone].icon}
            </span>
            <p className="user-text min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 text-base opacity-70 hover:opacity-100"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return context;
}
