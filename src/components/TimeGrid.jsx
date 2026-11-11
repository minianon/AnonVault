import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ymdOf } from '../services/nlp';
import { formatTime } from '../services/meetings';

/*
 * Hour-by-hour view for Week and Day, like a desktop calendar.
 *
 *  - Timed things (meetings, Board cards with a due time, deadlines with a
 *    time) are blocks at their real time; overlapping ones sit side by side.
 *  - Everything without a time (checklist, EMIs, income, undated cards) is in
 *    the all-day row on top.
 *  - Click an empty slot to add a meeting there. Drag a block to move it —
 *    up/down for time, sideways for another day — in 15-minute steps.
 */
const HOUR_PX = 48;
const SNAP = 15;
const GUTTER = 52;
const DEFAULT_START = 7;
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const toHM = mins => {
  const m = Math.max(0, Math.min(24 * 60 - SNAP, mins));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Start/end minutes for a timed event (blocks without an end get 30 min). */
function spanOf(ev) {
  const start = toMin(ev.time);
  const endT = ev.kind === 'meeting' ? ev.meeting?.end_time : null;
  let end = endT ? toMin(endT) : start + 30;
  if (end <= start) end = start + 30;
  return { start, end };
}

/** Lay overlapping events out in columns: [{ ev, start, end, col, cols }]. */
function layout(events) {
  const items = events.map(ev => ({ ev, ...spanOf(ev) })).sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const colsEnd = [];
    for (const it of cluster) {
      let c = colsEnd.findIndex(e => e <= it.start);
      if (c === -1) { c = colsEnd.length; colsEnd.push(it.end); } else colsEnd[c] = it.end;
      it.col = c;
    }
    for (const it of cluster) { it.cols = colsEnd.length; out.push(it); }
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

export default function TimeGrid({
  days, today, selected, kinds, eventsFor, onSelectDay, onOpenEvent, onCreateAt, onMoveEvent, canMove, focusFor, goalMs,
}) {
  const scrollRef = useRef(null);
  const colsRef = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [drag, setDrag] = useState(null); // { ev, dayIdx, start, end, dMin, dDay, moved }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const keys = useMemo(() => days.map(d => ymdOf(d)), [days]);
  const perDay = keys.map(k => {
    const evs = eventsFor(k);
    return { timed: evs.filter(e => e.time), allDay: evs.filter(e => !e.time) };
  });

  // Start the grid early enough for the earliest event (default 7 AM).
  const earliest = Math.min(DEFAULT_START * 60, ...perDay.flatMap(d => d.timed.map(e => spanOf(e).start)));
  const startHour = Math.max(0, Math.floor(earliest / 60));
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  const top = mins => ((mins - startHour * 60) / 60) * HOUR_PX;

  // Open scrolled to an hour before now (or to the first event / 8 AM).
  const firstKey = keys[0];
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = keys.includes(today);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const target = showsToday ? nowMin - 60 : 8 * 60;
    el.scrollTop = Math.max(0, top(target));
    // only when the range changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, keys.length]);

  /* ── dragging ── */
  const startDrag = (e, ev, dayIdx) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { start, end } = spanOf(ev);
    const movable = canMove(ev);
    const d = { ev, dayIdx, start, end, dMin: 0, dDay: 0, moved: false, movable, x: e.clientX, y: e.clientY };
    setDrag({ ...d });
    const colW = (colsRef.current?.getBoundingClientRect().width || 1) / days.length;
    const onMove = m => {
      if (!movable) return;
      const dy = m.clientY - d.y;
      const dx = m.clientX - d.x;
      if (!d.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
      d.moved = true;
      d.dMin = Math.round(((dy / HOUR_PX) * 60) / SNAP) * SNAP;
      d.dDay = Math.max(-dayIdx, Math.min(days.length - 1 - dayIdx, Math.round(dx / colW)));
      // keep it inside the day
      d.dMin = Math.max(-d.start, Math.min(24 * 60 - d.end, d.dMin));
      setDrag({ ...d });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (!d.moved) { onOpenEvent(ev); return; }
      if (d.dMin === 0 && d.dDay === 0) return;
      onMoveEvent(ev, keys[dayIdx + d.dDay], toHM(d.start + d.dMin), toHM(d.end + d.dMin));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const clickSlot = (e, key) => {
    if (drag) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mins = startHour * 60 + ((e.clientY - r.top) / HOUR_PX) * 60;
    onCreateAt(key, toHM(Math.floor(mins / 30) * 30));
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const single = days.length === 1;

  return (
    <div className="flex flex-col min-w-0">
      {/* day headers + all-day row */}
      <div className="flex border-b border-white/[0.06]" style={{ paddingLeft: GUTTER }}>
        {keys.map((k, i) => {
          const d = days[i];
          const sel = k === selected;
          const ms = focusFor?.(d) || 0;
          return (
            <div key={k} className={`flex-1 min-w-0 border-l border-white/[0.05] first:border-l-0 ${sel && !single ? 'bg-white/[0.03]' : ''}`}>
              <button onClick={() => onSelectDay(k)} className="w-full h-12 flex flex-col items-center justify-center cursor-pointer">
                <span className={`text-[11px] ${k === today ? 'text-[var(--accent)]' : 'text-slate-500'}`}>{WEEK[d.getDay()]}</span>
                <span className={`text-[14px] tabular-nums font-semibold inline-flex items-center justify-center min-w-7 h-7 px-1 rounded-full ${k === today ? 'bg-slate-100 text-slate-950' : 'text-slate-200'}`}>{d.getDate()}</span>
              </button>
              {goalMs > 0 && (
                <div className="mx-2 mb-1 h-[3px] rounded-full bg-white/[0.05] overflow-hidden" title={ms ? `Focused ${Math.round(ms / 60000)} min` : 'No focus time'}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (ms / goalMs) * 100)}%`, background: ms >= goalMs ? 'var(--ok)' : 'rgba(255,255,255,0.45)' }} />
                </div>
              )}
              <div className="px-1 pb-1.5 space-y-0.5 min-h-[22px]">
                {(() => {
                  const all = perDay[i].allDay;
                  const tasks = all.filter(e => e.kind === 'task');
                  const others = all.filter(e => e.kind !== 'task');
                  const tDone = tasks.filter(e => e.done).length;
                  const max = single ? 8 : 2;
                  return (
                    <>
                      {others.slice(0, max).map(ev => (
                        <button key={ev.kind + ev.id} onClick={() => onOpenEvent(ev)}
                          className={`w-full flex items-center gap-1 h-[18px] px-1 rounded text-[11px] truncate cursor-pointer hover:brightness-125 ${ev.done ? 'opacity-45 line-through' : ''}`}
                          style={{ background: kinds[ev.kind].color + '22', color: '#e4e4e7' }} title={ev.title}>
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ background: kinds[ev.kind].color }} />
                          <span className="truncate">{ev.title}</span>
                        </button>
                      ))}
                      {others.length > max && <p className="text-[10.5px] text-slate-500 px-1">+{others.length - max} more</p>}
                      {tasks.length > 0 && (
                        <button onClick={() => onSelectDay(k)}
                          className={`w-full flex items-center gap-1 h-[18px] px-1 rounded text-[11px] tabular-nums cursor-pointer ${k > today ? 'text-slate-400' : tDone === tasks.length ? 'text-emerald-300' : 'text-slate-300'}`}
                          style={{ background: tDone === tasks.length && k <= today ? 'rgba(79,209,160,0.12)' : 'rgba(161,161,170,0.12)' }}
                          title="Checklist for this day">
                          <span className="truncate">✓ {k > today ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}` : `${tDone}/${tasks.length} tasks`}</span>
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* hours */}
      <div ref={scrollRef} className="relative overflow-y-auto" style={{ height: 'min(620px, calc(100dvh - 300px))', minHeight: 360 }}>
        <div className="relative flex" style={{ height: hours.length * HOUR_PX }}>
          {/* gutter */}
          <div className="shrink-0 relative" style={{ width: GUTTER }}>
            {hours.map(h => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-slate-500 tabular-nums"
                style={{ top: (h - startHour) * HOUR_PX }}>
                {h === startHour ? '' : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}
              </span>
            ))}
          </div>

          <div ref={colsRef} className="flex-1 flex relative">
            {/* hour lines */}
            {hours.map(h => (
              <div key={h} className="absolute left-0 right-0 border-t border-white/[0.05] pointer-events-none" style={{ top: (h - startHour) * HOUR_PX }}>
                <div className="absolute left-0 right-0 border-t border-dashed border-white/[0.025]" style={{ top: HOUR_PX / 2 }} />
              </div>
            ))}

            {keys.map((k, i) => (
              <div key={k} onClick={e => clickSlot(e, k)}
                className={`relative flex-1 min-w-0 border-l border-white/[0.05] first:border-l-0 cursor-cell ${k === selected && !single ? 'bg-white/[0.015]' : ''}`}>
                {layout(perDay[i].timed).map(({ ev, start, end, col, cols }) => {
                  const dragging = drag && drag.ev === ev;
                  const s = dragging ? start + drag.dMin : start;
                  const e2 = dragging ? end + drag.dMin : end;
                  const color = kinds[ev.kind].color;
                  const h = Math.max(20, top(e2) - top(s) - 2);
                  const short = h < 38;
                  const movable = canMove(ev);
                  return (
                    <div key={ev.kind + ev.id}
                      onPointerDown={e => startDrag(e, ev, i)}
                      onClick={e => e.stopPropagation()}
                      title={`${ev.title} · ${formatTime(toHM(s))}${ev.kind === 'meeting' ? ` – ${formatTime(toHM(e2))}` : ''}${movable ? ' · drag to move' : ''}`}
                      className={`absolute rounded-md px-1.5 py-1 overflow-hidden select-none border-l-[3px] transition-shadow ${movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${ev.done ? 'opacity-50' : ''} ${dragging && drag.moved ? 'z-20 shadow-[0_8px_24px_rgba(0,0,0,0.5)] ring-1 ring-white/30' : 'z-10 hover:brightness-110'}`}
                      style={{
                        top: top(s) + 1,
                        height: h,
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                        transform: dragging && drag.dDay ? `translateX(calc(${drag.dDay * 100 * cols}% + ${drag.dDay * 4 * cols}px))` : undefined,
                        background: `color-mix(in srgb, ${color} 22%, #16161a)`,
                        borderColor: color,
                      }}>
                      <p className={`text-[11.5px] font-medium text-slate-50 leading-tight truncate ${ev.done ? 'line-through' : ''}`}>{ev.title}</p>
                      {!short && (
                        <p className="text-[10.5px] text-slate-300/80 leading-tight truncate tabular-nums">
                          {formatTime(toHM(s))}{ev.kind === 'meeting' && ev.meeting?.end_time ? ` – ${formatTime(toHM(e2))}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
                {/* now line */}
                {k === today && nowMin >= startHour * 60 && (
                  <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: top(nowMin) }}>
                    <div className="h-[2px] bg-rose-400/90" />
                    <span className="absolute -left-[5px] -top-[4px] w-[10px] h-[10px] rounded-full bg-rose-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
