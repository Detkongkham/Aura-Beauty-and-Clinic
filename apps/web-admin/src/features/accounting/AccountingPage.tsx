import { BookOpenCheck, CalendarRange, HandCoins, Landmark, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateField } from '@/components/shared/DateField';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/features/branches/branches.api';
import { useAuth } from '@/features/auth/useAuth';
import { useUiStore } from '@/store/ui.store';

import { isoDaysAgo } from './accounting.lib';
import { JournalPanel } from './JournalPanel';
import { LiabilitiesPanel } from './LiabilitiesPanel';
import { SettingsPanel } from './SettingsPanel';
import { TipsPanel } from './TipsPanel';

type Tab = 'liabilities' | 'journal' | 'tips' | 'settings';

/**
 * Wave 11 — /finance/accounting: the accountant's view of the ledger.
 * Liabilities still owed (IFRS 15), double-entry journal export, staff tips, and finance policy.
 */
export function AccountingPage() {
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const { data: branches = [] } = useBranches();
  const activeBranch = useUiStore((s) => s.activeBranchId);
  const lockedBranch = role !== 'SUPER_ADMIN' ? (user?.branchId ?? null) : null;

  const [tab, setTab] = useState<Tab>('liabilities');
  const [branchId, setBranchId] = useState<string>(lockedBranch ?? activeBranch ?? 'all');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const scope = lockedBranch ?? branchId;

  const tabs: { key: Tab; icon: typeof Landmark }[] = [
    { key: 'liabilities', icon: Landmark },
    { key: 'journal', icon: BookOpenCheck },
    { key: 'tips', icon: HandCoins },
    { key: 'settings', icon: Settings2 },
  ];

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="min-w-0">
          <h1>{t('accounting.title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('accounting.subtitle')}</p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-3">
          <TabsList>
            {tabs.map(({ key, icon: Icon }) => (
              <TabsTrigger key={key} value={key}>
                <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t(`accounting.tabs.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </StickyPageHeader>

      {tab !== 'settings' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {t('accounting.period')}
          </span>
          <DateField aria-label={t("accounting.from")} className="w-40" value={from} max={to} onChange={(v) => v && setFrom(v)} />
          <span className="text-xs text-muted-foreground">—</span>
          <DateField aria-label={t("accounting.to")} className="w-40" value={to} min={from} onChange={(v) => v && setTo(v)} />
          <div className="ml-auto w-52">
            <Select
              aria-label={t('accounting.branch')}
              value={scope}
              disabled={!!lockedBranch}
              onChange={(e) => setBranchId(e.target.value)}
              options={[{ value: 'all', label: t('accounting.allBranches') }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </div>
        </div>
      ) : null}

      {tab === 'liabilities' ? <LiabilitiesPanel branchId={scope} from={from} to={to} /> : null}
      {tab === 'journal' ? <JournalPanel branchId={scope} from={from} to={to} /> : null}
      {tab === 'tips' ? <TipsPanel branchId={scope} from={from} to={to} /> : null}
      {tab === 'settings' ? <SettingsPanel /> : null}
    </div>
  );
}
