import type { ExpenseView, ReceiptScanView } from '@abcp/shared-types';
import { FileText, ImagePlus, Plus, ScanText, Send, Split, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DateField } from '@/components/shared/DateField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePurchaseOrders, useSuppliers } from '@/features/inventory/inventory.api';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { CategoryGlyph } from './expense.parts';
import {
  useCreateExpense,
  useExpenseAction,
  useExpenseCategories,
  useExpenseSettings,
  useReceiptScan,
  useUpdateExpense,
  useUploadExpenseAttachment,
} from './expenses.api';
import { categoryColor, categoryName } from './expenses.lib';
import { FileTooLargeError, fileToBase64, todayKey } from './treasury.lib';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit this expense (only while DRAFT / REJECTED — the API enforces it too). */
  expense: ExpenseView | null;
  /** Prefill a new expense from an existing one ("duplicate") — saved as a fresh draft. */
  template?: ExpenseView | null;
  branches: { id: string; name: string }[];
  defaultBranchId?: string;
  onSaved?: (e: ExpenseView) => void;
  /** E10 — only the owner can split a cost across branches. */
  canAllocate?: boolean;
}

type Staged = { key: string; name: string; contentType: 'image/jpeg' | 'application/pdf'; dataBase64: string; preview?: string };

const CURRENCIES = ['LAK', 'THB', 'USD'] as const;
const QUICK_AMOUNTS = [50_000, 100_000, 500_000, 1_000_000];

/**
 * Create / edit an expense. Amount first (it is what people come to type), category as a picker of
 * glyph chips (faster than a dropdown for nine options, and it teaches the icons used everywhere
 * else), then the supporting detail. Receipts can be attached before the first save — they upload
 * right after it — and "Save & submit" does the whole flow in one step.
 */
export function ExpenseDialog({ open, onClose, expense, template, branches, defaultBranchId, onSaved, canAllocate = false }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const { data: categories = [] } = useExpenseCategories();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const act = useExpenseAction();
  const upload = useUploadExpenseAttachment();
  const fileRef = useRef<HTMLInputElement>(null);
  const idemKey = useRef('');

  const [branchId, setBranchId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('LAK');
  const [expenseDate, setExpenseDate] = useState(todayKey());
  const [notes, setNotes] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [fxRate, setFxRate] = useState('');
  const { data: settings } = useExpenseSettings();
  const scan = useReceiptScan();
  const [suggestion, setSuggestion] = useState<ReceiptScanView | null>(null);
  const [split, setSplit] = useState<{ branchId: string; percent: string }[]>([]);
  const bookingRate = settings?.rates.find((r) => r.currency === currency)?.rate ?? 0;
  const [staged, setStaged] = useState<Staged[]>([]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100, sort: 'name' });
  const { data: pos } = usePurchaseOrders({ branchId: branchId || undefined, supplierId: supplierId || undefined, page: 1, pageSize: 50 });

  useEffect(() => {
    if (!open) return;
    const src = expense ?? template ?? null;
    idemKey.current = crypto.randomUUID();
    setBranchId(expense?.branchId ?? template?.branchId ?? defaultBranchId ?? branches[0]?.id ?? '');
    setCategoryId(src?.category.id ?? '');
    setTitle(src?.title ?? '');
    setAmount(src ? String(src.amount) : '');
    setCurrency(src?.currency ?? 'LAK');
    setExpenseDate(expense?.expenseDate ?? todayKey());
    setNotes(src?.notes ?? '');
    setSupplierId(src?.supplier?.id ?? '');
    setPurchaseOrderId(expense?.purchaseOrder?.id ?? '');
    setInvoiceNumber(expense?.invoiceNumber ?? '');
    setTaxAmount(expense?.taxAmount != null ? String(expense.taxAmount) : '');
    setDueDate(expense?.dueDate ?? '');
    setFxRate(src && src.currency !== 'LAK' ? String(src.fxRate) : '');
    setStaged([]);
    setTouched(false);
    setSuggestion(null);
    setSplit((src?.allocations ?? []).map((a) => ({ branchId: a.branchId, percent: String(a.percent) })));
  }, [open, expense, template, defaultBranchId, branches]);

  const amt = Number(amount);
  const errors = {
    amount: !(Number.isFinite(amt) && amt > 0) ? t('payTreasury.exp.err.amount') : null,
    category: !categoryId ? t('payTreasury.exp.err.category') : null,
    title: !title.trim() ? t('payTreasury.exp.err.title') : null,
    branch: !branchId ? t('payTreasury.exp.err.branch') : null,
    tax: taxAmount && (!(Number(taxAmount) >= 0) || Number(taxAmount) > amt) ? t('payTreasury.exp.err.tax') : null,
    fx: currency !== 'LAK' && !(Number(fxRate || bookingRate) > 0) ? t('payTreasury.exp.err.fx') : null,
    split:
      split.length > 0 && Math.abs(split.reduce((a, r) => a + (Number(r.percent) || 0), 0) - 100) > 0.01
        ? t('payTreasury.exp.err.split')
        : split.some((r) => !r.branchId) || new Set(split.map((r) => r.branchId)).size !== split.length
          ? t('payTreasury.exp.err.splitBranch')
          : null,
  };
  const allocations = split.length ? split.map((r) => ({ branchId: r.branchId, percent: Number(r.percent) })) : [];
  const rate = currency === 'LAK' ? 1 : Number(fxRate || bookingRate) || 0;
  const valid = !Object.values(errors).some(Boolean) && Boolean(expenseDate);
  const busy = saving || create.isPending || update.isPending;
  const category = categories.find((c) => c.id === categoryId);
  const poOptions = useMemo(() => (pos?.items ?? []).filter((p) => !supplierId || p.supplierId === supplierId), [pos, supplierId]);

  async function stage(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const { contentType, dataBase64 } = await fileToBase64(file);
        // E7 — read the first photo (or a digital PDF's text layer, Wave 11) so the form can be pre-filled
        // (suggestion only; the user applies it).
        if (!scan.isPending && !suggestion) {
          scan.mutate(
            { contentType, dataBase64 },
            {
              onSuccess: setSuggestion,
              onError: (e) =>
                toast.error(
                  contentType === 'application/pdf' && e instanceof NormalizedApiError ? e.message : t('payTreasury.exp.scanFailed'),
                ),
            },
          );
        }
        setStaged((s) => [
          ...s,
          {
            key: crypto.randomUUID(),
            name: file.name,
            contentType,
            dataBase64,
            preview: contentType === 'image/jpeg' ? `data:image/jpeg;base64,${dataBase64}` : undefined,
          },
        ]);
      } catch (err) {
        toast.error(err instanceof FileTooLargeError ? t('payTreasury.fileTooLarge') : t('payTreasury.fileUnreadable'));
      }
    }
  }

  async function save(andSubmit: boolean) {
    setTouched(true);
    if (!valid || busy) return;
    setSaving(true);
    try {
      const saved = expense
        ? await update.mutateAsync({
            id: expense.id,
            input: {
              categoryId,
              title: title.trim(),
              amount: amt,
              currency,
              expenseDate,
              notes: notes.trim() || null,
              supplierId: supplierId || null,
              purchaseOrderId: purchaseOrderId || null,
              invoiceNumber: invoiceNumber.trim() || null,
              taxAmount: taxAmount ? Number(taxAmount) : null,
              dueDate: dueDate || null,
              ...(currency !== 'LAK' && fxRate ? { fxRate: Number(fxRate) } : {}),
              ...(canAllocate ? { allocations } : {}),
            },
          })
        : await create.mutateAsync({
            idempotencyKey: idemKey.current,
            input: {
              branchId,
              categoryId,
              title: title.trim(),
              amount: amt,
              currency,
              expenseDate,
              notes: notes.trim() || undefined,
              ...(supplierId ? { supplierId } : {}),
              ...(purchaseOrderId ? { purchaseOrderId } : {}),
              ...(invoiceNumber.trim() ? { invoiceNumber: invoiceNumber.trim() } : {}),
              ...(taxAmount ? { taxAmount: Number(taxAmount) } : {}),
              ...(dueDate ? { dueDate } : {}),
              ...(currency !== 'LAK' && fxRate ? { fxRate: Number(fxRate) } : {}),
              ...(canAllocate && allocations.length ? { allocations } : {}),
            },
          });

      let failedUploads = 0;
      for (const f of staged) {
        try {
          await upload.mutateAsync({ id: saved.id, input: { contentType: f.contentType, dataBase64: f.dataBase64 } });
        } catch {
          failedUploads += 1;
        }
      }
      if (failedUploads > 0) toast.error(t('payTreasury.exp.uploadFailed', { count: failedUploads }));

      if (andSubmit) {
        await act.mutateAsync({ id: saved.id, action: 'submit' });
        toast.success(t('payTreasury.exp.toast.submitted', { count: 1 }));
      } else {
        toast.success(t('payTreasury.exp.toast.draftSaved'));
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function applySuggestion(sg: ReceiptScanView) {
    if (sg.total != null) setAmount(String(sg.total));
    if (sg.currency && (CURRENCIES as readonly string[]).includes(sg.currency)) setCurrency(sg.currency);
    if (sg.date) setExpenseDate(sg.date);
    if (sg.invoiceNumber && !invoiceNumber) setInvoiceNumber(sg.invoiceNumber);
    if (sg.taxAmount != null && !taxAmount) setTaxAmount(String(sg.taxAmount));
    if (sg.vendor && !title.trim()) setTitle(sg.vendor.slice(0, 160));
    toast.success(t('payTreasury.exp.scanApplied'));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  const heading = expense ? t('payTreasury.exp.edit') : template ? t('payTreasury.exp.duplicateTitle') : t('payTreasury.exp.new');
  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>{t('payTreasury.exp.formHint')}</DialogDescription>
          </DialogHeader>

          {/* ── amount first ── */}
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <Label htmlFor="ex-amount" className="text-xs text-muted-foreground">
              {t('payTreasury.exp.amount')}
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="ex-amount"
                type="number"
                inputMode="decimal"
                min={0}
                autoFocus
                placeholder="0"
                className="h-12 border-0 bg-transparent px-0 text-3xl font-bold tabular-nums shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={amount}
                aria-invalid={Boolean(err('amount'))}
                aria-describedby={err('amount') ? 'ex-amount-err' : undefined}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div role="radiogroup" aria-label={t('payTreasury.col.currency')} className="flex shrink-0 rounded-lg border border-border bg-card p-0.5">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={currency === c}
                    onClick={() => setCurrency(c)}
                    className={cn(
                      'h-8 rounded-md px-2.5 text-xs font-semibold transition-colors',
                      currency === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {amt > 0 ? <p className="text-2xs text-muted-foreground">{formatCurrency(amt, currency as 'LAK')}</p> : null}
            {err('amount') ? (
              <p id="ex-amount-err" className="text-2xs text-destructive">
                {err('amount')}
              </p>
            ) : null}
            {currency === 'LAK' ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String((Number(amount) || 0) + q))}
                    className="rounded-full border border-border bg-card px-2.5 py-0.5 text-2xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    +{q.toLocaleString()}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs">
                <label htmlFor="ex-fx" className="text-muted-foreground">
                  {t('payTreasury.exp.fxRateLabel', { currency })}
                </label>
                <Input
                  id="ex-fx"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder={bookingRate ? String(bookingRate) : '—'}
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  className="h-7 w-28 text-xs tabular-nums"
                />
                {amt > 0 && rate > 0 ? (
                  <span className="font-medium text-foreground">≈ {formatCurrency(amt * rate)}</span>
                ) : null}
                {err('fx') ? <span className="text-destructive">{err('fx')}</span> : null}
              </div>
            )}
          </div>

          {/* ── category ── */}
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t('payTreasury.exp.category')}</legend>
            <div role="radiogroup" aria-invalid={Boolean(err('category'))} className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {categories.map((c) => {
                const active = c.id === categoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      'flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors duration-150',
                      active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/60',
                    )}
                  >
                    <CategoryGlyph code={c.code} color={categoryColor(c.id, categories)} size="sm" />
                    <span className="line-clamp-2 text-2xs leading-tight">{categoryName(c, lang)}</span>
                  </button>
                );
              })}
            </div>
            {category && category.kind !== 'OPERATING' ? (
              <p className="text-2xs text-muted-foreground">{t(`payTreasury.exp.kindHint.${category.kind}`)}</p>
            ) : null}
            {err('category') ? <p className="text-2xs text-destructive">{err('category')}</p> : null}
          </fieldset>

          {/* ── what & when ── */}
          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <div className="grid gap-1.5">
              <Label htmlFor="ex-title">{t('payTreasury.exp.title')}</Label>
              <Input
                id="ex-title"
                value={title}
                maxLength={160}
                placeholder={t('payTreasury.exp.titlePh')}
                aria-invalid={Boolean(err('title'))}
                onChange={(e) => setTitle(e.target.value)}
              />
              {err('title') ? <p className="text-2xs text-destructive">{err('title')}</p> : null}
            </div>
            <div className="grid content-start gap-1.5">
              <Label>{t('payTreasury.exp.date')}</Label>
              <DateField value={expenseDate} onChange={setExpenseDate} max={todayKey()} aria-label={t('payTreasury.exp.date')} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ex-branch">{t('payTreasury.col.branch')}</Label>
              <Select
                id="ex-branch"
                value={branchId}
                disabled={Boolean(expense) || branches.length <= 1}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setPurchaseOrderId('');
                }}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ex-supplier">
                {t('payTreasury.exp.supplier')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
              </Label>
              <Select
                id="ex-supplier"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setPurchaseOrderId('');
                }}
                options={[{ value: '', label: t('payTreasury.exp.noSupplier') }, ...(suppliers?.items ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ex-po">
                {t('payTreasury.exp.po')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
              </Label>
              <Select
                id="ex-po"
                value={purchaseOrderId}
                disabled={poOptions.length === 0}
                onChange={(e) => {
                  const po = poOptions.find((p) => p.id === e.target.value);
                  setPurchaseOrderId(e.target.value);
                  if (po) {
                    if (!supplierId) setSupplierId(po.supplierId);
                    if (!amount) setAmount(String(po.totalAmount));
                  }
                }}
                options={[
                  { value: '', label: poOptions.length ? t('payTreasury.exp.noPo') : t('payTreasury.exp.noPoAvailable') },
                  ...poOptions.map((p) => ({ value: p.id, label: `${p.poNumber} · ${formatCurrency(p.totalAmount)}` })),
                ]}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ex-inv">
                {t('payTreasury.exp.invoiceNumber')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
              </Label>
              <Input id="ex-inv" maxLength={80} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ex-tax">
                {t('payTreasury.exp.taxAmount')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
              </Label>
              <div className="flex gap-1">
                <Input
                  id="ex-tax"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={taxAmount}
                  aria-invalid={Boolean(err('tax'))}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  className="tabular-nums"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 px-2 text-2xs"
                  disabled={!(amt > 0)}
                  title={t('payTreasury.exp.vat10Hint')}
                  onClick={() => setTaxAmount(String(Math.round((amt / 11) * 100) / 100))}
                >
                  VAT 10%
                </Button>
              </div>
              {err('tax') ? <p className="text-2xs text-destructive">{err('tax')}</p> : null}
            </div>
            <div className="grid content-start gap-1.5">
              <Label>
                {t('payTreasury.exp.dueDate')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
              </Label>
              <DateField value={dueDate} onChange={(v) => setDueDate(v ?? '')} min={expenseDate} aria-label={t('payTreasury.exp.dueDate')} onClear={() => setDueDate('')} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ex-notes">
              {t('payTreasury.exp.notes')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
            </Label>
            <Textarea id="ex-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {canAllocate && branches.length > 1 ? (
            <fieldset className="grid gap-2 rounded-lg border border-border p-3">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <Split className="h-3.5 w-3.5" aria-hidden="true" />
                {t('payTreasury.exp.allocations')} <span className="font-normal text-muted-foreground">({t('payTreasury.exp.optional')})</span>
              </legend>
              <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.allocHint')}</p>
              {split.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_auto_auto] items-center gap-2">
                  <Select
                    aria-label={t('payTreasury.col.branch')}
                    value={r.branchId}
                    placeholder={t('payTreasury.exp.pickBranch')}
                    onChange={(e) => setSplit(split.map((x, j) => (j === i ? { ...x, branchId: e.target.value } : x)))}
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={t('payTreasury.exp.percent')}
                    value={r.percent}
                    onChange={(e) => setSplit(split.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))}
                    className="tabular-nums"
                  />
                  <span className="w-24 text-right text-2xs tabular-nums text-muted-foreground">
                    {amt > 0 ? formatCurrency((amt * rate * (Number(r.percent) || 0)) / 100) : '—'}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('common.delete')} onClick={() => setSplit(split.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setSplit(
                      split.length
                        ? [...split, { branchId: '', percent: '' }]
                        : [
                            { branchId, percent: '50' },
                            { branchId: branches.find((b) => b.id !== branchId)?.id ?? '', percent: '50' },
                          ],
                    )
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {split.length ? t('payTreasury.exp.addBranch') : t('payTreasury.exp.splitCost')}
                </Button>
                {split.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const each = Math.floor((100 / split.length) * 100) / 100;
                      setSplit(split.map((x, j) => ({ ...x, percent: String(j === split.length - 1 ? Math.round((100 - each * (split.length - 1)) * 100) / 100 : each) })));
                    }}
                  >
                    {t('payTreasury.exp.splitEqually')}
                  </Button>
                ) : null}
                {split.length ? (
                  <span className={cn('ml-auto text-2xs tabular-nums', err('split') ? 'text-destructive' : 'text-muted-foreground')}>
                    Σ {split.reduce((a, r) => a + (Number(r.percent) || 0), 0)}%
                  </span>
                ) : null}
              </div>
              {err('split') ? <p className="text-2xs text-destructive">{err('split')}</p> : null}
            </fieldset>
          ) : null}

          {scan.isPending || suggestion ? (
            <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3" aria-live="polite">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <ScanText className={cn('h-3.5 w-3.5', scan.isPending && 'animate-pulse')} aria-hidden="true" />
                {scan.isPending ? t('payTreasury.exp.scanning') : t('payTreasury.exp.scanResult', { pct: suggestion?.confidence ?? 0 })}
              </p>
              {suggestion ? (
                <>
                  {suggestion.duplicateOf ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive-soft px-2 py-1.5 text-2xs text-destructive">
                      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t('payTreasury.exp.scanDuplicate', { title: suggestion.duplicateOf.title })}
                    </p>
                  ) : null}
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs sm:grid-cols-3">
                    {(
                      [
                        ['amount', suggestion.total != null ? formatCurrency(suggestion.total, (suggestion.currency ?? currency) as 'LAK') : null],
                        ['date', suggestion.date],
                        ['invoiceNumber', suggestion.invoiceNumber],
                        ['taxAmount', suggestion.taxAmount != null ? formatCurrency(suggestion.taxAmount, (suggestion.currency ?? currency) as 'LAK') : null],
                        ['supplier', suggestion.vendor],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-muted-foreground">{t(`payTreasury.exp.${k}`)}</dt>
                        <dd className={cn('truncate font-medium', !v && 'text-muted-foreground')}>{v ?? t('payTreasury.exp.notRead')}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" onClick={() => applySuggestion(suggestion)}>
                      {t('payTreasury.exp.scanApply')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                      {t('payTreasury.exp.scanDismiss')}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {/* ── receipts ── */}
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">
              {t('payTreasury.exp.attachments')}{' '}
              {expense && expense.attachments.length > 0 ? (
                <span className="font-normal text-muted-foreground">({t('payTreasury.exp.alreadyAttached', { count: expense.attachments.length })})</span>
              ) : null}
            </span>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="sr-only"
              aria-label={t('payTreasury.exp.attach')}
              onChange={(e) => {
                void stage(e.target.files);
                e.target.value = '';
              }}
            />
            <div
              className="flex flex-wrap gap-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void stage(e.dataTransfer.files);
              }}
            >
              {staged.map((f) => (
                <div key={f.key} className="group relative h-20 w-16 overflow-hidden rounded-md border border-border bg-muted">
                  {f.preview ? (
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="m-auto mt-6 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    aria-label={t('payTreasury.exp.removeAttachment')}
                    onClick={() => setStaged((s) => s.filter((x) => x.key !== f.key))}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-destructive shadow"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-20 min-w-[64px] flex-1 items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-3 text-2xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.dropReceipt')}
              </button>
            </div>
            <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.receiptHint')}</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t('payTreasury.exp.saveDraft')}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save(true)}>
              <Send className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.exp.saveSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
