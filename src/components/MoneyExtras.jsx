/* The three Money tabs beyond the monthly overview: income sources,
   investments and lending. Each is its own small ledger, kept apart from
   spending on purpose — money you invest or lend is not money you spent,
   and folding it into "expenses" would make the budget lie. */

import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, CheckCircle2, RotateCcw, Briefcase, TrendingUp, HandCoins,
  PiggyBank, Sparkles, ArrowRight, CalendarClock, ChevronDown, ArrowUpRight,
} from 'lucide-react';
import { companies as companyStore, companyById, resolveCompany } from '../services/work';
import {
  incomeSources, investments, loans, transactions, incomeIdeas, IDEA_STATUSES, emis, emiStats,
  FREQUENCIES, INCOME_CATEGORIES, INVESTMENT_KINDS, investmentKind,
  expectedPerMonth, currentValue, outstanding, ymd, monthLabel, shiftMonth, receivedFrom,
} from '../services/money';
import { Card, CardHeader, Stat, Empty, Progress, Segmented, Modal, Field, Select, Combo, inputCls } from './ui';

const num = v => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const numInput = (value, set, placeholder) => (
  <input value={value} onChange={e => set(e.target.value.replace(/[^0-9.,]/g, ''))}
    inputMode="decimal" placeholder={placeholder} className={inputCls} />
);
const btnPrimary = 'btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5';
const btnGhost = 'btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer';

function Footer({ onCancel, onSave, label = 'Save' }) {
  return (
    <>
      <button onClick={onCancel} className={btnGhost}>Cancel</button>
      <button onClick={onSave} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">{label}</button>
    </>
  );
}

/* "✓ Nov received" chips that undo on click, then a button for the next
   month that isn't done yet. Shared by income sources and EMIs. */
function MonthToggles({ months, isDone, onDo, onUndo, doneLabel, todoLabel }) {
  const done = months.filter(isDone);
  const next = months.find(m => !isDone(m));
  return (
    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
      {done.map(m => (
        <button key={m} onClick={() => onUndo(m)} title="Click to undo"
          className="group/chip h-7 px-2.5 rounded-md text-[12px] border cursor-pointer inline-flex items-center gap-1 transition-colors text-emerald-400 border-emerald-400/25 bg-emerald-400/[0.06] hover:text-rose-300 hover:border-rose-400/30 hover:bg-rose-400/[0.06]">
          <CheckCircle2 size={12} className="group-hover/chip:hidden" />
          <RotateCcw size={12} className="hidden group-hover/chip:inline" />
          {monthLabel(m, { month: 'short' })} {doneLabel}
        </button>
      ))}
      {next && (
        <button onClick={() => onDo(next)} className="btn-ghost h-7 px-2.5 rounded-md text-[12px] cursor-pointer shrink-0">
          Mark {monthLabel(next, { month: 'short' })} {todoLabel}
        </button>
      )}
    </div>
  );
}

function RowActions({ children }) {
  return (
    <div className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      {children}
    </div>
  );
}

/* ═══════════════════════ Income sources ═══════════════════════ */

function SourceModal({ initial, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState(initial?.kind || 'fixed');
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [min, setMin] = useState(initial?.min != null ? String(initial.min) : '');
  const [max, setMax] = useState(initial?.max != null ? String(initial.max) : '');
  const [frequency, setFrequency] = useState(initial?.frequency || 'monthly');
  const [category, setCategory] = useState(initial?.category || 'salary');
  const companyList = companyStore.useAll();
  const [company, setCompany] = useState(() => companyById(companyStore.getAll(), initial?.company_id)?.name || '');
  const [error, setError] = useState('');

  const save = e => {
    e?.preventDefault();
    if (!name.trim()) return setError('Give the source a name.');
    if (kind === 'fixed' && num(amount) <= 0) return setError('Enter the amount you receive.');
    if (kind === 'range' && (num(min) <= 0 || num(max) < num(min))) return setError('Enter a range where max ≥ min.');
    const row = {
      name: name.trim(), kind, frequency, category, active: initial?.active ?? true,
      company_id: resolveCompany(company),
      amount: kind === 'fixed' ? num(amount) : null,
      min: kind === 'range' ? num(min) : null,
      max: kind === 'range' ? num(max) : null,
    };
    if (initial) incomeSources.update(initial.id, row); else incomeSources.add(row);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit income source' : 'New income source'} width={480}
      footer={<Footer onCancel={onClose} onSave={save} />}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Internship stipend, Freelance, Tuition"
            className={inputCls} />
        </Field>
        <Field label="Amount">
          <div className="space-y-2">
            <Segmented size="sm" value={kind} onChange={setKind}
              options={[{ value: 'fixed', label: 'Fixed amount' }, { value: 'range', label: 'Range' }]} />
            {kind === 'fixed' ? numInput(amount, setAmount, 'e.g. 25000') : (
              <div className="flex items-center gap-2">
                {numInput(min, setMin, 'Min')}
                <span className="text-slate-500 text-[13px]">to</span>
                {numInput(max, setMax, 'Max')}
              </div>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How often">
            <Select className="w-full" value={frequency} onChange={setFrequency} ariaLabel="How often"
              options={FREQUENCIES.map(f => ({ value: f.id, label: f.label }))} />
          </Field>
          <Field label="Category">
            <Select className="w-full" value={category} onChange={setCategory} ariaLabel="Category"
              options={INCOME_CATEGORIES.map(c => ({ value: c.id, label: c.label, color: c.color }))} />
          </Field>
        </div>
        <Field label="Company / client" hint="Optional. Type a new name and it's added to your list.">
          <Combo value={company} onChange={setCompany} placeholder="e.g. Acme Labs"
            suggestions={companyList.map(c => c.name)} inputClassName="h-9" ariaLabel="Company" />
        </Field>
        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function ReceiveModal({ source, month, fmt, onClose, showToast }) {
  const suggested = source.kind === 'range' ? source.min : source.amount;
  const [amount, setAmount] = useState(suggested ? String(suggested) : '');
  const [date, setDate] = useState(month === ymd().slice(0, 7) ? ymd() : `${month}-01`);
  const save = e => {
    e?.preventDefault();
    if (num(amount) <= 0) return;
    transactions.add({
      type: 'income', amount: num(amount), category: source.category || 'salary',
      note: source.name, method: 'bank', date, source_id: source.id,
    });
    showToast?.('success', 'Income logged', `${fmt(num(amount))} from ${source.name}`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${source.name} · ${monthLabel(month, { month: 'long' })}`} width={400}
      footer={<Footer onCancel={onClose} onSave={save} label="Mark received" />}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Amount" hint={source.kind === 'range' ? `Expected ${fmt(source.min)}–${fmt(source.max)}` : undefined}>
          {numInput(amount, setAmount, '0')}
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function IncomeSourcesTab({ month, fmt, showToast }) {
  const sources = incomeSources.useAll();
  const tx = transactions.useAll();
  const companyList = companyStore.useAll();
  const [editing, setEditing] = useState(null); // null | 'new' | source
  const [receiving, setReceiving] = useState(null);

  const monthIncome = tx.filter(t => t.type === 'income' && (t.date || '').startsWith(month));
  const received = monthIncome.reduce((s, t) => s + num(t.amount), 0);
  const unlinked = monthIncome.filter(t => !t.source_id).reduce((s, t) => s + num(t.amount), 0);

  const active = sources.filter(s => s.active !== false);
  const [lo, hi] = active.reduce(([a, b], s) => {
    const [x, y] = expectedPerMonth(s);
    return [a + x, b + y];
  }, [0, 0]);

  const rows = sources.map(s => {
    const got = monthIncome.filter(t => t.source_id === s.id).reduce((a, t) => a + num(t.amount), 0);
    const [elo, ehi] = expectedPerMonth(s);
    const status = s.frequency === 'one-time' ? (got ? 'received' : 'none')
      : got >= elo && elo > 0 ? 'received' : got > 0 ? 'partial' : 'pending';
    return { s, got, elo, ehi, status };
  });

  const nextMonth = shiftMonth(month, 1);
  const isRange = s => s.kind === 'range';

  const markReceived = (s, m) => {
    if (isRange(s)) { setReceiving({ s, m }); return; }
    const t = transactions.add({
      type: 'income', amount: num(s.amount), category: s.category || 'salary', note: s.name, method: 'bank',
      date: m === ymd().slice(0, 7) ? ymd() : `${m}-01`, source_id: s.id,
    });
    showToast?.('success', `${monthLabel(m, { month: 'short' })} received`, `${fmt(t.amount)} · ${s.name}`, 6000,
      { label: 'Undo', onClick: () => transactions.remove(t.id) });
  };

  const undoReceived = (s, m) => {
    const rows = receivedFrom(tx, s.id, m);
    rows.forEach(t => transactions.remove(t.id));
    showToast?.('warning', `${monthLabel(m, { month: 'short' })} marked not received`, s.name, 6000,
      { label: 'Undo', onClick: () => rows.forEach(t => transactions.restore(t)) });
  };

  const remove = s => {
    incomeSources.remove(s.id);
    showToast?.('warning', 'Source removed', s.name, 6000, { label: 'Undo', onClick: () => incomeSources.restore(s) });
  };

  const expectedLabel = (s) => {
    const f = FREQUENCIES.find(x => x.id === s.frequency)?.label.toLowerCase() || 'monthly';
    const amt = s.kind === 'range' ? `${fmt(s.min)}–${fmt(s.max)}` : fmt(s.amount);
    return `${s.kind === 'range' ? 'Range' : 'Fixed'} · ${amt} ${f}`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Expected / month" value={lo === hi ? fmt(lo) : `${fmt(lo, { compact: true })}–${fmt(hi, { compact: true })}`}
          hint={`${active.length} active source${active.length === 1 ? '' : 's'}`} />
        <Stat label={`Received in ${monthLabel(month, { month: 'long' })}`} value={fmt(received)}
          tone={lo && received >= lo ? 'good' : undefined}
          hint={lo ? `${Math.round((received / lo) * 100)}% of minimum expected` : 'Add a source to compare'} />
        <Stat label="Still expected" value={fmt(Math.max(0, lo - (received - unlinked)))} hint="From your sources this month" />
        <Stat label="Unlinked income" value={fmt(unlinked)} hint="Logged without a source" />
      </div>

      <Card>
        <CardHeader icon={Briefcase} title="Income sources" meta={sources.length || null}
          action={<button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={13} /> Add source</button>} />
        {rows.length === 0 ? (
          <Empty icon={Briefcase} title="No income sources yet"
            body="Add where your money comes from — a fixed stipend, or a range like freelance ₹10k–30k — and see what has arrived each month." />
        ) : (
          <div className="pb-2">
            {rows.map(({ s, got, elo, ehi, status }) => (
              <div key={s.id} className="group flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-3 border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                <div className="min-w-0 flex-1 basis-[180px]">
                  <p className="text-[13.5px] text-slate-100 truncate flex items-center gap-2">
                    <span className="truncate">{s.name}</span>
                    <CompanyChip company={companyById(companyList, s.company_id)} />
                  </p>
                  <p className="text-[12px] text-slate-500 truncate">{expectedLabel(s)}</p>
                </div>
                <div className="w-full sm:w-44 order-last sm:order-none">
                  <div className="flex justify-between text-[12px] mb-1.5">
                    <span className="text-slate-300 tabular-nums">{fmt(got)}</span>
                    <span className="text-slate-500 tabular-nums">{elo === ehi ? fmt(elo) : `${fmt(elo, { compact: true })}–${fmt(ehi, { compact: true })}`}</span>
                  </div>
                  <Progress value={elo ? got / elo : got ? 1 : 0} tone={status === 'received' ? 'good' : 'neutral'} height={3} />
                </div>
                <MonthToggles
                  months={s.frequency === 'one-time' ? [month] : [month, nextMonth]}
                  isDone={m => receivedFrom(tx, s.id, m).length > 0}
                  doneLabel="received" todoLabel="received"
                  onDo={m => markReceived(s, m)} onUndo={m => undoReceived(s, m)} />
                <RowActions>
                  <button onClick={() => setEditing(s)} className="icon-btn" title="Edit"><Pencil size={13} /></button>
                  <button onClick={() => remove(s)} className="icon-btn hover:!text-rose-400" title="Delete"><Trash2 size={13} /></button>
                </RowActions>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <SourceModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {receiving && <ReceiveModal source={receiving.s} month={receiving.m} fmt={fmt} showToast={showToast} onClose={() => setReceiving(null)} />}
    </div>
  );
}

/* ═══════════════════════ Investments ═══════════════════════
   Each holding tracks money in (invested), money out (withdrawn) and what
   is sitting there now (balance). Profit = balance + withdrawn − invested,
   so taking money out of a trading account doesn't look like a loss. */

const MOVE_LABEL = { start: 'Started', add: 'Added', withdraw: 'Withdrew', value: 'Balance updated' };

function InvestmentModal({ initial, mode = 'edit', onClose, showToast, fmt }) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState(initial?.kind || 'mutual-fund');
  const [invested, setInvested] = useState(mode === 'edit' && initial ? String(initial.invested ?? '') : '');
  const [value, setValue] = useState(
    mode === 'value' ? String(currentValue(initial)) : mode === 'edit' && initial?.current_value != null ? String(initial.current_value) : '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(mode === 'edit' ? initial?.date || ymd() : ymd());
  const [note, setNote] = useState(mode === 'edit' ? initial?.note || '' : '');
  const [error, setError] = useState('');

  const push = (type, amt) => [...(Array.isArray(initial?.history) ? initial.history : []), { type, amount: amt, date, note: note.trim() }];

  const save = e => {
    e?.preventDefault();
    if (mode === 'topup') {
      const a = num(amount);
      if (a <= 0) return setError('Enter how much you added.');
      investments.update(initial.id, {
        invested: num(initial.invested) + a,
        current_value: currentValue(initial) + a,
        history: push('add', a),
      });
      showToast?.('success', 'Added', `${fmt(a)} to ${initial.name}`);
      return onClose();
    }
    if (mode === 'withdraw') {
      const a = num(amount);
      const bal = currentValue(initial);
      if (a <= 0) return setError('Enter how much you withdrew.');
      if (a > bal) return setError(`You only have ${fmt(bal)} in this right now.`);
      investments.update(initial.id, {
        withdrawn: num(initial.withdrawn) + a,
        current_value: bal - a,
        history: push('withdraw', a),
      });
      showToast?.('success', 'Withdrawal recorded', `${fmt(a)} from ${initial.name}`);
      return onClose();
    }
    if (mode === 'value') {
      if (value === '') return setError('Enter the balance shown in your app / account.');
      investments.update(initial.id, { current_value: num(value), history: push('value', num(value)) });
      return onClose();
    }
    if (!name.trim()) return setError('Give it a name.');
    if (num(invested) <= 0) return setError('Enter the amount invested.');
    const row = { name: name.trim(), kind, invested: num(invested), current_value: value === '' ? null : num(value), date, note: note.trim() };
    if (initial) investments.update(initial.id, row);
    else investments.add({ ...row, withdrawn: 0, history: [{ type: 'start', amount: num(invested), date, note: '' }] });
    onClose();
  };

  const title = mode === 'topup' ? `Add money · ${initial.name}`
    : mode === 'withdraw' ? `Withdraw · ${initial.name}`
    : mode === 'value' ? `Update balance · ${initial.name}`
    : initial ? 'Edit investment' : 'New investment';

  return (
    <Modal open onClose={onClose} title={title} width={mode === 'edit' ? 480 : 400}
      footer={<Footer onCancel={onClose} onSave={save} label={mode === 'withdraw' ? 'Record withdrawal' : 'Save'} />}>
      <form onSubmit={save} className="space-y-4">
        {(mode === 'topup' || mode === 'withdraw') && (
          <>
            <Field label={mode === 'topup' ? 'Amount added' : 'Amount withdrawn'}
              hint={mode === 'withdraw' ? `Balance now: ${fmt(currentValue(initial))}` : undefined}>
              {numInput(amount, setAmount, 'e.g. 2000')}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Note"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" className={inputCls} /></Field>
            </div>
          </>
        )}
        {mode === 'value' && (
          <Field label="Balance right now" hint="What your broker / app / bank shows today.">{numInput(value, setValue, '0')}</Field>
        )}
        {mode === 'edit' && (
          <>
            <Field label="Name">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Zerodha trading, Nifty 50 SIP" className={inputCls} />
            </Field>
            <Field label="Type">
              <Select className="w-full" value={kind} onChange={setKind} ariaLabel="Type"
                options={INVESTMENT_KINDS.map(k => ({ value: k.id, label: k.label, color: k.color }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total put in">{numInput(invested, setInvested, '0')}</Field>
              <Field label="Balance now">{numInput(value, setValue, 'Same as put in')}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Started on">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Note">
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" className={inputCls} />
              </Field>
            </div>
          </>
        )}
        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function InvestmentsTab({ fmt, showToast }) {
  const all = investments.useAll();
  const [modal, setModal] = useState(null); // { mode, initial }
  const [open, setOpen] = useState(null);

  const invested = all.reduce((s, i) => s + num(i.invested), 0);
  const withdrawn = all.reduce((s, i) => s + num(i.withdrawn), 0);
  const balance = all.reduce((s, i) => s + currentValue(i), 0);
  const gain = balance + withdrawn - invested;
  const pct = invested ? gain / invested : 0;

  const allocation = useMemo(() => {
    const m = new Map();
    for (const i of all) m.set(i.kind, (m.get(i.kind) || 0) + currentValue(i));
    return [...m.entries()].map(([id, total]) => ({ ...investmentKind(id), total })).filter(a => a.total > 0).sort((a, b) => b.total - a.total);
  }, [all]);

  const remove = i => {
    investments.remove(i.id);
    showToast?.('warning', 'Investment removed', i.name, 6000, { label: 'Undo', onClick: () => investments.restore(i) });
  };

  const undoLast = i => {
    const h = Array.isArray(i.history) ? i.history : [];
    const last = h[h.length - 1];
    if (!last || last.type === 'start') return;
    const prev = { invested: i.invested, withdrawn: i.withdrawn, current_value: i.current_value, history: h };
    const next = { history: h.slice(0, -1) };
    if (last.type === 'add') { next.invested = num(i.invested) - num(last.amount); next.current_value = currentValue(i) - num(last.amount); }
    if (last.type === 'withdraw') { next.withdrawn = num(i.withdrawn) - num(last.amount); next.current_value = currentValue(i) + num(last.amount); }
    if (last.type === 'value') {
      const before = [...h.slice(0, -1)].reverse().find(x => x.type === 'value');
      next.current_value = before ? num(before.amount) : null;
    }
    investments.update(i.id, next);
    showToast?.('success', 'Undone', `${MOVE_LABEL[last.type]} ${fmt(last.amount)}`, 6000,
      { label: 'Redo', onClick: () => investments.update(i.id, prev) });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total put in" value={fmt(invested)} hint={`${all.length} holding${all.length === 1 ? '' : 's'}`} />
        <Stat label="Withdrawn" value={fmt(withdrawn)} hint="Taken out so far" />
        <Stat label="Balance now" value={fmt(balance)} hint="What's in there today" />
        <Stat label="Profit / loss" value={fmt(gain, { sign: gain !== 0 })} tone={gain > 0 ? 'good' : gain < 0 ? 'bad' : undefined}
          hint={invested ? `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}% · balance + withdrawn − put in` : '—'} />
      </div>

      {allocation.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-slate-200">Where it sits</span>
            <span className="text-[12px] text-slate-500">By balance</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden gap-[2px] mb-3">
            {allocation.map(a => <div key={a.id} style={{ flex: a.total, background: a.color }} title={`${a.label}: ${fmt(a.total)}`} />)}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {allocation.map(a => (
              <span key={a.id} className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-400">
                <span className="w-2 h-2 rounded-sm" style={{ background: a.color }} />
                {a.label} <span className="text-slate-500 tabular-nums">{Math.round((a.total / (balance || 1)) * 100)}%</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader icon={PiggyBank} title="Holdings" meta={all.length || null}
          action={<button onClick={() => setModal({ mode: 'edit', initial: null })} className={btnPrimary}><Plus size={13} /> Add investment</button>} />
        {all.length === 0 ? (
          <Empty icon={PiggyBank} title="Nothing tracked yet"
            body="Add a trading account, SIP, stocks, FD, gold or crypto. Record money you add or withdraw, and update the balance whenever you check." />
        ) : (
          <div className="pb-2">
            <div className="hidden md:flex items-center gap-3 px-4 h-8 text-[11.5px] text-slate-500 border-t border-white/[0.04]">
              <span className="flex-1">Name</span>
              <span className="w-24 text-right">Put in</span>
              <span className="w-24 text-right">Withdrawn</span>
              <span className="w-24 text-right">Balance</span>
              <span className="w-24 text-right">Profit</span>
              <span className="w-[150px]" />
            </div>
            {all.map(i => {
              const k = investmentKind(i.kind);
              const bal = currentValue(i);
              const wd = num(i.withdrawn);
              const g = bal + wd - num(i.invested);
              const r = num(i.invested) ? g / num(i.invested) : 0;
              const history = Array.isArray(i.history) ? i.history : [];
              const expanded = open === i.id;
              return (
                <div key={i.id} className="border-t border-white/[0.04]">
                  <div className="group flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-white/[0.015] transition-colors">
                    <button onClick={() => setOpen(expanded ? null : i.id)} className="min-w-0 flex-1 basis-full md:basis-auto text-left cursor-pointer">
                      <p className="text-[13.5px] text-slate-100 truncate flex items-center gap-1.5">
                        {i.name}
                        <ChevronDown size={12} className="text-slate-600 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                      </p>
                      <p className="text-[12px] text-slate-500 truncate inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: k.color }} />{k.label}
                        {i.date && <span>· since {new Date(i.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
                      </p>
                    </button>
                    <div className="grid grid-cols-4 md:contents gap-2 w-full md:w-auto text-[13px] tabular-nums">
                      <span className="md:w-24 md:text-right text-slate-400"><span className="md:hidden block text-[11px] text-slate-600">Put in</span>{fmt(i.invested)}</span>
                      <span className="md:w-24 md:text-right text-slate-400"><span className="md:hidden block text-[11px] text-slate-600">Withdrawn</span>{wd ? fmt(wd) : '—'}</span>
                      <span className="md:w-24 md:text-right text-slate-100"><span className="md:hidden block text-[11px] text-slate-600">Balance</span>{fmt(bal)}</span>
                      <span className={`md:w-24 md:text-right ${g > 0 ? 'text-emerald-400' : g < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                        <span className="md:hidden block text-[11px] text-slate-600">Profit</span>
                        {fmt(g, { sign: g !== 0 })} <span className="text-[11px] opacity-80">{(r * 100).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="flex items-center ml-auto md:ml-0 md:w-[150px] justify-end">
                      <button onClick={() => setModal({ mode: 'topup', initial: i })} className="icon-btn" title="Add money"><Plus size={13} /></button>
                      <button onClick={() => setModal({ mode: 'withdraw', initial: i })} className="icon-btn" title="Withdraw" disabled={bal <= 0}><ArrowUpRight size={13} /></button>
                      <button onClick={() => setModal({ mode: 'value', initial: i })} className="icon-btn" title="Update balance"><TrendingUp size={13} /></button>
                      <button onClick={() => setModal({ mode: 'edit', initial: i })} className="icon-btn" title="Edit"><Pencil size={13} /></button>
                      <button onClick={() => remove(i)} className="icon-btn hover:!text-rose-400" title="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="px-4 pb-3 fade-up">
                      <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] divide-y divide-white/[0.04]">
                        {history.length === 0 && <p className="px-3 py-2.5 text-[12.5px] text-slate-500">No movements recorded yet.</p>}
                        {[...history].reverse().map((h, idx) => (
                          <div key={idx} className="flex items-center gap-3 px-3 h-9 text-[12.5px]">
                            <span className="text-slate-500 tabular-nums w-20 shrink-0">
                              {h.date ? new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                            </span>
                            <span className="text-slate-300 truncate flex-1">{MOVE_LABEL[h.type] || h.type}{h.note ? ` · ${h.note}` : ''}</span>
                            <span className={`tabular-nums ${h.type === 'withdraw' ? 'text-amber-400' : h.type === 'value' ? 'text-slate-300' : 'text-emerald-400'}`}>
                              {h.type === 'withdraw' ? '−' : h.type === 'value' ? '= ' : '+'}{fmt(h.amount)}
                            </span>
                            {idx === 0 && h.type !== 'start' && (
                              <button onClick={() => undoLast(i)} className="text-[11.5px] text-slate-500 hover:text-slate-100 cursor-pointer">Undo</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <p className="text-[12px] text-slate-600 text-center">A personal record, not advice. Balances update only when you enter them.</p>

      {modal && <InvestmentModal {...modal} fmt={fmt} showToast={showToast} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ═══════════════════════ Lending ═══════════════════════ */

function LoanModal({ initial, onClose }) {
  const [person, setPerson] = useState(initial?.person || '');
  const [direction, setDirection] = useState(initial?.direction || 'lent');
  const [amount, setAmount] = useState(initial ? String(initial.amount ?? '') : '');
  const [date, setDate] = useState(initial?.date || ymd());
  const [due, setDue] = useState(initial?.due_date || '');
  const [note, setNote] = useState(initial?.note || '');
  const [error, setError] = useState('');

  const save = e => {
    e?.preventDefault();
    if (!person.trim()) return setError('Who is it with?');
    if (num(amount) <= 0) return setError('Enter the amount.');
    const row = { person: person.trim(), direction, amount: num(amount), date, due_date: due || null, note: note.trim() };
    if (initial) loans.update(initial.id, row); else loans.add({ ...row, repaid: 0, settled: false });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit' : 'New entry'} width={460}
      footer={<Footer onCancel={onClose} onSave={save} />}>
      <form onSubmit={save} className="space-y-4">
        <Segmented value={direction} onChange={setDirection}
          options={[{ value: 'lent', label: 'I lent money' }, { value: 'borrowed', label: 'I borrowed money' }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={direction === 'lent' ? 'Lent to' : 'Borrowed from'}>
            <input value={person} onChange={e => setPerson(e.target.value)} placeholder="Name" className={inputCls} />
          </Field>
          <Field label="Amount">{numInput(amount, setAmount, '0')}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Due by">
            <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Note">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — what it was for" className={inputCls} />
        </Field>
        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function RepayModal({ loan, fmt, onClose, showToast }) {
  const left = outstanding(loan);
  const [amount, setAmount] = useState(String(left));
  const save = e => {
    e?.preventDefault();
    const a = Math.min(left, num(amount));
    if (a <= 0) return;
    const repaid = num(loan.repaid) + a;
    loans.update(loan.id, { repaid, settled: repaid >= num(loan.amount) });
    showToast?.('success', repaid >= num(loan.amount) ? 'Settled' : 'Repayment recorded', `${fmt(a)} · ${loan.person}`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${loan.direction === 'lent' ? 'Received back from' : 'Paid back to'} ${loan.person}`} width={380}
      footer={<Footer onCancel={onClose} onSave={save} label="Record" />}>
      <form onSubmit={save}>
        <Field label="Amount" hint={`${fmt(left)} outstanding`}>{numInput(amount, setAmount, '0')}</Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function LendingTab({ fmt, showToast }) {
  const all = loans.useAll();
  const [view, setView] = useState('open');
  const [editing, setEditing] = useState(null);
  const [repaying, setRepaying] = useState(null);
  const today = ymd();

  const owedToMe = all.filter(l => l.direction !== 'borrowed').reduce((s, l) => s + outstanding(l), 0);
  const iOwe = all.filter(l => l.direction === 'borrowed').reduce((s, l) => s + outstanding(l), 0);
  const overdue = all.filter(l => !l.settled && l.due_date && l.due_date < today);
  const list = all.filter(l => (view === 'open' ? !l.settled : l.settled));

  // Who owes the most, rolled up per person — the question you actually ask.
  const people = useMemo(() => {
    const m = new Map();
    for (const l of all) {
      if (l.settled) continue;
      const sign = l.direction === 'borrowed' ? -1 : 1;
      m.set(l.person, (m.get(l.person) || 0) + sign * outstanding(l));
    }
    return [...m.entries()].filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [all]);

  const remove = l => {
    loans.remove(l.id);
    showToast?.('warning', 'Entry deleted', l.person, 6000, { label: 'Undo', onClick: () => loans.restore(l) });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Owed to you" value={fmt(owedToMe)} tone={owedToMe ? 'good' : undefined}
          hint={`${all.filter(l => !l.settled && l.direction !== 'borrowed').length} open`} />
        <Stat label="You owe" value={fmt(iOwe)} tone={iOwe ? 'warn' : undefined}
          hint={`${all.filter(l => !l.settled && l.direction === 'borrowed').length} open`} />
        <Stat label="Net position" value={fmt(owedToMe - iOwe, { sign: owedToMe !== iOwe })} hint="Owed to you minus you owe" />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : undefined}
          hint={overdue.length ? `${fmt(overdue.reduce((s, l) => s + outstanding(l), 0))} past due` : 'Nothing past due'} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-3">
            <div className="flex items-center gap-2">
              <HandCoins size={14} className="text-slate-500" />
              <h3 className="text-[13px] font-medium text-slate-200">Lending</h3>
            </div>
            <div className="flex items-center gap-2">
              <Segmented size="sm" value={view} onChange={setView}
                options={[{ value: 'open', label: 'Open' }, { value: 'settled', label: 'Settled' }]} />
              <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={13} /> New</button>
            </div>
          </div>
          {list.length === 0 ? (
            <Empty icon={HandCoins} title={view === 'open' ? 'Nothing outstanding' : 'Nothing settled yet'}
              body={view === 'open' ? 'Record money you lend (or borrow) so you never have to remember who owes what.' : undefined} />
          ) : (
            <div className="pb-2">
              {list.map(l => {
                const left = outstanding(l);
                const isOver = !l.settled && l.due_date && l.due_date < today;
                const lent = l.direction !== 'borrowed';
                return (
                  <div key={l.id} className="group px-4 py-3 border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0 border ${lent ? 'border-emerald-400/25 text-emerald-300 bg-emerald-400/[0.06]' : 'border-amber-400/25 text-amber-300 bg-amber-400/[0.06]'}`}>
                        {l.person.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] text-slate-100 truncate">
                          {l.person} <span className="text-slate-500 text-[12px]">· {lent ? 'you lent' : 'you borrowed'}</span>
                        </p>
                        <p className="text-[12px] text-slate-500 truncate">
                          {new Date(l.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          {l.due_date && <span className={isOver ? 'text-rose-400' : ''}> · due {new Date(l.due_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{isOver ? ' (overdue)' : ''}</span>}
                          {l.note && <span> · {l.note}</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[13.5px] font-medium tabular-nums ${l.settled ? 'text-slate-500' : lent ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {l.settled ? fmt(l.amount) : fmt(left)}
                        </p>
                        <p className="text-[11.5px] text-slate-500 tabular-nums">{l.settled ? 'settled' : num(l.repaid) ? `of ${fmt(l.amount)}` : 'outstanding'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 pl-10">
                      {!l.settled && num(l.repaid) > 0 && (
                        <Progress className="max-w-[160px]" value={num(l.repaid) / num(l.amount)} tone="neutral" height={3} />
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {!l.settled && (
                          <>
                            <button onClick={() => setRepaying(l)} className="btn-ghost h-7 px-2.5 rounded-md text-[12px] cursor-pointer">Record repayment</button>
                            <button onClick={() => { loans.update(l.id, { settled: true, repaid: num(l.amount) }); showToast?.('success', 'Marked settled', l.person); }}
                              className="icon-btn" title="Mark settled"><CheckCircle2 size={14} /></button>
                          </>
                        )}
                        {l.settled && (
                          <button onClick={() => loans.update(l.id, { settled: false })} className="btn-ghost h-7 px-2.5 rounded-md text-[12px] cursor-pointer">Reopen</button>
                        )}
                        <button onClick={() => setEditing(l)} className="icon-btn" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => remove(l)} className="icon-btn hover:!text-rose-400" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="By person" />
          <div className="px-4 pb-4 space-y-2.5">
            {people.length === 0 && <p className="text-[12.5px] text-slate-500">All square with everyone.</p>}
            {people.map(([name, v]) => (
              <div key={name} className="flex items-center justify-between text-[13px]">
                <span className="text-slate-300 truncate pr-3">{name}</span>
                <span className={`tabular-nums ${v > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {v > 0 ? `owes you ${fmt(v)}` : `you owe ${fmt(-v)}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {editing && <LoanModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {repaying && <RepayModal loan={repaying} fmt={fmt} showToast={showToast} onClose={() => setRepaying(null)} />}
    </div>
  );
}

export function CompanyChip({ company }) {
  if (!company) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-400 px-1.5 h-5 rounded-md bg-white/[0.04] border border-white/[0.06] shrink-0">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: company.color }} />{company.name}
    </span>
  );
}

/* ═══════════════════════ Income ideas ═══════════════════════ */

function IdeaModal({ initial, onClose }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [min, setMin] = useState(initial?.potential_min != null ? String(initial.potential_min) : '');
  const [max, setMax] = useState(initial?.potential_max != null ? String(initial.potential_max) : '');
  const [effort, setEffort] = useState(initial?.effort || 'medium');
  const [status, setStatus] = useState(initial?.status || 'idea');
  const [note, setNote] = useState(initial?.note || '');
  const [error, setError] = useState('');

  const save = e => {
    e?.preventDefault();
    if (!title.trim()) return setError('What is the idea?');
    const row = {
      title: title.trim(), effort, status, note: note.trim(),
      potential_min: min === '' ? null : num(min),
      potential_max: max === '' ? (min === '' ? null : num(min)) : num(max),
    };
    if (initial) incomeIdeas.update(initial.id, row); else incomeIdeas.add(row);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit income idea' : 'New income idea'} width={480}
      footer={<Footer onCancel={onClose} onSave={save} />}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Idea">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sell Notion templates, weekend tutoring" className={inputCls} />
        </Field>
        <Field label="Potential per month" hint="A rough range is fine. Leave max empty for a single number.">
          <div className="flex items-center gap-2">
            {numInput(min, setMin, 'Min')}
            <span className="text-slate-500 text-[13px]">to</span>
            {numInput(max, setMax, 'Max')}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Effort">
            <Select className="w-full" value={effort} onChange={setEffort} ariaLabel="Effort"
              options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
          </Field>
          <Field label="Status">
            <Select className="w-full" value={status} onChange={setStatus} ariaLabel="Status"
              options={IDEA_STATUSES.map(st => ({ value: st.id, label: st.label, color: st.color }))} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="First step, who would pay for it, what it needs…"
            className="input-premium w-full px-3 py-2 rounded-lg text-[13px] resize-none" />
        </Field>
        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function IncomeIdeasTab({ fmt, showToast, onOpenSources }) {
  const all = incomeIdeas.useAll();
  const [filter, setFilter] = useState('active');
  const [editing, setEditing] = useState(null);

  const visible = all.filter(i => (filter === 'all' ? true : filter === 'active' ? i.status === 'idea' || i.status === 'testing' : i.status === filter));
  const live = all.filter(i => i.status === 'testing' || i.status === 'idea');
  const potLo = live.reduce((acc, i) => acc + num(i.potential_min), 0);
  const potHi = live.reduce((acc, i) => acc + num(i.potential_max ?? i.potential_min), 0);
  const count = st => all.filter(i => i.status === st).length;

  const promote = idea => {
    const lo = num(idea.potential_min);
    const hi = num(idea.potential_max ?? idea.potential_min);
    const ranged = hi > lo;
    const src = incomeSources.add({
      name: idea.title, category: 'freelance', frequency: 'monthly', active: true, company_id: null,
      kind: ranged ? 'range' : 'fixed',
      amount: ranged ? null : lo,
      min: ranged ? lo : null,
      max: ranged ? hi : null,
    });
    incomeIdeas.update(idea.id, { status: 'earning', source_id: src.id });
    showToast?.('success', 'Added as an income source', idea.title);
  };

  const remove = i => {
    incomeIdeas.remove(i.id);
    showToast?.('warning', 'Idea deleted', i.title, 6000, { label: 'Undo', onClick: () => incomeIdeas.restore(i) });
  };

  const potential = i => {
    if (i.potential_min == null && i.potential_max == null) return 'No estimate';
    const lo = num(i.potential_min), hi = num(i.potential_max ?? i.potential_min);
    return lo === hi ? `${fmt(lo)}/mo` : `${fmt(lo, { compact: true })}–${fmt(hi, { compact: true })}/mo`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Ideas" value={count('idea')} hint="Not started yet" />
        <Stat label="Testing" value={count('testing')} tone={count('testing') ? 'warn' : undefined} hint="Trying them out" />
        <Stat label="Earning" value={count('earning')} tone={count('earning') ? 'good' : undefined} hint="Turned into income" />
        <Stat label="Untapped potential" value={potLo === potHi ? fmt(potLo) : `${fmt(potLo, { compact: true })}–${fmt(potHi, { compact: true })}`} hint="Per month, ideas and tests" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-slate-500" />
            <h3 className="text-[13px] font-medium text-slate-200">Income ideas</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented size="sm" value={filter} onChange={setFilter}
              options={[{ value: 'active', label: 'Active' }, { value: 'earning', label: 'Earning' }, { value: 'dropped', label: 'Dropped' }, { value: 'all', label: 'All' }]} />
            <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={13} /> New idea</button>
          </div>
        </div>
        {visible.length === 0 ? (
          <Empty icon={Sparkles} title="No income ideas here"
            body="Park every way you could make extra money with a rough monthly potential, then move each from idea to testing to earning." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 px-4 pb-4">
            {visible.map(i => {
              return (
                <div key={i.id} className="group panel panel-hover p-3.5 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <p className={`text-[13.5px] font-medium flex-1 ${i.status === 'dropped' ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{i.title}</p>
                    <RowActions>
                      <button onClick={() => setEditing(i)} className="icon-btn !w-7 !h-7" title="Edit"><Pencil size={12} /></button>
                      <button onClick={() => remove(i)} className="icon-btn !w-7 !h-7 hover:!text-rose-400" title="Delete"><Trash2 size={12} /></button>
                    </RowActions>
                  </div>
                  {i.note && <p className="text-[12.5px] text-slate-400 line-clamp-2 leading-relaxed">{i.note}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                    <Select size="xs" value={i.status} onChange={v => incomeIdeas.update(i.id, { status: v })} ariaLabel="Status"
                      className="!w-auto" options={IDEA_STATUSES.map(x => ({ value: x.id, label: x.label, color: x.color }))} />
                    <span className="text-[12px] text-slate-400 tabular-nums">{potential(i)}</span>
                    <span className="text-[12px] text-slate-500">· {i.effort || 'medium'} effort</span>
                    {(i.status === 'idea' || i.status === 'testing') && (
                      <button onClick={() => promote(i)} className="ml-auto text-[12px] text-slate-400 hover:text-slate-100 inline-flex items-center gap-1 cursor-pointer transition-colors">
                        Mark earning <ArrowRight size={12} />
                      </button>
                    )}
                    {i.status === 'earning' && i.source_id && (
                      <button onClick={onOpenSources} className="ml-auto text-[12px] text-emerald-400/80 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer transition-colors">
                        View source <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {editing && <IdeaModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ═══════════════════════ EMIs ═══════════════════════ */

function EmiModal({ initial, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [amount, setAmount] = useState(initial?.emi_amount != null ? String(initial.emi_amount) : '');
  const [months, setMonths] = useState(initial?.total_months ? String(initial.total_months) : '');
  const [error, setError] = useState('');

  const save = e => {
    e?.preventDefault();
    if (!name.trim()) return setError('What is it for?');
    if (num(amount) <= 0) return setError('Enter the monthly amount.');
    const total = months.trim() === '' ? null : Math.round(num(months));
    if (total !== null && total <= 0) return setError('Months must be more than 0, or leave it empty.');
    const row = { name: name.trim(), emi_amount: num(amount), total_months: total };
    if (initial) emis.update(initial.id, row);
    else emis.add({ ...row, start_month: ymd().slice(0, 7), paid_before: 0, payments: [], closed: false });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit EMI' : 'New EMI'} width={420}
      footer={<Footer onCancel={onClose} onSave={save} />}>
      <form onSubmit={save} className="space-y-4">
        <Field label="For">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. iPhone, Laptop, Rent, Netflix" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount every month">{numInput(amount, setAmount, '0')}</Field>
          <Field label="For how many months" hint="Leave empty if it never ends.">{numInput(months, setMonths, 'No end')}</Field>
        </div>
        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function EmiTab({ fmt, showToast }) {
  const all = emis.useAll();
  const sources = incomeSources.useAll();
  const [view, setView] = useState('active');
  const [editing, setEditing] = useState(null);

  const rows = all.map(e => ({ e, st: emiStats(e) }));
  const active = rows.filter(r => !r.st.done);
  const monthly = active.reduce((acc, r) => acc + r.st.amount, 0);
  const finite = active.filter(r => !r.st.endless);
  const leftTotal = finite.reduce((acc, r) => acc + r.st.left, 0);
  const endless = active.length - finite.length;
  const unpaid = active.filter(r => !r.st.paidThisMonth);
  const expectedIncome = sources.filter(s => s.active !== false).reduce((acc, s) => acc + expectedPerMonth(s)[0], 0);
  const list = rows.filter(r => (view === 'active' ? !r.st.done : r.st.done));
  const thisMonth = ymd().slice(0, 7);

  const markPaid = (e, st) => {
    const month = st.nextMonth;
    const date = month === thisMonth ? ymd() : `${month}-01`;
    const tx = transactions.add({ type: 'expense', amount: st.amount, category: 'emi', note: `EMI · ${e.name}`, method: 'bank', date, emi_id: e.id });
    const payments = [...(e.payments || []), month];
    const finished = !st.endless && (Number(e.paid_before) || 0) + payments.length >= (Number(e.total_months) || 0);
    emis.update(e.id, { payments, closed: finished || e.closed });
    showToast?.('success', finished ? 'Last EMI paid — closed' : 'Marked paid',
      `${fmt(st.amount)} · ${e.name} · ${monthLabel(month, { month: 'short' })}`, 6000,
      { label: 'Undo', onClick: () => { transactions.remove(tx.id); emis.update(e.id, { payments: e.payments || [], closed: e.closed }); } });
  };

  const undoPaid = (e, m) => {
    const rows = transactions.getAll().filter(t => t.emi_id === e.id && (t.date || '').startsWith(m));
    const before = { payments: e.payments || [], closed: e.closed };
    rows.forEach(t => transactions.remove(t.id));
    emis.update(e.id, { payments: (e.payments || []).filter(x => x !== m), closed: false });
    showToast?.('warning', `${monthLabel(m, { month: 'short' })} marked unpaid`, e.name, 6000,
      { label: 'Undo', onClick: () => { rows.forEach(t => transactions.restore(t)); emis.update(e.id, before); } });
  };

  const remove = e => {
    emis.remove(e.id);
    showToast?.('warning', 'EMI deleted', e.name, 6000, { label: 'Undo', onClick: () => emis.restore(e) });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Going out every month" value={fmt(monthly)}
          hint={expectedIncome ? `${Math.round((monthly / expectedIncome) * 100)}% of expected income` : `${active.length} active`} />
        <Stat label="Still to pay" value={fmt(leftTotal)} hint={endless ? `+ ${endless} with no end date` : 'Across all EMIs'} />
        <Stat label="Unpaid this month" value={unpaid.length} tone={unpaid.length ? 'warn' : active.length ? 'good' : undefined}
          hint={unpaid.length ? fmt(unpaid.reduce((a, r) => a + r.st.amount, 0)) : active.length ? 'All paid' : 'Nothing set up'} />
        <Stat label="Paid this month" value={fmt(active.filter(r => r.st.paidThisMonth).reduce((a, r) => a + r.st.amount, 0))}
          hint={`${active.length - unpaid.length} of ${active.length}`} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock size={14} className="text-slate-500" />
            <h3 className="text-[13px] font-medium text-slate-200">EMIs</h3>
          </div>
          <div className="flex items-center gap-2">
            <Segmented size="sm" value={view} onChange={setView}
              options={[{ value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }]} />
            <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={13} /> Add EMI</button>
          </div>
        </div>
        {list.length === 0 ? (
          <Empty icon={CalendarClock} title={view === 'active' ? 'No EMIs yet' : 'Nothing closed yet'}
            body={view === 'active' ? 'Add what goes out every month. Set the number of months, or leave it empty if it never ends.' : undefined} />
        ) : (
          <div className="pb-2">
            {list.map(({ e, st }) => (
              <div key={e.id} className="group flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                <div className="min-w-0 flex-1 basis-[180px]">
                  <p className="text-[13.5px] text-slate-100 truncate">{e.name}</p>
                  <p className="text-[12px] text-slate-500 truncate">
                    {fmt(st.amount)}/month · {st.endless ? `${st.paid} paid · no end date` : `${st.paid}/${st.total} paid`}
                    {st.endMonth && <span> · ends {monthLabel(st.endMonth, { month: 'short', year: 'numeric' })}</span>}
                  </p>
                </div>
                <div className="w-full sm:w-44 order-last sm:order-none">
                  {st.endless ? (
                    <span className="text-[12px] text-slate-500">Ongoing</span>
                  ) : (
                    <>
                      <div className="flex justify-between text-[12px] mb-1.5">
                        <span className="text-slate-400 tabular-nums">{Math.round((st.paid / (st.total || 1)) * 100)}%</span>
                        <span className="text-slate-500 tabular-nums">{fmt(st.left)} left</span>
                      </div>
                      <Progress value={st.paid / (st.total || 1)} tone={st.done ? 'good' : 'neutral'} height={3} />
                    </>
                  )}
                </div>
                {!st.done ? (
                  <>
                    {!st.paidThisMonth && <span className="text-[12px] text-amber-400 shrink-0">Due this month</span>}
                    <MonthToggles
                      months={[...new Set([thisMonth, ...(e.payments || []).filter(m => m >= thisMonth), st.nextMonth])].sort()}
                      isDone={m => (e.payments || []).includes(m)}
                      doneLabel="paid" todoLabel="paid"
                      onDo={() => markPaid(e, st)} onUndo={m => undoPaid(e, m)} />
                  </>
                ) : (
                  <button onClick={() => emis.update(e.id, { closed: false })} className="btn-ghost h-7 px-2.5 rounded-md text-[12px] cursor-pointer shrink-0">Reopen</button>
                )}
                <RowActions>
                  {!st.done && st.endless && (
                    <button onClick={() => emis.update(e.id, { closed: true })} className="icon-btn" title="Stop — no longer paying"><CheckCircle2 size={13} /></button>
                  )}
                  <button onClick={() => setEditing(e)} className="icon-btn" title="Edit"><Pencil size={13} /></button>
                  <button onClick={() => remove(e)} className="icon-btn hover:!text-rose-400" title="Delete"><Trash2 size={13} /></button>
                </RowActions>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="text-[12px] text-slate-600 text-center">Marking an EMI paid also adds it to this month's spending under “EMI”.</p>

      {editing && <EmiModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
