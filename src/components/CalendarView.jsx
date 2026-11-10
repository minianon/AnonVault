import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarRange, KanbanSquare, CalendarClock, CircleDollarSign, CheckSquare,
  Plus, Check, ArrowUpRight, Timer,
} from 'lucide-react';
import { board, addItem, moveItem, dueInfo } from '../services/board';
import { emis, emiStats, payEmi, transactions, incomeSources, formatMoney, useMoneySettings, monthLabel, shiftMonth } from '../services/money';
import { sessions, totalForDay, formatDuration } from '../services/focus';
import { getAllTasksSync } from '../services/tasks';
import { parseCapture, ymdOf } from '../services/nlp';
import { PageHeader, Card, Empty } from './ui';

const KINDS = {
  hackathon: { label: 'Deadlines', color: '#f0b445', icon: CalendarRange },
  card:      { label: 'Board',     color: '#6c96ff', icon: KanbanSquare },
  emi:       { label: 'EMIs',      color: '#f5768a', icon: CalendarClock },
  income:    { label: 'Income',    color: '#4fd1a0', icon: CircleDollarSign },
  task:      { label: 'Checklist', color: '#a1a1aa', icon: CheckSquare },
};
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGrid(key) {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(y, m - 1, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function CalendarView({ applications = [], tasksVersion, setActiveTab, onSelectHackathon, onLock, onMenuToggle, showToast }) {
  const today = ymdOf(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState(() => new Set());
  const [draft, setDraft] = useState('');

  const cards = board.useAll();
  const emiList = emis.useAll();
  const tx = transactions.useAll();
  const sourceList = incomeSources.useAll();
  const focusList = sessions.useAll();
  const settings = useMoneySettings();
  const fmt = n => formatMoney(n, settings.currency);

  const days = useMemo(() => monthGrid(month), [month]);
  const rangeFrom = ymdOf(days[0]);
  const rangeTo = ymdOf(days[41]);

  /* every event in the visible 6 weeks, grouped by date */
  const byDate = useMemo(() => {
    const map = new Map();
    const push = (date, ev) => {
      if (!date || date < rangeFrom || date > rangeTo) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(ev);
    };

    for (const a of applications) {
      if (!a?.deadline || a.status === 'rejected') continue;
      const d = new Date(a.deadline);
      push(ymdOf(d), { kind: 'hackathon', id: a.id, title: a.name, sub: a.company || '', time: a.deadline.includes('T') ? d.toTimeString().slice(0, 5) : null });
    }
    for (const c of cards) {
      if (!c.due_date) continue;
      push(c.due_date, { kind: 'card', id: c.id, title: c.title, sub: c.label || '', time: c.due_time || null, done: c.status === 'done', overdue: dueInfo(c)?.tone === 'bad', item: c });
    }
    for (const e of emiList) {
      if (e.closed) continue;
      const st = emiStats(e);
      const start = e.start_month || rangeFrom.slice(0, 7);
      for (let m = rangeFrom.slice(0, 7); m <= rangeTo.slice(0, 7); m = shiftMonth(m, 1)) {
        if (m < start) continue;
        if (!st.endless && st.endMonth && m > st.endMonth && !(e.payments || []).includes(m)) continue;
        const dim = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
        const day = Math.min(Number(e.due_day) || 1, dim);
        const paid = (e.payments || []).includes(m);
        if (m < today.slice(0, 7) && !paid) continue; // past months: only show what was ticked here
        push(`${m}-${String(day).padStart(2, '0')}`, { kind: 'emi', id: e.id + m, title: e.name, sub: fmt(st.amount), done: paid, emi: e, month: m });
      }
    }
    const sourceIds = new Set(sourceList.map(s => s.id));
    for (const t of tx) {
      if (t.type !== 'income') continue;
      if (t.source_id && !sourceIds.has(t.source_id)) continue; // tick left behind by a deleted source
      push(t.date, { kind: 'income', id: t.id, title: t.note || 'Income', sub: '+' + fmt(t.amount) });
    }
    for (const t of getAllTasksSync()) {
      if (t.is_recurring || !t.date) continue;
      push(t.date, { kind: 'task', id: t.id, title: t.title, done: !!t.completed });
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.time || '99').localeCompare(b.time || '99'));
    }
    return map;
    // tasksVersion re-reads the checklist cache after edits elsewhere
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, cards, emiList, tx, sourceList, rangeFrom, rangeTo, tasksVersion, settings.currency, today]);

  const visible = date => (byDate.get(date) || []).filter(e => !hidden.has(e.kind));
  const dayEvents = visible(selected);
  const selDate = new Date(selected + 'T00:00:00');
  const focusMs = totalForDay(focusList, selDate);
  const spent = tx.filter(t => t.type !== 'income' && t.date === selected).reduce((s, t) => s + Number(t.amount || 0), 0);

  // header counts for the month on screen
  const inMonth = [...byDate.entries()].filter(([d]) => d.startsWith(month)).flatMap(([, l]) => l);
  const count = k => inMonth.filter(e => e.kind === k && !e.done).length;

  const go = d => { setMonth(d.slice(0, 7)); setSelected(d); };

  const toggleKind = k => setHidden(h => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const addOnDay = e => {
    e.preventDefault();
    if (!draft.trim()) return;
    const p = parseCapture(draft);
    const it = addItem({ title: p.title, label: p.label || '', priority: p.priority || 'medium', due_date: p.date || selected, due_time: p.time });
    if (it) { setDraft(''); showToast?.('success', 'Card added', it.title); if (p.date && p.date !== selected) go(p.date); }
  };

  const openEvent = ev => {
    if (ev.kind === 'card') { setActiveTab('board'); setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:open-card', { detail: ev.id })), 60); }
    else if (ev.kind === 'hackathon') onSelectHackathon?.(ev.id);
    else if (ev.kind === 'emi') { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'emi' })); }
    else if (ev.kind === 'income') { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'overview' })); }
    else if (ev.kind === 'task') setActiveTab('tasks');
  };

  const quickDone = ev => {
    if (ev.kind === 'card') {
      const prev = ev.item.status;
      moveItem(ev.id, 'done');
      showToast?.('success', 'Done', ev.title, 5000, { label: 'Undo', onClick: () => moveItem(ev.id, prev) });
    } else if (ev.kind === 'emi') {
      const r = payEmi(ev.emi);
      showToast?.('success', `${monthLabel(r.month, { month: 'short' })} EMI paid`, ev.title, 6000, { label: 'Undo', onClick: r.undo });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Calendar"
        stats={[
          { value: count('hackathon'), label: 'deadlines', tone: 'warn' },
          { value: count('card'), label: 'cards due' },
          { value: count('emi'), label: 'EMIs left', tone: 'bad' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="icon-btn !h-full !rounded-r-none" aria-label="Previous month"><ChevronLeft size={14} /></button>
            <span className="px-1.5 sm:px-2 text-[12.5px] text-slate-200 font-medium whitespace-nowrap min-w-[64px] sm:min-w-[110px] text-center">
              <span className="sm:hidden">{monthLabel(month, { month: 'short' })}</span>
              <span className="hidden sm:inline">{monthLabel(month)}</span>
            </span>
            <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="icon-btn !h-full !rounded-l-none" aria-label="Next month"><ChevronRight size={14} /></button>
          </div>
          <button onClick={() => go(today)} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Today</button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1300px] mx-auto px-3 sm:px-4 lg:px-6 py-5 space-y-4">
          {/* legend / filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(KINDS).map(([k, v]) => {
              const on = !hidden.has(k);
              return (
                <button key={k} onClick={() => toggleKind(k)}
                  className={`h-7 px-2.5 rounded-md text-[12px] border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    on ? 'border-white/[0.1] text-slate-200 bg-white/[0.04]' : 'border-white/[0.05] text-slate-600 line-through'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: on ? v.color : '#46464e' }} />{v.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* month grid */}
            <div className="panel overflow-hidden min-w-0">
              <div className="grid grid-cols-7 border-b border-white/[0.06]">
                {WEEK.map(d => <div key={d} className="h-8 flex items-center justify-center text-[11.5px] text-slate-500">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d, i) => {
                  const key = ymdOf(d);
                  const inM = key.startsWith(month);
                  const evs = visible(key);
                  const isToday = key === today;
                  const isSel = key === selected;
                  const weekend = i % 7 >= 5;
                  return (
                    <button key={key} onClick={() => setSelected(key)}
                      className={`relative text-left min-h-[56px] sm:min-h-[96px] p-1 sm:p-1.5 border-white/[0.05] cursor-pointer transition-colors
                        ${i % 7 !== 6 ? 'border-r' : ''} ${i < 35 ? 'border-b' : ''}
                        ${isSel ? 'bg-white/[0.06]' : weekend ? 'bg-white/[0.012] hover:bg-white/[0.035]' : 'hover:bg-white/[0.03]'}`}>
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] tabular-nums
                        ${isToday ? 'bg-slate-100 text-slate-950 font-semibold' : inM ? 'text-slate-300' : 'text-slate-600'}`}>
                        {d.getDate()}
                      </span>
                      {/* desktop: chips */}
                      <div className="hidden sm:block space-y-0.5 mt-0.5">
                        {evs.slice(0, 3).map(ev => (
                          <div key={ev.kind + ev.id}
                            className={`flex items-center gap-1 h-[18px] px-1 rounded text-[11px] truncate ${ev.done ? 'opacity-45 line-through' : ''}`}
                            style={{ background: KINDS[ev.kind].color + '1f', color: ev.overdue ? '#f9909f' : '#e4e4e7' }}>
                            <span className="w-1 h-1 rounded-full shrink-0" style={{ background: KINDS[ev.kind].color }} />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {evs.length > 3 && <div className="text-[10.5px] text-slate-500 px-1">+{evs.length - 3} more</div>}
                      </div>
                      {/* phone: dots */}
                      <div className="sm:hidden flex flex-wrap gap-0.5 mt-0.5 px-0.5">
                        {evs.slice(0, 4).map(ev => (
                          <span key={ev.kind + ev.id} className="w-1.5 h-1.5 rounded-full" style={{ background: KINDS[ev.kind].color, opacity: ev.done ? 0.4 : 1 }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* day agenda */}
            <Card className="lg:sticky lg:top-0 min-w-0">
              <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.06]">
                <p className="text-[15px] font-semibold text-slate-100">
                  {selected === today ? 'Today' : selDate.toLocaleDateString(undefined, { weekday: 'long' })}
                </p>
                <p className="text-[12.5px] text-slate-500">{selDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {(focusMs > 0 || spent > 0) && (
                  <div className="flex gap-3 mt-2 text-[12px] text-slate-400">
                    {focusMs > 0 && <span className="inline-flex items-center gap-1"><Timer size={12} className="text-slate-500" />{formatDuration(focusMs)} focused</span>}
                    {spent > 0 && <span className="inline-flex items-center gap-1"><ArrowUpRight size={12} className="text-slate-500" />{fmt(spent)} spent</span>}
                  </div>
                )}
              </div>

              <form onSubmit={addOnDay} className="px-3 pt-3">
                <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-dashed border-white/[0.1] focus-within:border-white/[0.2] focus-within:border-solid transition-colors">
                  <Plus size={14} className="text-slate-500" />
                  <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a card on this day…"
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
                </div>
              </form>

              {dayEvents.length === 0 ? (
                <Empty icon={CalendarRange} title="Nothing on this day" body="Board cards with a due date, hackathon deadlines, EMIs and income all show up here." />
              ) : (
                <ul className="p-2">
                  {dayEvents.map(ev => {
                    const K = KINDS[ev.kind];
                    const canTick = (ev.kind === 'card' || ev.kind === 'emi') && !ev.done;
                    return (
                      <li key={ev.kind + ev.id} className="group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                        <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: K.color + '1f' }}>
                          <K.icon size={13} style={{ color: K.color }} />
                        </span>
                        <button onClick={() => openEvent(ev)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <p className={`text-[13px] truncate ${ev.done ? 'text-slate-500 line-through' : ev.overdue ? 'text-rose-300' : 'text-slate-200'}`}>{ev.title}</p>
                          <p className="text-[11.5px] text-slate-500 truncate">
                            {K.label}{ev.time ? ` · ${ev.time}` : ''}{ev.sub ? ` · ${ev.sub}` : ''}{ev.done ? ' · done' : ''}
                          </p>
                        </button>
                        {canTick && (
                          <button onClick={() => quickDone(ev)} title={ev.kind === 'emi' ? 'Mark paid' : 'Mark done'}
                            className="w-7 h-7 rounded-md border border-white/[0.1] text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 flex items-center justify-center cursor-pointer shrink-0 transition-colors">
                            <Check size={13} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
