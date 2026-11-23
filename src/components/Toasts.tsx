import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon } from './icons';

export type ToastKind = 'error' | 'info' | 'success';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run(): void };
  persist?: boolean;
}

export interface ToastInput {
  kind?: ToastKind;
  message: string;
  action?: Toast['action'];
  /** Stable key: a new toast with the same key replaces the old one instead of stacking. */
  key?: string;
  /** Stay until dismissed, whatever the kind. */
  persist?: boolean;
}

/** Errors stay until dismissed; everything else fades on its own. */
const LIFETIME: Record<ToastKind, number | null> = { error: null, info: 7000, success: 3200 };
const MAX_TOASTS = 4;

export function useToasts() {
  const [toasts, setToasts] = useState<(Toast & { key?: string })[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback((input: ToastInput | string) => {
    const t = typeof input === 'string' ? { message: input } : input;
    const toast = { id: nextId.current++, kind: t.kind ?? 'info', message: t.message, action: t.action, key: t.key, persist: t.persist };
    setToasts((ts) => {
      const kept = ts.filter((x) => (toast.key ? x.key !== toast.key : x.message !== toast.message));
      return [...kept, toast].slice(-MAX_TOASTS);
    });
    return toast.id;
  }, []);

  const clear = useCallback((kind?: ToastKind) => setToasts((ts) => (kind ? ts.filter((t) => t.kind !== kind) : [])), []);

  return { toasts, push, dismiss, clear };
}

function ToastItem({ toast, onDismissId }: { toast: Toast; onDismissId(id: number): void }) {
  const [paused, setPaused] = useState(false);
  const onDismiss = useCallback(() => onDismissId(toast.id), [onDismissId, toast.id]);
  const life = toast.persist ? null : LIFETIME[toast.kind];
  useEffect(() => {
    if (life === null || paused) return;
    const id = window.setTimeout(onDismiss, life);
    return () => clearTimeout(id);
  }, [life, paused, onDismiss]);

  const tone =
    toast.kind === 'error'
      ? 'border-rose-400/30 bg-rose-950/85 text-rose-50'
      : toast.kind === 'success'
        ? 'border-emerald-300/25 bg-emerald-950/85 text-emerald-50'
        : 'border-white/12 bg-[rgb(20_22_34/0.92)] text-white/90';

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-2xl shadow-black/40 backdrop-blur-md ${tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toast.kind === 'success' && <CheckIcon className="mt-0.5 shrink-0 text-emerald-300" />}
      <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            onDismiss();
          }}
          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:underline"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={onDismiss} className="-mr-1 shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

export function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss(id: number): void }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-50 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 flex-col gap-2"
      style={{ top: 'calc(var(--header-h, 72px) + 8px)' }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismissId={onDismiss} />
      ))}
    </div>
  );
}
