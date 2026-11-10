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
  info:    <Info         size={15} className="shrink-0 text-accent-400" />,
  warning: <AlertTriangle size={15} className="shrink-0 text-amber-400" />,
};

function ToastItem({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 180);
  }, [toast.id, onRemove]);

  useEffect(() => {
    const duration = toast.duration ?? 3200;
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [dismiss, toast.duration]);

  return (
    <div
      role="status"
      className={`flex items-center gap-3 pl-3.5 pr-2 py-2.5 rounded-xl border border-white/[0.1]
        min-w-[260px] max-w-[380px] select-none
        transition-[opacity,transform] duration-200 ease-out
        ${exiting ? 'opacity-0 translate-y-1 scale-[0.98]' : 'toast-animate'}`}
      style={{ background: 'var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}
    >
      {ICONS[toast.type] ?? ICONS.info}
      <div className="flex-1 min-w-0">
        {toast.title && <p className="text-[13px] font-medium text-slate-100 leading-snug truncate">{toast.title}</p>}
        {toast.message && <p className="text-[12.5px] text-slate-400 leading-snug truncate">{toast.message}</p>}
      </div>
      {toast.action && (
        <button
          onClick={() => { toast.action.onClick(); dismiss(); }}
          className="shrink-0 h-7 px-2.5 rounded-md text-[12px] font-medium text-slate-950 bg-slate-100 hover:bg-white transition-colors cursor-pointer">
          {toast.action.label}
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss"
        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0">
        <X size={12} />
      </button>
    </div>
  );
}

/* ─── Container (portal-like, fixed bottom-right) ─────── */
function ToastContainer({ toasts, onRemove }) {
  return (
    <div
      className="fixed bottom-5 right-5 left-5 sm:left-auto z-[9999] flex flex-col gap-2 items-end pointer-events-none"
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
