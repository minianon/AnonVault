import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, ChevronRight, TrendingUp, CircleDollarSign, CalendarClock, LineChart, HandCoins, Check,
} from 'lucide-react';
import { Card, CardHeader, LinkButton, Empty, Modal, Segmented, inputCls } from './ui';
import IncomeChart from './IncomeChart';
import { DateInput } from './DatePicker';
import {
  transactions, incomeSources, emis, investments, loans,
  EXTRA_INCOME_CATEGORIES, isExtraIncome, kindFromNote, categoryMeta, monthKey, shiftMonth, monthLabel, ymd,
  expectedPerMonth, receivedFrom, receiveIncome, emiStats, payEmi, currentValue, outstanding,
} from '../services/money';

const num = v => Number(v) || 0;
const EXTRA_IDS = new Set(EXTRA_INCOME_CATEGORIES.map(c => c.id));

/* ── log / edit an extra-income entry ───────────────────────
   `compact` (Today's Needs attention card): smaller, no date picker —
   it's logged for today. */
export function ExtraIncomeForm({ initial, onSubmit, submitLabel = 'Add', amountRef, compact = false }) {
  const [amount, setAmount] = useState(initial ? String(initial.amount ?? '') : '');
  // Older entries may use a category from before (Freelance, Gift…); keep it visible.
  const [category, setCategory] = useState(initial?.category || 'trade');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || ymd());
  const [shake, setShake] = useState(false);
  const cats = EXTRA_IDS.has(category) ? EXTRA_INCOME_CATEGORIES : [...EXTRA_INCOME_CATEGORIES, categoryMeta(category)];

  const submit = e => {
    e.preventDefault();
    const value = parseFloat(String(amount).replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) { setShake(true); setTimeout(() => setShake(false), 400); return; }
    onSubmit({ type: 'income', amount: Math.round(value * 100) / 100, category, note: note.trim(), date: compact ? ymd() : date, method: initial?.method || 'bank', source_id: null });
    if (!initial) { setAmount(''); setNote(''); }
  };

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of income">
        {cats.map(c => {
          const on = c.id === category;
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c.id)}
              className={`${compact ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]'} rounded-lg font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                on ? 'text-slate-50 border-white/[0.18]' : 'border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}
              style={on ? { background: c.color + '26' } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.label}
            </button>
          );
        })}
      </div>
      <div className={`flex gap-2 ${compact ? 'flex-wrap sm:flex-nowrap' : 'flex-col sm:flex-row'}`}>
        <input ref={amountRef} value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
          inputMode="decimal" placeholder="Amount" aria-label="Amount"
          className={`${inputCls} ${compact ? '!w-28 shrink-0' : 'sm:!w-36'} font-medium tabular-nums ${shake ? 'animate-shake' : ''}`} />
        <input value={note} placeholder={compact ? 'Note (optional)' : 'Note (e.g. Quotex, mentoring call)'}
          onChange={e => { setNote(e.target.value); const k = kindFromNote(e.target.value); if (k) setCategory(k); }}
          className={`${inputCls} flex-1 min-w-[120px]`} aria-label="Note" />
        <div className="flex gap-2">
          {!compact && <DateInput value={date} onChange={v => setDate(v || ymd())} ariaLabel="Date" className="flex-1 sm:w-[150px]" />}
          <button type="submit" className="btn-primary h-9 px-4 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5 shrink-0">
            {initial ? submitLabel : <><Plus size={14} />{submitLabel}</>}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ── one small summary card per Money tab ───────────────── */
function SideCard({ icon, title, meta, onOpen, children }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={icon} title={title} meta={meta} action={<LinkButton onClick={onOpen}>Open <ChevronRight size={12} /></LinkButton>} />
      <div className="px-4 pb-4">{children}</div>
    </Card>
  );
}
function Row({ label, value, sub, tone, action }) {
  return (
    <div className="flex items-center gap-2 min-h-[34px]">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-slate-200 truncate">{label}</p>
        {sub && <p className="text-[11.5px] text-slate-500 truncate">{sub}</p>}
      </div>
      {value != null && <span className={`text-[12.5px] tabular-nums shrink-0 ${tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-300'}`}>{value}</span>}
      {action}
    </div>
  );
}
const smallBtn = 'h-6 px-2 rounded-md text-[11.5px] text-slate-300 border border-white/[0.1] hover:bg-white/[0.07] hover:text-slate-50 cursor-pointer shrink-0 transition-colors';

function KPI({ label, value, hint, tone, onClick }) {
  return (
    <button onClick={onClick} className="panel panel-hover px-4 py-3.5 text-left cursor-pointer min-w-0">
      <p className="text-[12px] text-slate-500 truncate">{label}</p>
      <p className={`mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums truncate ${tone === 'good' ? 'text-emerald-300' : 'text-slate-50'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">{hint}</p>}
    </button>
  );
}

export default function MoneyOverview({ month, fmt, showToast, switchTab, amountRef, onMonthChange }) {
  const tx = transactions.useAll();
  const sources = incomeSources.useAll();
  const emiList = emis.useAll();
  const invList = investments.useAll();
  const loanList = loans.useAll();
  const [editing, setEditing] = useState(null);

  /* extra income */
  const extraAll = useMemo(() => tx.filter(isExtraIncome), [tx]);
  const extraMonth = extraAll.filter(t => (t.date || '').startsWith(month))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  const extraTotal = extraMonth.reduce((s, t) => s + num(t.amount), 0);
  const prevMonth = shiftMonth(month, -1);
  const extraPrev = extraAll.filter(t => (t.date || '').startsWith(prevMonth)).reduce((s, t) => s + num(t.amount), 0);
  const byCat = EXTRA_INCOME_CATEGORIES.map(c => ({
    ...c, total: extraMonth.filter(t => (EXTRA_IDS.has(t.category) ? t.category : 'other-in') === c.id).reduce((s, t) => s + num(t.amount), 0),
  }));
  /* chart: by day (the month picked at the top), by month (last 12) or by year */
  const [span, setSpan] = useState(() => {
    try { const v = localStorage.getItem('anonvault_extra_chart'); return ['day', 'month', 'year'].includes(v) ? v : 'month'; } catch { return 'month'; }
  });
  const changeSpan = v => { setSpan(v); try { localStorage.setItem('anonvault_extra_chart', v); } catch { /* fine */ } };
  const todayKey = ymd();
  const chart = useMemo(() => {
    // One bucket per day / month / year, split by kind for the stacked bars.
    const bucket = (key, prefix, label, tip, extra = {}) => {
      const parts = {};
      let total = 0;
      for (const t of extraAll) {
        if (!(t.date || '').startsWith(prefix)) continue;
        const kind = EXTRA_IDS.has(t.category) ? t.category : 'other-in';
        parts[kind] = (parts[kind] || 0) + num(t.amount);
        total += num(t.amount);
      }
      return { key, label, tip, parts, total, ...extra };
    };
    if (span === 'day') {
      const [y, m] = month.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      const isNow = month === todayKey.slice(0, 7);
      const todayDay = isNow ? Number(todayKey.slice(8, 10)) : null;
      // This month stops at today (showing at least a week); past months show every day.
      const shownDays = todayDay ? Math.min(days, Math.max(todayDay, 7)) : days;
      const buckets = Array.from({ length: shownDays }, (_, i) => {
        const key = `${month}-${String(i + 1).padStart(2, '0')}`;
        const date = new Date(y, m - 1, i + 1);
        return bucket(key, key, String(i + 1),
          date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
          { current: i + 1 === todayDay, future: todayDay != null && i + 1 > todayDay, sub: date.toLocaleDateString(undefined, { weekday: 'narrow' }) });
      });
      return { buckets, title: monthLabel(month, { month: 'long', year: 'numeric' }), unit: 'day', periods: todayDay ?? days, best: 'Best day' };
    }
    if (span === 'year') {
      const thisYear = Number(todayKey.slice(0, 4));
      const firstYear = Math.min(thisYear - 2, ...extraAll.map(t => Number((t.date || '').slice(0, 4))).filter(Boolean));
      const buckets = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => {
        const yr = String(firstYear + i);
        return bucket(yr, yr, yr, yr, { current: Number(yr) === thisYear });
      });
      return { buckets, title: `${firstYear}–${thisYear}`, unit: 'year', periods: buckets.length, best: 'Best year' };
    }
    const nowMonth = todayKey.slice(0, 7);
    const buckets = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)).map(m =>
      bucket(m, m, monthLabel(m, { month: 'short' }), monthLabel(m), { current: m === month, future: m > nowMonth }));
    return { buckets, title: 'Last 12 months', unit: 'month', periods: 12, best: 'Best month' };
  }, [span, month, extraAll, todayKey]);
  const chartTotal = chart.buckets.reduce((s, b) => s + b.total, 0);
  const chartAvg = chart.periods ? chartTotal / chart.periods : 0;
  const chartBest = chart.buckets.reduce((b, x) => (x.total > (b?.total || 0) ? x : b), null);
  const kindsInChart = EXTRA_INCOME_CATEGORIES.filter(k => chart.buckets.some(b => b.parts[k.id]));

  /* income sources */
  const activeSources = sources.filter(s => s.active !== false && s.frequency !== 'one-time');
  const sourceRows = activeSources.map(s => {
    const got = receivedFrom(tx, s.id, month).reduce((a, t) => a + num(t.amount), 0);
    const [lo] = expectedPerMonth(s);
    return { s, got, lo, done: got > 0 && got >= lo };
  });
  const fromSources = tx.filter(t => t.type === 'income' && t.source_id && (t.date || '').startsWith(month)).reduce((s, t) => s + num(t.amount), 0);
  const expected = sourceRows.reduce((s, r) => s + r.lo, 0);
  const incomeTotal = fromSources + extraTotal;

  /* EMIs */
  const emiRows = emiList.map(e => ({ e, st: emiStats(e) })).filter(r => !r.st.done);
  const emiDue = emiRows.filter(r => !r.st.paidThisMonth);
  const emiDueAmount = emiDue.reduce((s, r) => s + r.st.amount, 0);
  const emiLeftTotal = emiRows.reduce((s, r) => s + (r.st.left || 0), 0);

  /* investments */
  const invested = invList.reduce((s, i) => s + num(i.invested), 0);
  const worth = invList.reduce((s, i) => s + currentValue(i), 0);
  const gain = worth - invested;
  const gainPct = invested ? (gain / invested) * 100 : 0;

  /* lending */
  const openLoans = loanList.filter(l => !l.settled && outstanding(l) > 0);
  const owedToYou = openLoans.filter(l => l.direction !== 'borrowed').reduce((s, l) => s + outstanding(l), 0);
  const youOwe = openLoans.filter(l => l.direction === 'borrowed').reduce((s, l) => s + outstanding(l), 0);

  const add = row => {
    const t = transactions.add(row);
    showToast?.('success', 'Extra income added', `${fmt(t.amount)} · ${categoryMeta(t.category).label}`);
    if (!t.date.startsWith(month)) onMonthChange?.(t.date.slice(0, 7));
  };
  const remove = t => {
    transactions.remove(t.id);
    showToast?.('warning', 'Entry deleted', `${fmt(t.amount)} · ${categoryMeta(t.category).label}`, 6000,
      { label: 'Undo', onClick: () => transactions.restore(t) });
  };
  const isCurrent = month === monthKey();
  const mShort = monthLabel(month, { month: 'short' });

  return (
    <div className="space-y-5 fade-up">
      {/* this month at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label={`Income · ${mShort}`} value={fmt(incomeTotal)} tone={incomeTotal ? 'good' : undefined} onClick={() => switchTab('income')}
          hint={expected ? `${fmt(fromSources, { compact: true })} of ${fmt(expected, { compact: true })} from sources` : `${fmt(fromSources, { compact: true })} sources · ${fmt(extraTotal, { compact: true })} extra`} />
        <KPI label={`Extra income · ${mShort}`} value={fmt(extraTotal)}
          hint={extraPrev ? `${extraTotal >= extraPrev ? '▲' : '▼'} ${Math.abs(Math.round(((extraTotal - extraPrev) / extraPrev) * 100))}% vs ${monthLabel(prevMonth, { month: 'short' })}` : `${extraMonth.length} entr${extraMonth.length === 1 ? 'y' : 'ies'}`}
          onClick={() => amountRef?.current?.focus()} />
        <KPI label="EMIs this month" value={emiDue.length ? fmt(emiDueAmount) : emiRows.length ? 'All paid' : '—'} onClick={() => switchTab('emi')}
          hint={emiRows.length ? `${emiRows.length - emiDue.length}/${emiRows.length} paid · ${fmt(emiLeftTotal, { compact: true })} left overall` : 'No active EMIs'} />
        <KPI label="Investments" value={invList.length ? fmt(worth) : '—'} onClick={() => switchTab('invest')}
          tone={gain > 0 ? 'good' : undefined}
          hint={invList.length ? `${gain >= 0 ? '+' : '−'}${fmt(Math.abs(gain), { compact: true })} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%) on ${fmt(invested, { compact: true })}` : 'Nothing tracked yet'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* ── Extra income ── */}
        <Card className="overflow-hidden">
          <CardHeader icon={TrendingUp} title="Extra income" meta={extraTotal ? `${fmt(extraTotal)} in ${mShort}` : null} />
          <div className="px-4 pb-4 space-y-4">
            <ExtraIncomeForm onSubmit={add} amountRef={amountRef} />

            {/* by kind */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {byCat.map(c => (
                <div key={c.id} className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400"><span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.label}</p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-slate-100">{fmt(c.total, { compact: c.total >= 100000 })}</p>
                  <div className="mt-1.5 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${extraTotal ? (c.total / extraTotal) * 100 : 0}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* by day / month / year */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 pt-3 pb-3">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[12px] text-slate-400">{chart.title}</p>
                  <p className="text-[20px] leading-7 font-semibold tracking-[-0.02em] tabular-nums text-slate-50">{fmt(chartTotal)}</p>
                </div>
                {chartTotal > 0 && (
                  <>
                    <div className="min-w-0">
                      <p className="text-[12px] text-slate-500">Average</p>
                      <p className="text-[13.5px] leading-7 tabular-nums text-slate-200">{fmt(chartAvg)}<span className="text-slate-500">/{chart.unit}</span></p>
                    </div>
                    {chartBest && (
                      <div className="min-w-0">
                        <p className="text-[12px] text-slate-500">{chart.best}</p>
                        <p className="text-[13.5px] leading-7 tabular-nums text-slate-200">{fmt(chartBest.total)} <span className="text-slate-500">· {chartBest.tip}</span></p>
                      </div>
                    )}
                  </>
                )}
                <div className="ml-auto">
                  <Segmented size="sm" value={span} onChange={changeSpan}
                    options={[{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
                </div>
              </div>
              <IncomeChart key={span + (chart.buckets[0]?.key || '')} buckets={chart.buckets} kinds={EXTRA_INCOME_CATEGORIES} fmt={v => fmt(v)}
                fmtShort={v => fmt(v, { compact: true }).replace(/\.0(?=[^\d]*$)/, '')}
                average={chart.buckets.length > 2 ? chartAvg : 0} unit={chart.unit}
                emptyText={`No extra income in ${span === 'day' ? monthLabel(month, { month: 'long' }) : span === 'month' ? 'the last 12 months' : 'these years'}.`} />
              {kindsInChart.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11.5px] text-slate-400">
                  {kindsInChart.map(k => (
                    <span key={k.id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: k.color }} />{k.label}</span>
                  ))}
                  <span className="ml-auto text-slate-600 hidden sm:inline">Hover a bar for the breakdown</span>
                </div>
              )}
            </div>

            {/* this month's entries */}
            <div className="border-t border-white/[0.06] pt-2 -mx-4">
              {extraMonth.length === 0 ? (
                <Empty icon={TrendingUp} title={`No extra income in ${monthLabel(month, { month: 'long' })}`}
                  body={isCurrent ? 'Log a trade, a Topmate session or a collab above. Press N to jump to the amount.' : 'Nothing was logged this month.'} />
              ) : (
                <ul>
                  {extraMonth.map(t => {
                    const c = categoryMeta(t.category);
                    return (
                      <li key={t.id} className="group flex items-center gap-3 px-4 min-h-[48px] py-1.5 hover:bg-white/[0.02] transition-colors">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-semibold" style={{ background: c.color + '22', color: c.color }}>
                          {c.label.slice(0, 2)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] text-slate-200 truncate">{t.note || c.label}</p>
                          <p className="text-[11.5px] text-slate-500 truncate">
                            {c.label} · {new Date(t.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <span className="flex sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button onClick={() => setEditing(t)} className="icon-btn !w-7 !h-7" title="Edit"><Pencil size={12} /></button>
                          <button onClick={() => remove(t)} className="icon-btn !w-7 !h-7 hover:!text-rose-400" title="Delete"><Trash2 size={12} /></button>
                        </span>
                        <span className="text-[13.5px] font-medium tabular-nums text-emerald-400 shrink-0 sm:w-24 text-right">+{fmt(t.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {/* ── the other tabs, summarised ── */}
        <div className="space-y-5 min-w-0">
          <SideCard icon={CircleDollarSign} title="Income sources" onOpen={() => switchTab('income')}
            meta={sourceRows.length ? `${sourceRows.filter(r => r.done).length}/${sourceRows.length} in` : null}>
            {sourceRows.length === 0 ? <p className="text-[12.5px] text-slate-500">Add your salary, stipend or retainers to track what comes in each month.</p> : (
              <div className="space-y-0.5">
                {sourceRows.slice(0, 5).map(({ s, got, lo, done }) => (
                  <Row key={s.id} label={s.name} sub={done ? `Received ${fmt(got)}` : got ? `${fmt(got)} of ${fmt(lo)}` : `Expected ${fmt(lo)}`}
                    action={done ? <Check size={14} className="text-emerald-400 shrink-0" /> : (
                      <button className={smallBtn} onClick={() => {
                        if (s.kind === 'range') { switchTab('income'); return; }
                        const r = receiveIncome(s, month, s.amount);
                        showToast?.('success', `${mShort} received`, `${fmt(s.amount)} · ${s.name}`, 6000, { label: 'Undo', onClick: r.undo });
                      }}>Received</button>
                    )} />
                ))}
              </div>
            )}
          </SideCard>

          <SideCard icon={CalendarClock} title="EMIs" onOpen={() => switchTab('emi')}
            meta={emiRows.length ? `${fmt(emiLeftTotal, { compact: true })} left` : null}>
            {emiRows.length === 0 ? <p className="text-[12.5px] text-slate-500">No active EMIs.</p>
              : emiDue.length === 0 ? <p className="text-[12.5px] text-emerald-300">All {emiRows.length} EMI{emiRows.length === 1 ? '' : 's'} paid this month.</p> : (
              <div className="space-y-0.5">
                {emiDue.slice(0, 5).map(({ e, st }) => (
                  <Row key={e.id} label={e.name} value={fmt(st.amount)}
                    sub={`Due on the ${Number(e.due_day) || 1}${st.remaining != null ? ` · ${st.remaining} left` : ''}`}
                    action={<button className={smallBtn} onClick={() => {
                      const r = payEmi(e);
                      showToast?.('success', `${monthLabel(r.month, { month: 'short' })} EMI paid`, `${fmt(r.amount)} · ${e.name}`, 6000, { label: 'Undo', onClick: r.undo });
                    }}>Paid</button>} />
                ))}
              </div>
            )}
          </SideCard>

          <SideCard icon={LineChart} title="Investments" onOpen={() => switchTab('invest')} meta={invList.length || null}>
            {invList.length === 0 ? <p className="text-[12.5px] text-slate-500">Track SIPs, stocks, FDs or trading capital.</p> : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[18px] font-semibold tabular-nums text-slate-100">{fmt(worth)}</span>
                  <span className={`text-[12.5px] tabular-nums ${gain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {gain >= 0 ? '+' : '−'}{fmt(Math.abs(gain))} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-500 mb-1.5">{fmt(invested)} put in</p>
                {[...invList].sort((a, b) => currentValue(b) - currentValue(a)).slice(0, 3).map(i => {
                  const g = currentValue(i) - num(i.invested);
                  return <Row key={i.id} label={i.name} value={fmt(currentValue(i))} sub={`${g >= 0 ? '+' : '−'}${fmt(Math.abs(g))}`} />;
                })}
              </>
            )}
          </SideCard>

          <SideCard icon={HandCoins} title="Lending" onOpen={() => switchTab('lending')} meta={openLoans.length || null}>
            {openLoans.length === 0 ? <p className="text-[12.5px] text-slate-500">Nothing lent or borrowed right now.</p> : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  <div><p className="text-[11.5px] text-slate-500">Owed to you</p><p className="text-[15px] font-semibold tabular-nums text-emerald-300">{fmt(owedToYou)}</p></div>
                  <div><p className="text-[11.5px] text-slate-500">You owe</p><p className="text-[15px] font-semibold tabular-nums text-rose-300">{fmt(youOwe)}</p></div>
                </div>
                {openLoans.slice(0, 3).map(l => (
                  <Row key={l.id} label={l.person} value={fmt(outstanding(l))} tone={l.direction === 'borrowed' ? 'bad' : 'good'}
                    sub={`${l.direction === 'borrowed' ? 'You borrowed' : 'You lent'}${l.due_date ? ` · due ${new Date(l.due_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`} />
                ))}
              </>
            )}
          </SideCard>
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit extra income" width={600}>
        {editing && (
          <ExtraIncomeForm initial={editing} submitLabel="Save"
            onSubmit={row => { transactions.update(editing.id, row); setEditing(null); showToast?.('success', 'Saved', fmt(row.amount)); }} />
        )}
      </Modal>
    </div>
  );
}
