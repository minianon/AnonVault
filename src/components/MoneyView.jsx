import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Settings2, Trash2, Pencil, Search, Download,
  ArrowDownRight, ArrowUpRight, Wallet, PieChart, CalendarDays, Repeat, X,
} from 'lucide-react';
import {
  transactions, EXPENSE_CATEGORIES, INCOME_CATEGORIES, METHODS, categoryMeta,
  useMoneySettings, setMoneySettings, formatMoney, ymd, monthKey, shiftMonth, monthLabel,
  daysInMonth, summarizeMonth, spentOn, detectRepeats,
} from '../services/money';
import { IncomeSourcesTab, InvestmentsTab, LendingTab, EmiTab } from './MoneyExtras';
import { PageHeader, Card, CardHeader, Stat, Empty, Bars, Segmented, Progress, Modal, Field, Select, inputCls, Donut } from './ui';
import { topParts } from '../utils/chart';
import { DateInput } from './DatePicker';
import { usePref } from '../services/prefs';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'];

/* Things you pay for again and again, found from your own expenses — so a
   forgotten subscription shows up as "₹649 every month" instead of hiding
   in the list. Dismissed ones stay hidden on every device (prefs.js). */
const HIDDEN_KEY = 'anonvault_money_repeat_hidden';
function RepeatPayments({ all, fmt }) {
  const [hiddenPref, setHidden] = usePref(HIDDEN_KEY, []);
  const hidden = Array.isArray(hiddenPref) ? hiddenPref : [];
  const found = useMemo(() => detectRepeats(all), [all]);
  const list = found.filter(r => !hidden.includes(r.key));
  if (!list.length) return null;
  const hide = key => {
    setHidden([...hidden, key]);
  };
  const perMonth = list.reduce((t, r) => t + r.perMonth, 0);
  const everyLabel = e => (e === 'month' ? 'every month' : e === 'week' ? 'every week' : `every ${e} days`);
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={Repeat} title="Repeat payments" meta={list.length}
        action={<span className="text-[12px] text-slate-500 tabular-nums">≈ {fmt(perMonth)}/month · {fmt(perMonth * 12)}/year</span>} />
      <div className="pb-1.5">
        {list.map(r => (
          <div key={r.key} className="group flex items-center gap-3 px-4 h-12 hover:bg-white/[0.02] transition-colors">
            <span className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
              <Repeat size={12} className="text-slate-400" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-slate-200 truncate capitalize">{r.name}</p>
              <p className="text-[11.5px] text-slate-500 truncate">
                {categoryMeta(r.category).label} · seen {r.count}× · {r.late
                  ? <span className="text-amber-400">expected {r.next.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, not logged yet</span>
                  : `next around ${r.next.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[13px] text-slate-100 tabular-nums">{fmt(r.amount)}</p>
              <p className="text-[11.5px] text-slate-500">{everyLabel(r.every)}</p>
            </div>
            <button onClick={() => hide(r.key)} className="icon-btn !w-7 !h-7 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
              title="Not a repeat payment — hide" aria-label={`Hide ${r.name}`}><X size={13} /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

const MONEY_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'income',   label: 'Income sources' },
  { id: 'emi',      label: 'EMIs' },
  { id: 'invest',   label: 'Investments' },
  { id: 'lending',  label: 'Lending' },
];

function dateHeading(dateStr) {
  const today = ymd();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dateStr === today) return 'Today';
  if (dateStr === ymd(y)) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ── entry form, used inline and in the edit modal ── */
function EntryForm({ initial, onSubmit, submitLabel = 'Add', compact = false, autoFocusRef }) {
  const [type, setType] = useState(initial?.type || 'expense');
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [pickedCategory, setCategory] = useState(initial?.category || 'food');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || ymd());
  const [method, setMethod] = useState(initial?.method || 'upi');
  // Monthly income is ticked off in Income sources. Here, "income" means
  // extra money that isn't one of those (a gift, a prize, a one-off gig).
  // Editing a source-linked entry keeps its link.
  const sourceId = initial?.source_id || null;
  const [shake, setShake] = useState(false);
  const settings = useMoneySettings();

  const cats = type === 'income'
    ? (sourceId ? INCOME_CATEGORIES : INCOME_CATEGORIES.filter(c => c.id !== 'salary'))
    : EXPENSE_CATEGORIES;
  // Switching Expense/Income keeps the pick only if it exists on the other side.
  const category = cats.some(c => c.id === pickedCategory) ? pickedCategory : cats[0].id;

  const submit = e => {
    e.preventDefault();
    const value = parseFloat(String(amount).replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      setShake(true); setTimeout(() => setShake(false), 400);
      return;
    }
    const row = { type, amount: Math.round(value * 100) / 100, category, note: note.trim(), date, method };
    if (type === 'income') row.source_id = sourceId;
    onSubmit(row);
    if (!initial) { setAmount(''); setNote(''); }
  };

  const symbol = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency })
        .formatToParts(0).find(p => p.type === 'currency')?.value || settings.currency;
    } catch { return settings.currency; }
  }, [settings.currency]);

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Segmented value={type} onChange={setType}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: sourceId ? 'Income' : 'Extra income' }]} />
        <div className={`relative flex-1 ${shake ? 'animate-shake' : ''}`}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-500 pointer-events-none">{symbol}</span>
          <input ref={autoFocusRef} value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
            inputMode="decimal" placeholder="0" aria-label="Amount"
            className="input-premium w-full h-8 pl-8 pr-3 rounded-lg text-[14px] font-medium tabular-nums" />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={type === 'income' ? 'Where from? (e.g. birthday gift, one-off gig)' : 'Note (e.g. lunch with team)'}
          className={`${inputCls} !h-8 sm:flex-[1.4]`} aria-label="Note" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cats.map(c => {
          const active = c.id === category;
          return (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)}
              className={`h-7 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                active ? 'bg-white/[0.09] border-white/[0.16] text-slate-100' : 'bg-transparent border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}>
              {c.label}
            </button>
          );
        })}
      </div>

      <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'pt-1'}`}>
        <DateInput size="sm" value={date} onChange={v => setDate(v || ymd())} ariaLabel="Date" className="w-[150px]" />
        <Select size="sm" className="w-24" value={method} onChange={setMethod} ariaLabel="Paid with"
          options={METHODS.map(m => ({ value: m.id, label: m.label }))} />
        <button type="submit" className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer ml-auto">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function MoneyView({ onLock, onMenuToggle, showToast }) {
  const all = transactions.useAll();
  const settings = useMoneySettings();
  const [month, setMonth] = useState(monthKey());
  const [tab, setTab] = useState(() => {
    try { const t = localStorage.getItem('anonvault_money_tab'); return ['overview', 'income', 'emi', 'invest', 'lending'].includes(t) ? t : 'overview'; } catch { return 'overview'; }
  });
  const switchTab = t => { setTab(t); try { localStorage.setItem('anonvault_money_tab', t); } catch { /* ignore */ } };
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const amountRef = useRef(null);

  // Other sections can ask for a specific tab (e.g. Ideas → Income sources).
  useEffect(() => {
    const onTab = e => { if (e.detail) switchTab(e.detail); };
    window.addEventListener('anonvault:money-tab', onTab);
    return () => window.removeEventListener('anonvault:money-tab', onTab);
  }, []);

  useEffect(() => {
    const onNew = () => { if (amountRef.current?.closest('[aria-hidden="false"]')) amountRef.current.focus(); };
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const cur = settings.currency;
  const fmt = (n, o) => formatMoney(n, cur, o);
  const sum = useMemo(() => summarizeMonth(all, month), [all, month]);
  const prev = useMemo(() => summarizeMonth(all, shiftMonth(month, -1)), [all, month]);
  const isCurrent = month === monthKey();
  const today = new Date();
  const dim = daysInMonth(month);
  const elapsed = isCurrent ? today.getDate() : dim;
  const left = isCurrent ? dim - today.getDate() + 1 : 0;

  const budget = Number(settings.monthlyBudget) || 0;
  const remaining = budget - sum.expense;
  const budgetRatio = budget ? sum.expense / budget : 0;
  const paceRatio = elapsed / dim;
  const budgetTone = !budget ? 'neutral' : budgetRatio > 1 ? 'bad' : budgetRatio > paceRatio + 0.1 ? 'warn' : 'good';

  const delta = prev.expense ? (sum.expense - prev.expense) / prev.expense : null;

  const list = sum.rows
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (t.note || '').toLowerCase().includes(q) || categoryMeta(t.category).label.toLowerCase().includes(q);
    });
  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of list) {
      if (!m.has(t.date)) m.set(t.date, []);
      m.get(t.date).push(t);
    }
    return [...m.entries()];
  }, [list]);

  const add = data => {
    const row = transactions.add(data);
    showToast?.('success', data.type === 'income' ? 'Income added' : 'Expense added',
      `${fmt(row.amount)} · ${categoryMeta(row.category).label}`);
    if (!row.date.startsWith(month)) setMonth(row.date.slice(0, 7));
  };
  const remove = t => {
    transactions.remove(t.id);
    showToast?.('warning', 'Transaction deleted', `${fmt(t.amount)} · ${categoryMeta(t.category).label}`, 6000,
      { label: 'Undo', onClick: () => transactions.restore(t) });
  };

  const exportCsv = () => {
    const rows = [['date', 'type', 'amount', 'currency', 'category', 'method', 'note']];
    for (const t of all) rows.push([t.date, t.type, t.amount, cur, categoryMeta(t.category).label, t.method, (t.note || '').replace(/"/g, '""')]);
    const csv = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `anonvault-money-${ymd()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Money"
        stats={[
          { value: fmt(sum.expense), label: `spent in ${monthLabel(month, { month: 'short' })}`, always: true },
          { value: budget ? fmt(Math.abs(remaining)) : null, label: remaining >= 0 ? 'left' : 'over', tone: remaining >= 0 ? undefined : 'bad' },
          { value: sum.income ? fmt(sum.income) : null, label: 'in', tone: 'good' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="icon-btn !h-full !rounded-r-none" aria-label="Previous month"><ChevronLeft size={14} /></button>
            <button onClick={() => setMonth(monthKey())} className="px-1.5 sm:px-2 text-[12.5px] text-slate-200 font-medium tabular-nums sm:min-w-[84px] cursor-pointer whitespace-nowrap" title="Jump to this month">
              <span className="sm:hidden">{monthLabel(month, { month: 'short' })}</span>
              <span className="hidden sm:inline">{monthLabel(month, { month: 'short', year: 'numeric' })}</span>
            </button>
            <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="icon-btn !h-full !rounded-l-none" aria-label="Next month"><ChevronRight size={14} /></button>
          </div>
          <button onClick={exportCsv} className="icon-btn hidden sm:inline-flex" title="Export CSV"><Download size={14} /></button>
          <button onClick={() => setSettingsOpen(true)} className="icon-btn" title="Budget & currency"><Settings2 size={14} /></button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-4 pb-6 space-y-5 reveal-stagger">
          <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
            <nav className="flex items-center gap-1 border-b border-white/[0.06] min-w-max" aria-label="Money sections">
              {MONEY_TABS.map(t => (
                <button key={t.id} onClick={() => switchTab(t.id)}
                  className={`relative h-9 px-3 text-[13px] font-medium cursor-pointer transition-colors ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                  {t.label}
                  <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-slate-100 transition-opacity duration-200"
                    style={{ opacity: tab === t.id ? 1 : 0 }} />
                </button>
              ))}
            </nav>
          </div>

          {tab === 'income' && <IncomeSourcesTab key="income" month={month} fmt={fmt} showToast={showToast} />}
          {tab === 'emi' && <EmiTab key="emi" fmt={fmt} showToast={showToast} />}
          {tab === 'invest' && <InvestmentsTab key="invest" fmt={fmt} showToast={showToast} />}
          {tab === 'lending' && <LendingTab key="lending" fmt={fmt} showToast={showToast} />}

          {tab === 'overview' && <div className="space-y-5 fade-up">

          <Card className="p-4">
            <EntryForm onSubmit={add} autoFocusRef={amountRef} />
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={`Spent in ${monthLabel(month, { month: 'long' })}`} value={fmt(sum.expense)}
              hint={delta == null ? `${sum.rows.filter(r => r.type !== 'income').length} expenses`
                : `${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta * 100))}% vs last month`} />
            <Stat label="Income" value={fmt(sum.income)}
              hint={(() => {
                const fromSources = sum.rows.filter(r => r.type === 'income' && r.source_id).reduce((a, r) => a + Number(r.amount), 0);
                return `${fmt(fromSources, { compact: true })} sources · ${fmt(sum.income - fromSources, { compact: true })} extra`;
              })()} />
            <Stat label="Net" value={fmt(sum.net, { sign: sum.net !== 0 })} tone={sum.net > 0 ? 'good' : sum.net < 0 ? 'bad' : undefined}
              hint={sum.income ? `Saved ${Math.max(0, Math.round((sum.net / sum.income) * 100))}% of income` : 'Income minus spending'} />
            <Stat label={isCurrent ? 'Spent today' : 'Daily average'}
              value={isCurrent ? fmt(spentOn(all, ymd())) : fmt(sum.expense / dim)}
              hint={isCurrent ? `Avg ${fmt(sum.expense / Math.max(1, elapsed))}/day` : `${dim} days`} />
          </div>

          {/* Budget */}
          <Card className="p-4">
            {budget ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-slate-200">Monthly budget</span>
                    <span className="text-[13px] text-slate-500 tabular-nums">{fmt(sum.expense)} of {fmt(budget)}</span>
                  </div>
                  <span className={`text-[13px] tabular-nums ${remaining < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {remaining >= 0 ? `${fmt(remaining)} left` : `${fmt(-remaining)} over`}
                    {isCurrent && remaining > 0 && left > 0 && <span className="text-slate-500"> · {fmt(remaining / left)}/day for {left} day{left === 1 ? '' : 's'}</span>}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={budgetRatio} tone={budgetTone} height={6} />
                  {isCurrent && <div className="absolute -top-1 -bottom-1 w-px bg-slate-400/60" style={{ left: paceRatio * 100 + '%' }} title="Where you'd be at an even pace" />}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Wallet size={16} className="text-slate-500" />
                  <div>
                    <p className="text-[13px] font-medium text-slate-200">Set a monthly budget</p>
                    <p className="text-[12.5px] text-slate-500">See how much is left and what you can spend per day.</p>
                  </div>
                </div>
                <button onClick={() => setSettingsOpen(true)} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Set budget</button>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader icon={PieChart} title="By category" />
              <div className="px-4 pb-4">
                {sum.categories.length === 0 ? (
                  <p className="text-[13px] text-slate-500 py-8 text-center">No spending this month.</p>
                ) : (
                  (() => {
                    const parts = topParts(sum.categories.map(c => ({ id: c.id, label: c.label, value: c.total })));
                    return (
                      <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5">
                        <Donut parts={parts} format={v => fmt(v)} center={fmt(sum.expense)} sub="spent" />
                        <div className="w-full space-y-2.5 min-w-0">
                          {parts.map(c => (
                            <div key={c.id} className="flex items-center gap-2.5 text-[13px]">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                              <span className="text-slate-300 truncate">{c.label}</span>
                              <span className="ml-auto text-slate-200 tabular-nums">{fmt(c.value)}</span>
                              <span className="text-slate-500 tabular-nums w-10 text-right">{Math.round((c.value / sum.expense) * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader icon={CalendarDays} title="Daily spending" meta={monthLabel(month, { month: 'long' })}
                action={sum.expense > 0 && <span className="text-[12px] text-slate-500 tabular-nums">avg {fmt(sum.expense / Math.max(1, elapsed))}/day</span>} />
              <div className="px-4 pb-4">
                {(() => {
                  const todayDay = isCurrent ? today.getDate() : null;
                  const spentDays = sum.byDay.filter(v => v > 0).length;
                  if (!spentDays) return <p className="text-[13px] text-slate-500 py-10 text-center">No spending logged this month.</p>;
                  return (
                    <Bars highlightLast={false} height={120} color="var(--accent)" format={v => fmt(v)}
                      values={sum.byDay.map((v, i) => ({
                        label: (i + 1) % 5 === 0 || i === 0 || i + 1 === todayDay ? String(i + 1) : '',
                        value: v,
                        highlight: i + 1 === todayDay,
                        muted: todayDay != null && i + 1 > todayDay,
                        tip: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, i + 1)
                          .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (v > 0 ? '' : ' · nothing spent'),
                      }))} />
                  );
                })()}
              </div>
            </Card>
          </div>

          <RepeatPayments all={all} fmt={fmt} />

          {/* Transactions */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-3">
              <h3 className="text-[13px] font-medium text-slate-200">Transactions <span className="text-slate-500 tabular-nums">{list.length}</span></h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"
                    className="input-premium h-7 w-36 sm:w-44 pl-7 pr-2 rounded-md text-[12.5px]" />
                </div>
                <Segmented size="sm" value={filter} onChange={setFilter}
                  options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Out' }, { value: 'income', label: 'In' }]} />
              </div>
            </div>
            {grouped.length === 0 ? (
              <Empty icon={Wallet} title={sum.rows.length ? 'No matches' : 'Nothing logged this month'}
                body={sum.rows.length ? 'Try a different search or filter.' : 'Log an expense above — it takes about three seconds. Press N to jump to the amount.'} />
            ) : (
              <div className="pb-2">
                {grouped.map(([date, rows]) => {
                  const out = rows.filter(r => r.type !== 'income').reduce((s, r) => s + Number(r.amount), 0);
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.015] border-y border-white/[0.04]">
                        <span className="text-[12px] font-medium text-slate-400">{dateHeading(date)}</span>
                        {out > 0 && <span className="text-[12px] text-slate-500 tabular-nums">−{fmt(out)}</span>}
                      </div>
                      {rows.map(t => {
                        const c = categoryMeta(t.category);
                        const income = t.type === 'income';
                        return (
                          <div key={t.id} className="group flex items-center gap-3 px-4 h-12 hover:bg-white/[0.02] transition-colors">
                            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border border-white/[0.06]"
                              style={{ background: income ? 'rgba(79,209,160,0.1)' : 'rgba(255,255,255,0.04)' }}>
                              {income ? <ArrowDownRight size={13} className="text-emerald-400" /> : <ArrowUpRight size={13} className="text-slate-400" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-slate-200 truncate">{t.note || c.label}</p>
                              <p className="text-[11.5px] text-slate-500 truncate">{c.label} · {METHODS.find(m => m.id === t.method)?.label || t.method}</p>
                            </div>
                            <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button onClick={() => setEditing(t)} className="icon-btn" title="Edit"><Pencil size={13} /></button>
                              <button onClick={() => remove(t)} className="icon-btn hover:!text-rose-400" title="Delete"><Trash2 size={13} /></button>
                            </div>
                            <span className={`text-[13.5px] font-medium tabular-nums shrink-0 sm:w-28 text-right ${income ? 'text-emerald-400' : 'text-slate-100'}`}>
                              {income ? '+' : '−'}{fmt(t.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          </div>}
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit transaction" width={560}>
        {editing && (
          <EntryForm initial={editing} submitLabel="Save" compact
            onSubmit={data => { transactions.update(editing.id, data); setEditing(null); showToast?.('success', 'Saved', fmt(data.amount)); }} />
        )}
      </Modal>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} />}
    </div>
  );
}

function SettingsModal({ onClose, settings }) {
  const [budget, setBudget] = useState(settings.monthlyBudget ? String(settings.monthlyBudget) : '');
  const [currency, setCurrency] = useState(settings.currency);

  const save = e => {
    e?.preventDefault();
    const b = parseFloat(budget.replace(/,/g, ''));
    setMoneySettings({ monthlyBudget: Number.isFinite(b) && b > 0 ? b : 0, currency });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Budget & currency"
      footer={<>
        <button onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
      </>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Monthly budget" hint="Leave empty to hide the budget bar.">
          <input value={budget} onChange={e => setBudget(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal"
            placeholder="e.g. 15000" className={inputCls} />
        </Field>
        <Field label="Currency">
          <Select className="w-full" value={currency} onChange={setCurrency} ariaLabel="Currency"
            options={CURRENCIES.map(c => ({ value: c, label: c }))} />
        </Field>
      </form>
    </Modal>
  );
}
