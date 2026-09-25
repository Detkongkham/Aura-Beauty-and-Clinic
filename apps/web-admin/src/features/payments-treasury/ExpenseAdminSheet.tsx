import type { ExpenseCategoryKind, RecurringExpenseView } from '@abcp/shared-types';
import { EXPENSE_CATEGORY_KINDS } from '@abcp/shared-types';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Coins, Copy, Pencil, Plus, Repeat, Scale, Tags, Target, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { currentMonthYear, monthLabel, shiftMonth, TONE } from '@/features/payroll/payroll.lib';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { CashFundsPanel } from './CashFundsPanel';
import { CategoryGlyph } from './expense.parts';
import { RecurringSplitEditor } from './RecurringSplitEditor';
import { splitValid, type SplitRow } from './recurringSplit.lib';
import {
  useExpenseBudgets,
  useExpenseCategories,
  useExpenseSettings,
  useRecurringExpenses,
  useSaveCategory,
  useSaveExpenseBudgets,
  useSaveRecurring,
  useUpdateExpenseSettings,
} from './expenses.api';
import { budgetTone, categoryColor, categoryName } from './expenses.lib';

interface Props {
  open: boolean;
  onClose: () => void;
  branches: { id: string; name: string }[];
  defaultBranchId?: string;
  canManage: boolean;
  canApprove: boolean;
  isSuper: boolean;
  /** Which tab to land on when opened (e.g. "Set budgets" from insights). */
  initialTab?: 'recurring' | 'budgets' | 'cash' | 'rules' | 'categories';
}

/**
 * Configuration behind the expense flow: monthly recurring rules (the fixed-cost base) and the
 * category list. The recurring tab leads with what those rules add up to per month, because that
 * number — not the list — is what an owner needs when planning.
 */
export function ExpenseAdminSheet({ open, onClose, branches, defaultBranchId, canManage, canApprove, isSuper, initialTab = 'recurring' }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const { data: categories = [] } = useExpenseCategories(true);
  const { data: rules = [] } = useRecurringExpenses();
  const saveRule = useSaveRecurring();
  const saveCat = useSaveCategory();

  const [rule, setRule] = useState({ title: '', amount: '', dayOfMonth: '1', categoryId: '', branchId: '' });
  const [ruleSplit, setRuleSplit] = useState<SplitRow[]>([]);
  const [cat, setCat] = useState<{ code: string; nameLo: string; nameEn: string; kind: ExpenseCategoryKind }>({ code: '', nameLo: '', nameEn: '', kind: 'OPERATING' });
  const [editing, setEditing] = useState<string | null>(null);

  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
  const branchId = rule.branchId || defaultBranchId || branches[0]?.id || '';
  const amount = Number(rule.amount);
  const ruleValid = rule.title.trim() && rule.categoryId && branchId && Number.isFinite(amount) && amount > 0 && splitValid(ruleSplit);
  const catValid = /^[A-Z0-9_]{2,40}$/.test(cat.code) && cat.nameLo.trim() && cat.nameEn.trim();
  const active = rules.filter((r) => r.isActive);
  const monthly = active.filter((r) => r.currency === 'LAK').reduce((s, r) => s + r.amount, 0);
  const sorted = [...rules].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.nextDueDate.localeCompare(b.nextDueDate));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{t('payTreasury.exp.settings')}</SheetTitle>
          <SheetDescription>{t('payTreasury.exp.settingsHint')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="py-4">
          <Tabs key={open ? initialTab : 'closed'} defaultValue={initialTab}>
            <TabsList className="max-w-full overflow-x-auto [scrollbar-width:none] [&>button]:whitespace-nowrap">
              <TabsTrigger value="recurring">
                <Repeat className="h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.recurring')}
                <span className="ml-1 tabular-nums text-muted-foreground">{active.length}</span>
              </TabsTrigger>
              <TabsTrigger value="budgets">
                <Target className="h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.budgets')}
              </TabsTrigger>
              <TabsTrigger value="cash">
                <Coins className="h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.petty.tab')}
              </TabsTrigger>
              <TabsTrigger value="rules">
                <Scale className="h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.rules')}
              </TabsTrigger>
              <TabsTrigger value="categories">
                <Tags className="h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.categories')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="budgets">
              <BudgetEditor branches={branches} defaultBranchId={defaultBranchId} canEdit={canApprove} lang={lang} />
            </TabsContent>

            <TabsContent value="cash">
              <CashFundsPanel branches={branches} defaultBranchId={defaultBranchId} canEdit={canApprove} />
            </TabsContent>

            <TabsContent value="rules">
              <RulesEditor isSuper={isSuper} />
            </TabsContent>

            <TabsContent value="recurring" className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/[0.05] px-3 py-2.5">
                <div>
                  <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.fixedMonthly')}</p>
                  <p className="text-xl font-bold tabular-nums">
                    <CurrencyText amount={monthly} />
                  </p>
                </div>
                <p className="max-w-[220px] text-right text-2xs text-muted-foreground">{t('payTreasury.exp.recurringHint')}</p>
              </div>

              {rules.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{t('payTreasury.exp.noRecurring')}</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sorted.map((r) =>
                    editing === r.id ? (
                      <RuleEditor key={r.id} rule={r} branches={branches} isSuper={isSuper} busy={saveRule.isPending} onCancel={() => setEditing(null)} onSave={(update) => saveRule.mutate({ id: r.id, update }, { onSuccess: () => { toast.success(t('common.saved')); setEditing(null); }, onError })} />
                    ) : (
                      <li key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${r.isActive ? '' : 'opacity-60'}`}>
                        <CategoryGlyph code={categories.find((c) => c.id === r.category.id)?.code} color={categoryColor(r.category.id, categories)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="truncate text-2xs text-muted-foreground">
                            {r.branchName} · {categoryName(r.category, lang)}
                          </p>
                          {r.allocations?.length ? (
                            <p className="truncate text-2xs text-muted-foreground">
                              {t('payTreasury.exp.recurringSplit.label')}: {r.allocations.map((a) => `${a.branchName} ${a.percent}%`).join(' · ')}
                            </p>
                          ) : null}
                          {r.isActive ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-info">
                              <CalendarClock className="h-3 w-3" aria-hidden="true" />
                              {t('payTreasury.exp.nextDue', { date: formatDate(r.nextDueDate), day: r.dayOfMonth })}
                            </p>
                          ) : null}
                        </div>
                        <CurrencyText amount={r.amount} currency={r.currency as 'LAK'} className="shrink-0 text-sm font-semibold" />
                        {canManage ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t('payTreasury.exp.editRule', { name: r.title })} onClick={() => setEditing(r.id)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Switch
                          checked={r.isActive}
                          disabled={!canManage}
                          aria-label={t('payTreasury.exp.toggleRule', { name: r.title })}
                          onCheckedChange={(isActive) => saveRule.mutate({ id: r.id, update: { isActive } }, { onError })}
                        />
                      </li>
                    ),
                  )}
                </ul>
              )}

              {canManage ? (
                <fieldset className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-medium">{t('payTreasury.exp.addRule')}</legend>
                  <Input aria-label={t('payTreasury.exp.title')} placeholder={t('payTreasury.exp.rulePh')} value={rule.title} onChange={(e) => setRule({ ...rule, title: e.target.value })} className="h-9 sm:col-span-2" />
                  <Select
                    aria-label={t('payTreasury.exp.category')}
                    value={rule.categoryId}
                    placeholder={t('payTreasury.exp.pickCategory')}
                    onChange={(e) => setRule({ ...rule, categoryId: e.target.value })}
                    options={categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: categoryName(c, lang) }))}
                  />
                  <Select
                    aria-label={t('payTreasury.col.branch')}
                    value={branchId}
                    disabled={branches.length <= 1}
                    onChange={(e) => setRule({ ...rule, branchId: e.target.value })}
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  />
                  <Input aria-label={t('payTreasury.exp.amount')} placeholder={t('payTreasury.exp.amountLak')} type="number" min={0} value={rule.amount} onChange={(e) => setRule({ ...rule, amount: e.target.value })} className="h-9 tabular-nums" />
                  <label className="flex items-center gap-2 text-2xs text-muted-foreground">
                    <span className="shrink-0">{t('payTreasury.exp.dayLabel')}</span>
                    <Input type="number" min={1} max={28} value={rule.dayOfMonth} onChange={(e) => setRule({ ...rule, dayOfMonth: e.target.value })} className="h-9 tabular-nums" />
                  </label>
                  {isSuper && branches.length > 1 ? (
                    <RecurringSplitEditor rows={ruleSplit} onChange={setRuleSplit} branches={branches} payingBranchId={branchId} />
                  ) : null}
                  <Button
                    className="sm:col-span-2"
                    disabled={!ruleValid || saveRule.isPending}
                    onClick={() =>
                      saveRule.mutate(
                        {
                          create: {
                            branchId,
                            categoryId: rule.categoryId,
                            title: rule.title.trim(),
                            amount,
                            currency: 'LAK',
                            dayOfMonth: Math.min(28, Math.max(1, Number(rule.dayOfMonth) || 1)),
                            ...(ruleSplit.length ? { allocations: ruleSplit.map((x) => ({ branchId: x.branchId, percent: Number(x.percent) })) } : {}),
                          },
                        },
                        {
                          onSuccess: () => {
                            toast.success(t('common.saved'));
                            setRule({ title: '', amount: '', dayOfMonth: '1', categoryId: '', branchId: '' });
                            setRuleSplit([]);
                          },
                          onError,
                        },
                      )
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.exp.addRule')}
                  </Button>
                </fieldset>
              ) : null}
            </TabsContent>

            <TabsContent value="categories" className="space-y-3">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {categories.map((c) => (
                  <li key={c.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${c.isActive ? '' : 'opacity-60'}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <CategoryGlyph code={c.code} color={categoryColor(c.id, categories)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{categoryName(c, lang)}</p>
                        <p className="truncate font-mono text-2xs text-muted-foreground">{c.code}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={c.kind === 'OPERATING' ? 'neutral' : 'info'} title={t(`payTreasury.exp.kindHint.${c.kind}`)}>
                        {t(`payTreasury.exp.kind.${c.kind}`)}
                      </Badge>
                      <Switch
                        checked={c.isActive}
                        disabled={!isSuper}
                        aria-label={t('payTreasury.exp.toggleCategory', { name: categoryName(c, lang) })}
                        onCheckedChange={(isActive) => saveCat.mutate({ id: c.id, update: { isActive } }, { onError })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {isSuper ? (
                <fieldset className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-medium">{t('payTreasury.exp.addCategory')}</legend>
                  <Input aria-label="CODE" placeholder="CODE" value={cat.code} onChange={(e) => setCat({ ...cat, code: e.target.value.toUpperCase() })} className="h-9 font-mono" />
                  <Select
                    aria-label={t('payTreasury.exp.kindLabel')}
                    value={cat.kind}
                    onChange={(e) => setCat({ ...cat, kind: e.target.value as ExpenseCategoryKind })}
                    options={EXPENSE_CATEGORY_KINDS.map((k) => ({ value: k, label: t(`payTreasury.exp.kind.${k}`) }))}
                  />
                  <Input aria-label={t('payTreasury.exp.nameLo')} placeholder={t('payTreasury.exp.nameLo')} value={cat.nameLo} onChange={(e) => setCat({ ...cat, nameLo: e.target.value })} className="h-9" />
                  <Input aria-label={t('payTreasury.exp.nameEn')} placeholder={t('payTreasury.exp.nameEn')} value={cat.nameEn} onChange={(e) => setCat({ ...cat, nameEn: e.target.value })} className="h-9" />
                  <p className="text-2xs text-muted-foreground sm:col-span-2">{t(`payTreasury.exp.kindHint.${cat.kind}`)}</p>
                  <Button
                    className="sm:col-span-2"
                    disabled={!catValid || saveCat.isPending}
                    onClick={() =>
                      saveCat.mutate(
                        { create: { code: cat.code, nameLo: cat.nameLo.trim(), nameEn: cat.nameEn.trim(), kind: cat.kind, sortOrder: 50 } },
                        {
                          onSuccess: () => {
                            toast.success(t('common.saved'));
                            setCat({ code: '', nameLo: '', nameEn: '', kind: 'OPERATING' });
                          },
                          onError,
                        },
                      )
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.exp.addCategory')}
                  </Button>
                </fieldset>
              ) : (
                <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.superOnly')}</p>
              )}
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function RuleEditor({
  rule,
  branches,
  isSuper,
  busy,
  onCancel,
  onSave,
}: {
  rule: RecurringExpenseView;
  branches: { id: string; name: string }[];
  isSuper: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (u: { title: string; amount: number; dayOfMonth: number; allocations?: { branchId: string; percent: number }[] }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(rule.title);
  const [amount, setAmount] = useState(String(rule.amount));
  const [day, setDay] = useState(String(rule.dayOfMonth));
  const [split, setSplit] = useState<SplitRow[]>((rule.allocations ?? []).map((a) => ({ branchId: a.branchId, percent: String(a.percent) })));
  const n = Number(amount);
  const d = Number(day);
  const ok = title.trim() && Number.isFinite(n) && n > 0 && d >= 1 && d <= 28 && splitValid(split);
  const allocations = isSuper ? { allocations: split.map((x) => ({ branchId: x.branchId, percent: Number(x.percent) })) } : {};
  return (
    <li className="grid gap-2 bg-muted/30 px-3 py-2.5 sm:grid-cols-[1fr_120px_70px_auto]">
      <Input aria-label={t('payTreasury.exp.title')} value={title} onChange={(e) => setTitle(e.target.value)} className="h-8" />
      <Input aria-label={t('payTreasury.exp.amount')} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 tabular-nums" />
      <Input aria-label={t('payTreasury.exp.dayLabel')} type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} className="h-8 tabular-nums" />
      <div className="flex gap-1">
        <Button size="icon" className="h-8 w-8" disabled={!ok || busy} aria-label={t('common.save')} onClick={() => onSave({ title: title.trim(), amount: n, dayOfMonth: d, ...allocations })}>
          <Check className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('common.cancel')} onClick={onCancel}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {isSuper && branches.length > 1 ? (
        <div className="sm:col-span-4">
          <RecurringSplitEditor rows={split} onChange={setSplit} branches={branches} payingBranchId={rule.branchId} />
        </div>
      ) : null}
    </li>
  );
}

/** E2 — monthly budget per category for one branch, with this month's and last month's actuals beside each input. */
function BudgetEditor({
  branches,
  defaultBranchId,
  canEdit,
  lang,
}: {
  branches: { id: string; name: string }[];
  defaultBranchId?: string;
  canEdit: boolean;
  lang: 'lo' | 'en';
}) {
  const { t, i18n } = useTranslation();
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || '');
  const [month, setMonth] = useState(currentMonthYear());
  const { data: categories = [] } = useExpenseCategories();
  const { data } = useExpenseBudgets(branchId || undefined, month);
  const save = useSaveExpenseBudgets();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(defaultBranchId || branches[0].id);
  }, [branches, branchId, defaultBranchId]);
  useEffect(() => {
    setDraft(Object.fromEntries((data?.items ?? []).map((i) => [i.categoryId, String(i.amount)])));
  }, [data]);

  const actual = useMemo(() => new Map((data?.actual ?? []).map((a) => [a.categoryId, a.amount])), [data]);
  const prev = useMemo(() => new Map((data?.previousActual ?? []).map((a) => [a.categoryId, a.amount])), [data]);
  const total = Object.values(draft).reduce((a, v) => a + (Number(v) || 0), 0);
  const actualTotal = [...actual.values()].reduce((a, b) => a + b, 0);
  const dirty = categories.some((c) => (Number(draft[c.id]) || 0) !== (data?.items.find((i) => i.categoryId === c.id)?.amount ?? 0));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {branches.length > 1 ? (
          <Select className="h-9 w-[170px]" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} aria-label={t('payTreasury.col.branch')} />
        ) : null}
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('payroll.prevMonth')}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[128px] text-center text-xs font-semibold tabular-nums">{monthLabel(month, i18n.language)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('payroll.nextMonth')}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 text-2xs"
            title={t('payTreasury.exp.budgetFromLastHint')}
            onClick={() =>
              setDraft((d) => {
                const next = { ...d };
                for (const [id, amt] of prev) if (!next[id]) next[id] = String(Math.ceil(amt / 10_000) * 10_000);
                return next;
              })
            }
          >
            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('payTreasury.exp.budgetFromLast')}
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_88px_88px_120px] gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-2xs font-medium text-muted-foreground">
          <span>{t('payTreasury.exp.category')}</span>
          <span className="text-right">{t('payTreasury.exp.lastMonth')}</span>
          <span className="text-right">{t('payTreasury.exp.thisMonthActual')}</span>
          <span className="text-right">{t('payTreasury.exp.budgetLak')}</span>
        </div>
        <ul className="divide-y divide-border">
          {categories.map((c) => {
            const b = Number(draft[c.id]) || 0;
            const a = actual.get(c.id) ?? 0;
            const tone = b > 0 ? TONE[budgetTone(a, b)] : null;
            return (
              <li key={c.id} className="grid grid-cols-[1fr_88px_88px_120px] items-center gap-2 px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryGlyph code={c.code} color={categoryColor(c.id, categories)} size="sm" />
                  <span className="truncate text-sm">{categoryName(c, lang)}</span>
                </span>
                <span className="text-right text-2xs tabular-nums text-muted-foreground">
                  <CurrencyText amount={prev.get(c.id) ?? 0} />
                </span>
                <span className={cn('text-right text-2xs font-medium tabular-nums', tone?.text)}>
                  <CurrencyText amount={a} />
                </span>
                <Input
                  type="number"
                  min={0}
                  step={10_000}
                  disabled={!canEdit}
                  aria-label={t('payTreasury.exp.budgetFor', { name: categoryName(c, lang) })}
                  value={draft[c.id] ?? ''}
                  placeholder="—"
                  onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
                  className="h-8 text-right text-xs tabular-nums"
                />
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-[1fr_88px_88px_120px] gap-2 border-t border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
          <span>{t('payTreasury.exp.ins.total')}</span>
          <span />
          <span className="text-right tabular-nums"><CurrencyText amount={actualTotal} /></span>
          <span className="text-right tabular-nums"><CurrencyText amount={total} /></span>
        </div>
      </div>

      {canEdit ? (
        <Button
          className="w-full"
          disabled={!dirty || save.isPending || !branchId}
          onClick={() =>
            save.mutate(
              { branchId, month, items: categories.map((c) => ({ categoryId: c.id, amount: Number(draft[c.id]) || 0 })) },
              {
                onSuccess: () => toast.success(t('common.saved')),
                onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
              },
            )
          }
        >
          {t('payTreasury.exp.saveBudgets', { month: monthLabel(month, i18n.language) })}
        </Button>
      ) : (
        <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.budgetReadOnly')}</p>
      )}
    </div>
  );
}

/** E1 + E3 — booking exchange rates and the branch-admin approval limit. Owner-only to edit. */
function RulesEditor({ isSuper }: { isSuper: boolean }) {
  const { t } = useTranslation();
  const { data } = useExpenseSettings();
  const save = useUpdateExpenseSettings();
  const [limit, setLimit] = useState('');
  const [rates, setRates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setLimit(data.approvalLimit != null ? String(data.approvalLimit) : '');
    setRates(Object.fromEntries(data.rates.map((r) => [r.currency, r.rate ? String(r.rate) : ''])));
  }, [data]);

  const limitN = Number(limit);
  const validLimit = limit === '' || limitN > 0;
  const validRates = Object.values(rates).every((v) => v === '' || Number(v) > 0);

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold">{t('payTreasury.exp.approvalLimit')}</legend>
        <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.approvalLimitHint')}</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={100_000}
            disabled={!isSuper}
            placeholder={t('payTreasury.exp.noLimit')}
            value={limit}
            aria-label={t('payTreasury.exp.approvalLimit')}
            onChange={(e) => setLimit(e.target.value)}
            className="h-9 tabular-nums"
          />
          <span className="text-xs text-muted-foreground">LAK</span>
        </div>
        {limit === '' ? <p className="text-2xs text-warning">{t('payTreasury.exp.noLimitWarn')}</p> : null}
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold">{t('payTreasury.exp.bookingRates')}</legend>
        <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.bookingRatesHint')}</p>
        {(data?.rates ?? []).map((r) => (
          <div key={r.currency} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-sm font-medium">1 {r.currency}</span>
            <span className="text-muted-foreground">=</span>
            <Input
              type="number"
              min={0}
              disabled={!isSuper}
              value={rates[r.currency] ?? ''}
              aria-label={t('payTreasury.exp.fxRateLabel', { currency: r.currency })}
              onChange={(e) => setRates({ ...rates, [r.currency]: e.target.value })}
              className={cn('h-9 tabular-nums', !r.rate && 'border-warning')}
            />
            <span className="text-xs text-muted-foreground">LAK</span>
            <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">
              {r.updatedAt ? formatDateTime(r.updatedAt) : t('payTreasury.exp.notSet')}
            </span>
          </div>
        ))}
      </fieldset>

      {isSuper ? (
        <Button
          className="w-full"
          disabled={!validLimit || !validRates || save.isPending}
          onClick={() =>
            save.mutate(
              {
                approvalLimit: limit === '' ? null : limitN,
                rates: Object.entries(rates)
                  .filter(([, v]) => Number(v) > 0)
                  .map(([currency, v]) => ({ currency: currency as 'THB' | 'USD', rate: Number(v) })),
              },
              {
                onSuccess: () => toast.success(t('common.saved')),
                onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
              },
            )
          }
        >
          {t('common.save')}
        </Button>
      ) : (
        <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.superOnly')}</p>
      )}
    </div>
  );
}
