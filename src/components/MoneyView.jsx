import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings2, Download } from 'lucide-react';
import {
  transactions, emis, categoryMeta, isExtraIncome, emiStats,
  useMoneySettings, setMoneySettings, formatMoney, ymd, monthKey, shiftMonth, monthLabel,
} from '../services/money';
import { IncomeSourcesTab, InvestmentsTab, LendingTab, EmiTab } from './MoneyExtras';
import MoneyOverview from './MoneyOverview';
import { PageHeader, Modal, Field, Select } from './ui';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'];

const MONEY_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'income',   label: 'Income sources' },
  { id: 'emi',      label: 'EMIs' },
  { id: 'invest',   label: 'Investments' },
  { id: 'lending',  label: 'Lending' },
];

/*
 * Money: income in, EMIs out, what's invested and what's lent.
 * Overview summarises every tab and is where extra income (Trade, Topmate,
 * Colab, Other) is logged. Day-to-day expense tracking was removed; any
 * expenses logged before are kept in the data (and in the CSV export).
 */
export default function MoneyView({ onLock, onMenuToggle, showToast }) {
  const all = transactions.useAll();
  const emiList = emis.useAll();
  const settings = useMoneySettings();
  const [month, setMonth] = useState(monthKey());
  const [tab, setTab] = useState(() => {
    try { const t = localStorage.getItem('anonvault_money_tab'); return MONEY_TABS.some(x => x.id === t) ? t : 'overview'; } catch { return 'overview'; }
  });
  const switchTab = t => { setTab(t); try { localStorage.setItem('anonvault_money_tab', t); } catch { /* ignore */ } };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const amountRef = useRef(null);

  // Other sections can ask for a specific tab (e.g. Today → EMIs).
  useEffect(() => {
    const onTab = e => { if (e.detail) switchTab(e.detail); };
    window.addEventListener('anonvault:money-tab', onTab);
    return () => window.removeEventListener('anonvault:money-tab', onTab);
  }, []);

  // "N" (or "Income" on Today) jumps to the extra-income amount.
  useEffect(() => {
    const onNew = () => {
      if (!amountRef.current?.closest('[aria-hidden="false"]')) return;
      switchTab('overview');
      setTimeout(() => amountRef.current?.focus(), 30);
    };
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const cur = settings.currency;
  const fmt = (n, o) => formatMoney(n, cur, o);
  const monthIncome = all.filter(t => t.type === 'income' && (t.date || '').startsWith(month));
  const incomeTotal = monthIncome.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const extraTotal = monthIncome.filter(isExtraIncome).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const emisDue = emiList.map(e => emiStats(e)).filter(st => !st.done && !st.paidThisMonth).length;

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
          { value: fmt(incomeTotal), label: `in · ${monthLabel(month, { month: 'short' })}`, tone: incomeTotal ? 'good' : undefined, always: true },
          { value: extraTotal ? fmt(extraTotal) : null, label: 'extra' },
          { value: emisDue, label: emisDue === 1 ? 'EMI due' : 'EMIs due', tone: 'warn' },
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
          <button onClick={() => setSettingsOpen(true)} className="icon-btn" title="Currency"><Settings2 size={14} /></button>
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

          {tab === 'overview' && (
            <MoneyOverview month={month} fmt={fmt} showToast={showToast} switchTab={switchTab} amountRef={amountRef} onMonthChange={setMonth} />
          )}
          {tab === 'income' && <IncomeSourcesTab key="income" month={month} fmt={fmt} showToast={showToast} />}
          {tab === 'emi' && <EmiTab key="emi" fmt={fmt} showToast={showToast} />}
          {tab === 'invest' && <InvestmentsTab key="invest" fmt={fmt} showToast={showToast} />}
          {tab === 'lending' && <LendingTab key="lending" fmt={fmt} showToast={showToast} />}
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} />}
    </div>
  );
}

function SettingsModal({ onClose, settings }) {
  const [currency, setCurrency] = useState(settings.currency);
  const save = e => {
    e?.preventDefault();
    setMoneySettings({ currency });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Currency"
      footer={<>
        <button onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
      </>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Currency">
          <Select className="w-full" value={currency} onChange={setCurrency} ariaLabel="Currency"
            options={CURRENCIES.map(c => ({ value: c, label: c }))} />
        </Field>
      </form>
    </Modal>
  );
}
