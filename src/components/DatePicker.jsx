/* Themed date picking — replaces the browser's own calendar, which can't be
   styled and looked out of place. CalendarPopover is the month grid;
   DateInput is a drop-in for <input type="date"> (value 'YYYY-MM-DD'). */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Select } from './ui';

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => (s ? new Date(s + 'T00:00:00') : null);
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function CalendarPopover({ anchorRef, value, onPick, onClose, clearable = true }) {
  const today = new Date();
  const sel = parse(value);
  const [view, setView] = useState(() => {
    const b = sel || today;
    return new Date(b.getFullYear(), b.getMonth(), 1);
  });
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const r = anchorRef?.current?.getBoundingClientRect();
    if (!r) return;
    const w = 280, h = 330;
    const below = window.innerHeight - r.bottom;
    const up = below < h + 12 && r.top > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      up,
    });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = e => { if (!ref.current?.contains(e.target) && !anchorRef?.current?.contains(e.target)) onClose(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [anchorRef, onClose]);

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(view.getFullYear(), view.getMonth(), 1 - offset + i));
  const shift = n => setView(v => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const todayKey = ymd(today);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  if (!pos) return null;
  return createPortal(
    <div ref={ref} role="dialog" aria-label="Choose a date"
      onMouseDown={e => e.preventDefault()}
      className="fixed z-[210] w-[280px] p-3 rounded-xl border border-white/[0.1]"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, background: 'var(--surface-2)', boxShadow: 'var(--shadow-lg)',
        transformOrigin: pos.up ? 'bottom' : 'top', animation: 'selectIn 0.14s var(--ease) both' }}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} className="icon-btn !w-7 !h-7" aria-label="Previous month"><ChevronLeft size={14} /></button>
        <span className="text-[13px] font-medium text-slate-100">
          {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" onClick={() => shift(1)} className="icon-btn !w-7 !h-7" aria-label="Next month"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEK.map(w => <span key={w} className="h-7 flex items-center justify-center text-[11px] text-slate-500">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(d => {
          const k = ymd(d);
          const inMonth = d.getMonth() === view.getMonth();
          const isSel = value === k;
          const isToday = k === todayKey;
          return (
            <button key={k} type="button" onClick={() => onPick(k)}
              className={`h-8 mx-auto w-8 rounded-lg text-[12.5px] tabular-nums cursor-pointer transition-colors ${
                isSel ? 'bg-slate-100 text-slate-950 font-semibold'
                  : isToday ? 'text-slate-50 ring-1 ring-inset ring-white/[0.3] hover:bg-white/[0.08]'
                  : inMonth ? 'text-slate-200 hover:bg-white/[0.08]' : 'text-slate-600 hover:bg-white/[0.05]'}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-white/[0.06]">
        <button type="button" onClick={() => onPick(todayKey)} className="h-7 px-2.5 rounded-md text-[12px] text-slate-300 hover:bg-white/[0.07] hover:text-slate-100 cursor-pointer">Today</button>
        <button type="button" onClick={() => onPick(ymd(tomorrow))} className="h-7 px-2.5 rounded-md text-[12px] text-slate-300 hover:bg-white/[0.07] hover:text-slate-100 cursor-pointer">Tomorrow</button>
        {clearable && value && (
          <button type="button" onClick={() => onPick('')} className="ml-auto h-7 px-2.5 rounded-md text-[12px] text-slate-500 hover:text-rose-300 hover:bg-white/[0.05] cursor-pointer">Clear</button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Drop-in for <input type="date">. `onChange` receives 'YYYY-MM-DD' (or '' when cleared). */
export function DateInput({ value, onChange, placeholder = 'Pick a date', className = '', size = 'md', clearable = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const d = parse(value);
  const h = size === 'sm' ? 'h-8 text-[12.5px]' : 'h-9 text-[13px]';
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)} aria-label={ariaLabel || placeholder} aria-haspopup="dialog" aria-expanded={open}
        className={`input-premium ${h} px-3 rounded-lg inline-flex items-center gap-2 text-left cursor-pointer ${open ? '!border-[var(--accent-line)]' : ''} ${className}`}>
        <Calendar size={13} className="text-slate-500 shrink-0" />
        <span className={`flex-1 truncate ${d ? 'text-slate-100' : 'text-slate-500'}`}>
          {d ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : placeholder}
        </span>
        {clearable && d && (
          <span role="button" tabIndex={-1} onClick={e => { e.stopPropagation(); onChange(''); }}
            className="text-slate-500 hover:text-slate-100" aria-label="Clear date"><X size={12} /></span>
        )}
      </button>
      {open && <CalendarPopover anchorRef={ref} value={value} clearable={clearable}
        onPick={v => { onChange(v); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

/* Times every 30 minutes, labelled the way the clock reads them here. */
const TIME_OPTIONS = [{ value: '', label: 'No time' }].concat(Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 ? 30 : 0;
  return { value: `${pad(h)}:${pad(m)}`, label: new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
}));

/** Themed time picker (30-minute steps). Keeps an off-grid value like 17:45 selectable. */
export function TimeSelect({ value, onChange, className = '', size = 'sm' }) {
  const opts = value && !TIME_OPTIONS.some(o => o.value === value)
    ? [...TIME_OPTIONS, { value, label: new Date(2000, 0, 1, ...value.split(':').map(Number)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }]
        .sort((a, b) => a.value.localeCompare(b.value))
    : TIME_OPTIONS;
  return <Select size={size} value={value || ''} onChange={onChange} options={opts} ariaLabel="Time" className={className} />;
}
