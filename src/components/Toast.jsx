import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

/* ─── Toast context / hook ────────────────────────────── */
const ToastContext = React.createContext(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.showToast;
}

/* ─── Individual toast ────────────────────────────────── */
const ICONS = {
  success: <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />,
  error:   <XCircle      size={15} className="shrink-0 text-rose-400" />,
  info:    <Info         size={15} className="shrink-0 text-indigo-400" />,
  warning: <AlertTriangle size={15} className="shrink-0 text-amber-400" />,
};

const ACCENT = {
  success: 'border-emerald-500/25 shadow-emerald-500/8',
  error:   'border-rose-500/25    shadow-rose-500/8',
  info:    'border-indigo-500/25  shadow-indigo-500/8',
  warning: 'border-amber-500/25   shadow-amber-500/8',
};

const BAR_COLOR = {
  success: 'bg-emerald-500',
  error:   'bg-rose-500',
  info:    'bg-indigo-500',
  warning: 'bg-amber-500',
};

function ToastItem({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 320);
  }, [toast.id, onRemove]);

  useEffect(() => {
    const duration = toast.duration ?? 3800;
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [dismiss, toast.duration]);

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3.5 rounded-2xl
        border shadow-[0_8px_32px_-8px]
        backdrop-blur-xl overflow-hidden
        min-w-[280px] max-w-[380px]
        cursor-default select-none
        ${ACCENT[toast.type] ?? ACCENT.info}
        transition-all duration-300
        ${exiting
          ? 'opacity-0 translate-x-6 scale-95'
          : 'opacity-100 translate-x-0 scale-100 toast-animate'}
      `}
      style={{
        background: 'linear-gradient(135deg, rgba(12,14,28,0.96) 0%, rgba(9,11,22,0.98) 100%)',
      }}
    >
      {/* Progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-[2px] rounded-full ${BAR_COLOR[toast.type] ?? BAR_COLOR.info} opacity-60`}
        style={{
          width: '100%',
          animation: `toastProgress ${toast.duration ?? 3800}ms linear forwards`,
        }}
      />

      {/* Icon */}
      <span className="mt-0.5">{ICONS[toast.type] ?? ICONS.info}</span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-[13px] font-semibold text-white leading-snug">{toast.title}</p>
        )}
        {toast.message && (
          <p className={`text-[12px] text-slate-400 leading-relaxed ${toast.title ? 'mt-0.5' : 'text-white font-medium'}`}>
            {toast.message}
          </p>
        )}
      </div>

      {/* Action — used for undo. Firing it dismisses the toast, so the
          window to act is exactly the toast's lifetime. */}
      {toast.action && (
        <button
          onClick={() => { toast.action.onClick(); dismiss(); }}
          className="shrink-0 mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-bold
            text-sky-300 bg-sky-500/[0.12] border border-sky-500/25
            hover:bg-sky-500/[0.2] transition-all cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={dismiss}
        className="p-1 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-all cursor-pointer shrink-0 mt-0.5"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/* ─── Container (portal-like, fixed bottom-right) ─────── */
function ToastContainer({ toasts, onRemove }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
      aria-live="polite"
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}

/* ─── Provider ────────────────────────────────────────── */
let _nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // `action` is optional: { label, onClick }. Used for undo, where the
  // toast's lifetime is deliberately the whole window to act.
  const showToast = useCallback((type, title, message, duration, action) => {
    const id = _nextId++;
    setToasts(prev => [...prev, { id, type, title, message, duration, action }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}
