/* Shared primitives for the workspace. Small on purpose: anything that
   appears on more than one screen lives here so the screens agree on
   spacing, type and motion. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Lock, X, ChevronDown, Check, Zap } from 'lucide-react';

/* Themed replacement for <select>. The menu is portalled to <body> with
   fixed positioning so it is never clipped by a modal or a scrolling card,
   and it flips upward when there is no room below.
   options: [{ value, label, color?, hint? }] */
export function Select({ value, onChange, options, placeholder = 'Select…', size = 'md', className = '', ariaLabel, style, disabled }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const current = options.find(o => o.value === value);

  const h = size === 'xs' ? 'h-6 text-[11.5px] px-2 rounded-md' : size === 'sm' ? 'h-8 text-[13px] px-2.5 rounded-lg' : 'h-9 text-[13px] px-3 rounded-lg';

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuH = Math.min(280, options.length * 34 + 10);
    const below = window.innerHeight - r.bottom;
    const up = below < menuH + 12 && r.top > below;
    setPos({
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
      width: Math.max(r.width, 180),
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      up,
    });
  };

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) btnRef.current?.focus(); };
  const pick = o => { onChange(o.value); close(); };

  // Scroll only inside the menu. scrollIntoView would also scroll the page
  // (and the close-on-scroll listener would then shut the menu at once).
  const reveal = i => {
    const list = listRef.current;
    const el = list?.querySelector(`[data-i="${i}"]`);
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
  };

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    reveal(active);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      if (!listRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) close(false);
    };
    const onScroll = e => {
      const t = e.target;
      if (listRef.current?.contains(t)) return;
      if (t === document || (t instanceof Element && t.contains(btnRef.current))) close(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', () => close(false), { once: true });
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onListKey = e => {
    e.stopPropagation(); // keep digits/Escape away from global shortcuts and the modal
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) pick(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
  };
  useEffect(() => {
    if (open) reveal(active);
  }, [active, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openMenu(); } }}
        className={`input-premium ${h} inline-flex items-center gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${open ? '!border-[var(--accent-line)]' : ''} ${className}`}
        style={style}>
        {current?.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: current.color }} />}
        <span className={`flex-1 truncate ${current ? '' : 'text-slate-500'}`}>{current ? current.label : placeholder}</span>
        <ChevronDown size={size === 'xs' ? 11 : 13} className="text-slate-500 shrink-0 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && pos && createPortal(
        <div ref={listRef} role="listbox" tabIndex={-1} onKeyDown={onListKey}
          className="fixed z-[200] p-1 rounded-lg border border-white/[0.1] overflow-y-auto outline-none"
          style={{
            left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: 280,
            background: 'var(--surface-2)', boxShadow: 'var(--shadow-lg)',
            transformOrigin: pos.up ? 'bottom' : 'top',
            animation: 'selectIn 0.14s var(--ease) both',
          }}>
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <button key={String(o.value)} type="button" role="option" aria-selected={selected} data-i={i}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => pick(o)}
                className={`w-full flex items-center gap-2 h-10 sm:h-8 px-2 rounded-md text-left text-[13px] cursor-pointer ${i === active ? 'bg-white/[0.07] text-slate-100' : 'text-slate-300'}`}>
                {o.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: o.color }} />}
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-[11.5px] text-slate-500">{o.hint}</span>}
                {selected && <Check size={13} className="text-slate-300 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/* Free-text input with themed suggestions — type anything, or pick one.
   The list is portalled like Select so a scrolling dialog cannot clip it. */
export function Combo({ value, onChange, suggestions = [], placeholder, className = '', inputClassName = '', ariaLabel, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const wrap = useRef(null);
  const listRef = useRef(null);
  const q = (value || '').trim().toLowerCase();
  const list = suggestions.filter(s => s && s.toLowerCase() !== q && (!q || s.toLowerCase().includes(q))).slice(0, 8);
  const show = open && list.length > 0;

  const place = () => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const h = Math.min(240, list.length * 34 + 10);
    const up = window.innerHeight - r.bottom < h + 12 && r.top > window.innerHeight - r.bottom;
    setPos({ left: r.left, width: r.width, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined, up });
  };

  useLayoutEffect(() => { if (show) place(); }, [show, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!show) return;
    const onDown = e => { if (!wrap.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false); };
    const onScroll = e => { if (!listRef.current?.contains(e.target)) place(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = e => {
    if (!show) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(list.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(-1, a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); onChange(list[active]); setOpen(false); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrap} className={`relative ${className}`}>
      {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />}
      <input value={value} aria-label={ariaLabel} placeholder={placeholder} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onKeyDown={onKey}
        className={`input-premium w-full rounded-lg text-[13px] ${Icon ? 'pl-9' : 'px-3'} pr-3 ${inputClassName}`} />
      {show && pos && createPortal(
        <div ref={listRef} className="fixed z-[200] p-1 rounded-lg border border-white/[0.1] max-h-60 overflow-y-auto"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, background: 'var(--surface-2)', boxShadow: 'var(--shadow-lg)', animation: 'selectIn 0.14s var(--ease) both', transformOrigin: pos.up ? 'bottom' : 'top' }}>
          {list.map((s, i) => (
            <button key={s} type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false); }}
              onMouseMove={() => setActive(i)}
              className={`w-full h-9 sm:h-8 px-2 rounded-md text-left text-[13px] truncate cursor-pointer ${i === active ? 'bg-white/[0.07] text-slate-100' : 'text-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* Small "3 open" style chips shown beside a page title. */
export function HeaderStats({ stats }) {
  const list = (stats || []).filter(s => s && s.value != null && (s.always || Number(s.value) !== 0));
  if (!list.length) return null;
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 min-w-0">
      {list.map(s => (
        <span key={s.label}
          className={`inline-flex items-baseline gap-1 h-6 px-2 rounded-md border text-[12px] whitespace-nowrap leading-6 ${
            s.tone === 'bad' ? 'border-rose-400/25 bg-rose-400/[0.07]' : s.tone === 'warn' ? 'border-amber-400/25 bg-amber-400/[0.07]' : s.tone === 'good' ? 'border-emerald-400/25 bg-emerald-400/[0.07]' : 'border-white/[0.07] bg-white/[0.03]'}`}>
          <span className={`font-semibold tabular-nums ${s.tone === 'bad' ? 'text-rose-300' : s.tone === 'warn' ? 'text-amber-300' : s.tone === 'good' ? 'text-emerald-300' : 'text-slate-100'}`}>{s.value}</span>
          <span className="text-slate-500">{s.label}</span>
        </span>
      ))}
    </span>
  );
}

export function PageHeader({ title, subtitle, stats, onMenuToggle, onLock, actions, children, headerChildren }) {
  return (
    <header className="glass-header h-14 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-3 shrink-0 relative z-10">
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        {onMenuToggle && (
          <button onClick={onMenuToggle} className="icon-btn md:hidden -ml-1" aria-label="Open navigation">
            <Menu size={16} />
          </button>
        )}
        <div className="min-w-0 flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-semibold text-slate-100 tracking-[-0.01em] whitespace-nowrap shrink-0">{title}</h1>
          {stats ? <HeaderStats stats={stats} />
            : subtitle && <span className="hidden sm:inline text-[13px] text-slate-500 truncate">{subtitle}</span>}
        </div>
        {children}
        {headerChildren}
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {actions}
        {onLock && (
          <button onClick={onLock} className="icon-btn" title="Lock workspace" aria-label="Lock workspace">
            <Lock size={14} />
          </button>
        )}
      </div>
    </header>
  );
}

export function Card({ className = '', children, as: Tag = 'div', ...rest }) {
  return <Tag className={`panel ${className}`} {...rest}>{children}</Tag>;
}

export function CardHeader({ icon: Icon, title, meta, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-2.5">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon size={14} className="text-slate-500 shrink-0" />}
        <h3 className="text-[13px] font-medium text-slate-200 truncate">{title}</h3>
        {meta != null && <span className="text-[12px] text-slate-500 tabular-nums">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

export function LinkButton({ onClick, children }) {
  return (
    <button onClick={onClick}
      className="text-[12px] text-slate-500 hover:text-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1">
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, tone, onClick, children }) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`panel px-4 py-3.5 text-left flex flex-col gap-1 min-w-0 ${onClick ? 'panel-hover cursor-pointer' : ''}`}>
      <span className="eyebrow truncate">{label}</span>
      <span className={`text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums ${toneClass}`}>{value}</span>
      {hint && <span className="text-[12px] text-slate-500 truncate">{hint}</span>}
      {children}
    </Tag>
  );
}

export function Progress({ value, tone = 'accent', className = '', height = 4 }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  const color = tone === 'good' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : tone === 'neutral' ? 'var(--text-1)' : 'var(--accent)';
  return (
    <div className={`w-full rounded-full bg-white/[0.06] overflow-hidden ${className}`} style={{ height }}>
      <div className="h-full rounded-full" style={{ width: pct + '%', background: color, transition: 'width 0.6s var(--ease)' }} />
    </div>
  );
}

export function Empty({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      {Icon && (
        <div className="w-9 h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center mb-3">
          <Icon size={16} className="text-slate-500" />
        </div>
      )}
      <p className="text-[13px] font-medium text-slate-300">{title}</p>
      {body && <p className="text-[12.5px] text-slate-500 mt-1 max-w-[280px] leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented({ value, onChange, options, size = 'md' }) {
  const h = size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[13px]';
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`${h} px-3 rounded-md font-medium transition-colors cursor-pointer ${
              active ? 'bg-white/[0.09] text-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.4)]' : 'text-slate-500 hover:text-slate-200'
            }`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Minimal modal. Uses .modal-overlay so global shortcuts stand down. */
export function Modal({ open, onClose, title, children, footer, width = 440 }) {
  const ref = useRef(null);
  // Parents often pass an inline onClose that changes every render (Focus
  // re-renders every second). Keep it in a ref so focus is set only when the
  // dialog opens, never again mid-typing.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    // Don't pop the keyboard open on phones; focus the first field only with a real pointer.
    const fine = window.matchMedia?.('(pointer: fine)').matches;
    const first = (fine && ref.current?.querySelector('.p-5 input, .p-5 textarea')) || ref.current;
    first?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="modal-surface outline-none w-full rounded-t-2xl sm:rounded-xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)]"
        style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[14px] font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close"><X size={15} /></button>
        </div>
        <div className="p-5 overflow-y-auto min-h-0">{children}</div>
        {footer && <div className="px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015] shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-slate-400 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = 'input-premium w-full h-9 px-3 rounded-lg text-[13px]';

/** Donut: one solid ring split into parts, total in the middle, details on hover. */
export function Donut({ parts, size = 148, thickness = 18, center, sub, format = v => v }) {
  const [hover, setHover] = useState(null);
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  const r = (size - thickness - 6) / 2; // room for the hover swell, so nothing clips
  const c = 2 * Math.PI * r;
  // Start offset of each slice, worked out before render.
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((t, q) => t + (q.value / total) * c, 0));
  const hv = hover != null ? parts[hover] : null;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img"
        aria-label={parts.map(p => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
        {parts.map((p, i) => {
          // Slices meet edge to edge so the ring reads as one whole circle.
          const len = Math.max(0, (p.value / total) * c);
          return (
            <circle key={p.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={hover === i ? thickness + 4 : thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offsets[i]}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-width .15s ease', cursor: 'default' }}>
              <title>{`${p.label}: ${format(p.value)} (${Math.round((p.value / total) * 100)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
        <span className="text-[15px] font-semibold tabular-nums text-slate-100 leading-tight truncate max-w-full">{hv ? format(hv.value) : center}</span>
        <span className="text-[11px] text-slate-500 truncate max-w-full">{hv ? hv.label : sub}</span>
      </div>
    </div>
  );
}

/** Bar chart with no dependencies. values: [{ label, value, title?, muted?, highlight? }]
    Zero days draw nothing (no fake stubs); `muted` marks days still to come. */
export function Bars({ values, height = 72, highlightLast = true, format = v => v, color = 'var(--accent)', average }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...values.map(v => v.value));
  const avgY = average ? (average / max) * height : null;
  const n = values.length;
  const hv = hover != null ? values[hover] : null;
  const hvH = hv && hv.value > 0 ? Math.max(3, (hv.value / max) * height) : 0;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {avgY != null && avgY > 0 && (
        <div className="absolute left-0 right-0 border-t border-dashed border-white/[0.18] pointer-events-none z-10" style={{ bottom: 18 + avgY }}>
          <span className="absolute right-0 -top-[18px] text-[10.5px] text-slate-500 tabular-nums">avg {format(average)}</span>
        </div>
      )}
      {/* instant tooltip — follows the hovered bar, no browser delay */}
      {hv && (
        <div className="absolute z-20 pointer-events-none -translate-x-1/2 px-2.5 py-1.5 rounded-lg border border-white/[0.1] whitespace-nowrap"
          style={{
            left: `clamp(48px, ${((hover + 0.5) / n) * 100}%, calc(100% - 48px))`,
            bottom: 18 + hvH + 10,
            background: 'var(--surface-3)',
          }}>
          <p className="text-[12.5px] font-semibold text-slate-100 tabular-nums leading-tight">{hv.value > 0 ? format(hv.value) : '—'}</p>
          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{hv.tip || hv.title || hv.label}</p>
        </div>
      )}
      <div className="flex items-end gap-[3px] sm:gap-1.5" style={{ height: height + 18 }}>
        {values.map((v, i) => {
          const h = v.value > 0 ? Math.max(3, (v.value / max) * height) : 0;
          const hl = v.highlight || (highlightLast && i === values.length - 1);
          const on = hover === i;
          return (
            <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-1.5 min-w-0 cursor-default"
              onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} aria-label={v.tip || v.title || `${v.label}: ${format(v.value)}`}>
              <div className="w-full flex-1 flex items-end">
                <div className="w-full rounded-t-[3px] rounded-b-[1px] transition-[height,background-color,opacity] duration-300"
                  style={{
                    height: h,
                    background: hl ? color : v.muted ? 'rgba(255,255,255,0.06)' : on ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.22)',
                  }} />
              </div>
              <span className={`text-[10.5px] h-3 leading-3 tabular-nums ${hl || on ? 'text-slate-200' : v.muted ? 'text-slate-700' : 'text-slate-600'}`}>{v.label}</span>
            </div>
          );
        })}
      </div>
      <div className="absolute left-0 right-0 h-px bg-white/[0.08]" style={{ bottom: 18 + 6 }} />
    </div>
  );
}

/** The streak mark: a bolt in the app's green, dim when there's no streak. */
export function StreakIcon({ active = true, size = 14, className = '' }) {
  return (
    <Zap size={size} strokeWidth={2.2} className={`shrink-0 ${className}`}
      style={{ color: active ? 'var(--ok)' : 'rgb(82 82 91)' }} fill={active ? 'currentColor' : 'none'} />
  );
}
