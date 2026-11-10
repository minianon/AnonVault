/* The Ideas section: general/project ideas and side-income ideas, side by
   side under one roof. Both views stay mounted so switching tabs keeps each
   one's search, filters and scroll. */

import { useState } from 'react';
import IdeaVaultView from './IdeaVaultView';
import { IncomeIdeasTab } from './MoneyExtras';
import { PageHeader, Segmented } from './ui';
import { formatMoney, useMoneySettings } from '../services/money';

const KEY = 'anonvault_ideas_tab';

export default function IdeasSection({ setActiveTab, showToast, onLock, onMenuToggle, ...vaultProps }) {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem(KEY) === 'income' ? 'income' : 'ideas'; } catch { return 'ideas'; }
  });
  const switchTab = t => { setTab(t); try { localStorage.setItem(KEY, t); } catch { /* ignore */ } };
  const settings = useMoneySettings();
  const fmt = (n, o) => formatMoney(n, settings.currency, o);

  const tabs = (
    <div className="ml-1 sm:ml-2">
      <Segmented size="sm" value={tab} onChange={switchTab}
        options={[{ value: 'ideas', label: 'Project' }, { value: 'income', label: 'Income' }]} />
    </div>
  );

  return (
    <>
      <div className={tab === 'ideas' ? 'contents' : 'hidden'}>
        <IdeaVaultView {...vaultProps} showToast={showToast} onLock={onLock} onMenuToggle={onMenuToggle} headerExtra={tabs} />
      </div>
      <div className={tab === 'income' ? 'h-full flex flex-col' : 'hidden'}>
        <PageHeader title="Ideas" subtitle="Ways to earn more" onMenuToggle={onMenuToggle} onLock={onLock}>
          {tabs}
        </PageHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 fade-up" key={tab}>
            <IncomeIdeasTab fmt={fmt} showToast={showToast}
              onOpenSources={() => {
                setActiveTab?.('money');
                window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'income' }));
              }} />
          </div>
        </div>
      </div>
    </>
  );
}
