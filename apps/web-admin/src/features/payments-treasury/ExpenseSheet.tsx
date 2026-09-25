import type { ExpenseCategoryView, ExpenseView } from '@abcp/shared-types';
import {
  Ban,
  CalendarClock,
  Check,
  CircleSlash,
  Coins,
  History,
  Landmark,
  Split,
  Copy,
  FileText,
  ImagePlus,
  Pencil,
  Repeat,
  Send,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { CategoryGlyph, ExpenseStatusPill, PoMatchChip, WaitingChip, WorkflowStepper } from './expense.parts';
import {
  useDeleteExpense,
  useDeleteExpenseAttachment,
  useExpense,
  useExpenseAction,
  useExpenseHistory,
  useUploadExpenseAttachment,
} from './expenses.api';
import { categoryColor, categoryName, daysUntil, isForeign, weekdayShort } from './expenses.lib';
import { PayExpenseDialog } from './PayExpenseDialog';
import { FileTooLargeError, fileToBase64, todayKey } from './treasury.lib';

interface Props {
  expenseId: string | null;
  categories: ExpenseCategoryView[];
  onClose: () => void;
  onEdit: (e: ExpenseView) => void;
  onDuplicate: (e: ExpenseView) => void;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

/**
 * Expense drawer — everything about one claim without leaving the list.
 *
 * Top: what it is and how much. Then where it is in the workflow (stepper with who/when), anything
 * that needs attention (rejection reason, missing receipt, own-claim rule), the facts, the receipts,
 * and a footer that only ever shows the transitions this user may make right now.
 */
export function ExpenseSheet({ expenseId, categories, onClose, onEdit, onDuplicate }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const confirm = useConfirm();
  const { user, hasPermission } = useAuth();
  const { data: e, isLoading } = useExpense(expenseId);
  const act = useExpenseAction();
  const del = useDeleteExpense();
  const upload = useUploadExpenseAttachment();
  const delAtt = useDeleteExpenseAttachment();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rejecting, setRejecting] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [reason, setReason] = useState('');
  const [paying, setPaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const { data: history = [] } = useExpenseHistory(expenseId);

  const canManage = hasPermission('expenses:manage');
  const canApprove = hasPermission('expenses:approve');
  const editable = e && (e.status === 'DRAFT' || e.status === 'REJECTED');
  const canAttach = Boolean(e && canManage && e.status !== 'PAID');
  // Same rule the API enforces: you can't approve your own claim (owner excepted).
  const ownClaim = e?.createdBy.id === user?.id && user?.role !== 'SUPER_ADMIN';
  const needsReceipt = e && e.attachments.length === 0 && !editable && e.status !== 'VOIDED';
  // E3 — ເກີນເພດານ: ສະເພາະເຈົ້າຂອງອະນຸມັດໄດ້ (API ກວດຊ້ຳ).
  const blockedByLimit = Boolean(e?.needsOwnerApproval) && user?.role !== 'SUPER_ADMIN';
  // Inventory 9D — 3-way match ບໍ່ຜ່ານ: API ບລັອກ (409); SUPER_ADMIN ຂ້າມໄດ້ພ້ອມເຫດຜົນ (audit).
  const matchFailed = e?.poMatch?.status === 'OVER_INVOICED' || e?.poMatch?.status === 'UNDER_RECEIVED';
  const blockedByMatch = matchFailed && user?.role !== 'SUPER_ADMIN';
  const due = e ? daysUntil(e.dueDate, todayKey()) : null;
  const canVoid = Boolean(e && canApprove && (e.status === 'APPROVED' || e.status === 'PAID'));

  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  function run(a: Parameters<typeof act.mutate>[0], done?: () => void, okMsg = t('common.saved')) {
    act.mutate(a, {
      onSuccess: () => {
        toast.success(okMsg);
        done?.();
      },
      onError,
    });
  }

  async function onFiles(files: FileList | File[] | null | undefined) {
    if (!files || !e) return;
    for (const file of Array.from(files)) {
      try {
        const { contentType, dataBase64 } = await fileToBase64(file);
        await upload.mutateAsync({ id: e.id, input: { contentType, dataBase64 } });
      } catch (err) {
        if (err instanceof FileTooLargeError) toast.error(t('payTreasury.fileTooLarge'));
        else if (err instanceof NormalizedApiError) toast.error(err.message);
        else toast.error(t('payTreasury.fileUnreadable'));
      }
    }
  }

  function onDrop(ev: DragEvent) {
    ev.preventDefault();
    setDragging(false);
    if (canAttach) void onFiles(ev.dataTransfer.files);
  }

  const color = e ? categoryColor(e.category.id, categories) : undefined;

  return (
    <Sheet open={Boolean(expenseId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[580px]">
        <SheetHeader>
          {!e ? (
            <>
              <SheetTitle className="sr-only">{t('payTreasury.exp.detail')}</SheetTitle>
              <Skeleton className="h-16 w-full" />
            </>
          ) : (
            <div className="flex items-start gap-3 pr-8">
              <CategoryGlyph code={e.category.code} color={color} size="lg" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{e.title}</SheetTitle>
                <SheetDescription className="truncate">
                  {categoryName(e.category, lang)} · {e.branchName}
                </SheetDescription>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ExpenseStatusPill status={e.status} />
                  <WaitingChip expense={e} />
                  {e.recurringExpenseId ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-2xs text-info">
                      <Repeat className="h-3 w-3" aria-hidden="true" />
                      {t('payTreasury.exp.recurringBadge')}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <CurrencyText
                  amount={e.amount}
                  currency={e.currency as 'LAK'}
                  className={cn('text-2xl font-bold leading-tight', e.status === 'VOIDED' && 'text-muted-foreground line-through')}
                />
                {isForeign(e.currency) ? (
                  <p className="text-2xs text-muted-foreground">
                    ≈ <CurrencyText amount={e.amountBase} className="font-medium" /> · {e.currency}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </SheetHeader>

        <SheetBody className="space-y-5 py-4">
          {isLoading || !e ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <WorkflowStepper expense={e} />

              {e.status === 'REJECTED' && e.rejectedReason ? (
                <Callout tone="danger" icon={Ban} title={t('payTreasury.exp.rejectedBecause')}>
                  {e.rejectedReason}
                  {e.approvedBy ? <span className="block text-2xs opacity-80">— {e.approvedBy.name}</span> : null}
                </Callout>
              ) : null}
              {e.status === 'VOIDED' ? (
                <Callout tone="danger" icon={CircleSlash} title={t('payTreasury.exp.voidedTitle')}>
                  {e.voidReason}
                  <span className="block text-2xs opacity-80">
                    — {e.voidedBy?.name ?? ''} · {e.voidedAt ? formatDateTime(e.voidedAt) : ''}
                  </span>
                </Callout>
              ) : null}
              {e.isOverdue ? (
                <Callout tone="danger" icon={CalendarClock} title={t('payTreasury.exp.overdueTitle', { count: Math.abs(due ?? 0) })}>
                  {t('payTreasury.exp.overdueBody', { date: e.dueDate ? formatDate(e.dueDate) : '' })}
                </Callout>
              ) : null}
              {canApprove && e.status === 'SUBMITTED' && blockedByLimit ? (
                <Callout tone="warning" icon={ShieldAlert} title={t('payTreasury.exp.overLimitTitle')}>
                  {t('payTreasury.exp.overLimitBody')}
                </Callout>
              ) : null}
              {needsReceipt ? (
                <Callout tone="warning" icon={TriangleAlert} title={t('payTreasury.exp.flag.missingReceipt')}>
                  {t('payTreasury.exp.missingReceiptBody')}
                </Callout>
              ) : null}
              {canApprove && e.status === 'SUBMITTED' && ownClaim ? (
                <Callout tone="info" icon={ShieldAlert} title={t('payTreasury.exp.ownClaim')}>
                  {t('payTreasury.exp.ownClaimBody')}
                </Callout>
              ) : null}

              <section aria-labelledby="exp-facts">
                <h3 id="exp-facts" className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t('payTreasury.exp.facts')}
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border p-3 text-sm">
                  <Fact label={t('payTreasury.exp.date')}>
                    {formatDate(e.expenseDate)} <span className="text-muted-foreground">· {weekdayShort(e.expenseDate, lang)}</span>
                  </Fact>
                  <Fact label={t('payTreasury.exp.category')}>
                    {categoryName(e.category, lang)}
                    <span className="ml-1 text-2xs text-muted-foreground">({t(`payTreasury.exp.kind.${e.category.kind}`)})</span>
                  </Fact>
                  <Fact label={t('payTreasury.exp.createdBy')}>
                    <span className="flex items-center gap-1.5">
                      <PersonAvatar name={e.createdBy.name} size={20} />
                      <span className="truncate">{e.createdBy.name}</span>
                    </span>
                  </Fact>
                  <Fact label={t('payTreasury.col.branch')}>{e.branchName}</Fact>
                  {e.supplier ? <Fact label={t('payTreasury.exp.supplier')}>{e.supplier.name}</Fact> : null}
                  {e.purchaseOrder ? (
                    <Fact label={t('payTreasury.exp.po')}>
                      <span className="inline-flex items-center gap-1.5">
                        {e.purchaseOrder.poNumber}
                        <PoMatchChip match={e.poMatch} />
                      </span>
                    </Fact>
                  ) : null}
                  {e.paidAt ? (
                    <Fact label={t('payTreasury.exp.paidFrom')}>
                      {e.paidFromAccount ? (
                        `${e.paidFromAccount.bankCode} · ${e.paidFromAccount.accountName}`
                      ) : e.paidFromCashFund ? (
                        <span className="inline-flex items-center gap-1">
                          <Coins className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {e.paidFromCashFund.name}
                        </span>
                      ) : (
                        t('payTreasury.exp.cash')
                      )}
                    </Fact>
                  ) : null}
                  {e.status === 'PAID' && e.paidFromAccount ? (
                    <Fact label={t('payTreasury.exp.statement')}>
                      {e.bankMatch ? (
                        <span className="inline-flex items-center gap-1 text-success" title={e.bankMatch.description ?? undefined}>
                          <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('payTreasury.exp.matchedOn', { date: formatDate(e.bankMatch.statementDate) })}
                          {e.bankMatch.auto ? <span className="text-2xs text-muted-foreground">({t('payTreasury.exp.auto')})</span> : null}
                        </span>
                      ) : (
                        <span className="text-warning">{t('payTreasury.exp.notOnStatement')}</span>
                      )}
                    </Fact>
                  ) : null}
                  {e.paidAt ? <Fact label={t('payTreasury.exp.paidAt')}>{formatDateTime(e.paidAt)}</Fact> : null}
                  {e.dueDate ? (
                    <Fact label={t('payTreasury.exp.dueDate')}>
                      <span className={cn(e.isOverdue && 'text-destructive')}>{formatDate(e.dueDate)}</span>
                      {due != null && (e.status === 'SUBMITTED' || e.status === 'APPROVED') ? (
                        <span className="ml-1 text-2xs text-muted-foreground">
                          ({due < 0 ? t('payTreasury.exp.dueAgo', { count: -due }) : due === 0 ? t('payTreasury.exp.dueToday') : t('payTreasury.exp.dueIn', { count: due })})
                        </span>
                      ) : null}
                    </Fact>
                  ) : null}
                  {e.invoiceNumber ? (
                    <Fact label={t('payTreasury.exp.invoiceNumber')}>
                      <span className="font-mono text-xs">{e.invoiceNumber}</span>
                    </Fact>
                  ) : null}
                  {e.taxAmount != null ? (
                    <Fact label={t('payTreasury.exp.taxAmount')}>
                      <CurrencyText amount={e.taxAmount} currency={e.currency as 'LAK'} />
                      {e.amount > 0 ? <span className="ml-1 text-2xs text-muted-foreground">({Math.round((e.taxAmount / e.amount) * 1000) / 10}%)</span> : null}
                    </Fact>
                  ) : null}
                  {isForeign(e.currency) ? (
                    <Fact label={t('payTreasury.exp.fxRate')}>
                      <span className="tabular-nums">1 {e.currency} = {e.fxRate.toLocaleString()} LAK</span>
                    </Fact>
                  ) : null}
                  {e.paidReference ? (
                    <Fact label={t('payTreasury.exp.reference')}>
                      <span className="font-mono text-xs">{e.paidReference}</span>
                    </Fact>
                  ) : null}
                  {e.category.kind === 'INVENTORY' ? (
                    <p className="col-span-2 rounded-md bg-muted/60 px-2 py-1.5 text-2xs text-muted-foreground">{t('payTreasury.exp.kindHint.INVENTORY')}</p>
                  ) : null}
                </dl>
              </section>

              {e.allocations.length > 0 ? (
                <section aria-labelledby="exp-alloc">
                  <h3 id="exp-alloc" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Split className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('payTreasury.exp.allocations')}
                  </h3>
                  <ul className="space-y-1.5 rounded-lg border border-border p-3">
                    {e.allocations.map((a) => (
                      <li key={a.branchId} className="text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate">{a.branchName}</span>
                          <span className="shrink-0 tabular-nums">
                            <span className="mr-2 text-2xs text-muted-foreground">{a.percent}%</span>
                            <CurrencyText amount={a.amountBase} className="font-medium" />
                          </span>
                        </div>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${a.percent}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {e.notes ? (
                <section aria-labelledby="exp-notes">
                  <h3 id="exp-notes" className="mb-2 text-xs font-semibold text-muted-foreground">
                    {t('payTreasury.exp.notes')}
                  </h3>
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm">{e.notes}</p>
                </section>
              ) : null}

              <section aria-labelledby="exp-receipts" onDragOver={(ev) => { if (canAttach) { ev.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 id="exp-receipts" className="text-xs font-semibold text-muted-foreground">
                    {t('payTreasury.exp.attachments')} <span className="tabular-nums">({e.attachments.length})</span>
                  </h3>
                  {canAttach ? (
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept={ACCEPT}
                      className="sr-only"
                      aria-label={t('payTreasury.exp.attach')}
                      onChange={(ev) => {
                        void onFiles(ev.target.files);
                        ev.target.value = '';
                      }}
                    />
                  ) : null}
                </div>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {e.attachments.map((a) => (
                    <li key={a.id} className="group relative">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-muted transition-shadow hover:shadow-md"
                        aria-label={t('payTreasury.exp.openAttachment')}
                      >
                        {a.contentType === 'application/pdf' ? (
                          <>
                            <FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                            <span className="mt-1 text-2xs text-muted-foreground">PDF</span>
                          </>
                        ) : (
                          <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                      </a>
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-2xs text-white">
                        {(a.sizeBytes / 1024).toFixed(0)} KB · {formatDate(a.createdAt)}
                      </span>
                      {canManage && e.status !== 'PAID' ? (
                        <button
                          type="button"
                          aria-label={t('payTreasury.exp.removeAttachment')}
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={async () => {
                            const ok = await confirm({ title: t('payTreasury.exp.removeAttachment'), confirmLabel: t('common.delete'), destructive: true });
                            if (ok) delAtt.mutate({ id: e.id, attachmentId: a.id }, { onError });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                  {canAttach ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={upload.isPending}
                        className={cn(
                          'flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-2 text-center text-2xs transition-colors',
                          dragging ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                      >
                        <ImagePlus className={cn('h-5 w-5', upload.isPending && 'animate-pulse')} aria-hidden="true" />
                        {upload.isPending ? t('payTreasury.exp.uploading') : t('payTreasury.exp.dropReceipt')}
                      </button>
                    </li>
                  ) : null}
                </ul>
                {e.attachments.length === 0 && !canAttach ? (
                  <p className="text-sm text-muted-foreground">{t('payTreasury.exp.noAttachments')}</p>
                ) : null}
              </section>

              {history.length > 0 ? (
                <section aria-labelledby="exp-history">
                  <h3 id="exp-history" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('payTreasury.exp.history')}
                  </h3>
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {[...history].reverse().map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary/70" aria-hidden="true" />
                        <p className="text-sm">
                          <span className="font-medium">{t(`payTreasury.exp.hist.${h.action}`, { defaultValue: h.action })}</span>
                          {h.user ? <span className="text-muted-foreground"> · {h.user.name}</span> : null}
                        </p>
                        <p className="text-2xs tabular-nums text-muted-foreground">{formatDateTime(h.at)}</p>
                        {h.changes.length > 0 ? (
                          <ul className="mt-1 space-y-0.5 text-2xs">
                            {h.changes.map((c) => (
                              <li key={c.field} className="text-muted-foreground">
                                {t(`payTreasury.exp.field.${c.field}`, { defaultValue: c.field })}:{' '}
                                <span className="line-through">{String(c.from ?? '—')}</span> → <span className="font-medium text-foreground">{String(c.to ?? '—')}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {h.note ? <p className="mt-0.5 text-2xs text-muted-foreground">“{h.note}”</p> : null}
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </>
          )}
        </SheetBody>

        {e ? (
          <SheetFooter className="flex-wrap sm:justify-between">
            <div className="flex gap-2">
              {canManage && editable ? (
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive-soft"
                  disabled={del.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t('payTreasury.exp.deleteTitle'),
                      description: t('payTreasury.exp.deleteBody'),
                      confirmLabel: t('common.delete'),
                      destructive: true,
                    });
                    if (ok) del.mutate(e.id, { onSuccess: onClose, onError });
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('common.delete')}
                </Button>
              ) : null}
              {canManage ? (
                <Button variant="ghost" onClick={() => onDuplicate(e)} title={t('payTreasury.exp.duplicateHint')}>
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.exp.duplicate')}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canManage && editable ? (
                <>
                  <Button variant="secondary" onClick={() => onEdit(e)}>
                    <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                  <Button disabled={act.isPending} onClick={() => run({ id: e.id, action: 'submit' }, undefined, t('payTreasury.exp.toast.submitted', { count: 1 }))}>
                    <Send className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.exp.submit')}
                  </Button>
                </>
              ) : null}
              {canApprove && e.status === 'SUBMITTED' ? (
                <>
                  <Button variant="secondary" className="text-destructive hover:bg-destructive-soft" onClick={() => setRejecting(true)}>
                    <Ban className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.exp.reject')}
                  </Button>
                  <Button
                    disabled={act.isPending || ownClaim || blockedByLimit || blockedByMatch}
                    title={
                      ownClaim
                        ? t('payTreasury.exp.ownClaim')
                        : blockedByLimit
                          ? t('payTreasury.exp.overLimitTitle')
                          : blockedByMatch
                            ? t('payTreasury.exp.poMatch.blocked')
                            : undefined
                    }
                    onClick={() =>
                      matchFailed
                        ? setOverriding(true)
                        : run({ id: e.id, action: 'approve' }, undefined, t('payTreasury.exp.toast.approved', { count: 1 }))
                    }
                  >
                    <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.exp.approve')}
                  </Button>
                </>
              ) : null}
              {canVoid ? (
                <Button variant="ghost" className="text-destructive hover:bg-destructive-soft" onClick={() => setVoiding(true)}>
                  <CircleSlash className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.exp.void')}
                </Button>
              ) : null}
              {canApprove && e.status === 'APPROVED' ? (
                <Button onClick={() => setPaying(true)}>
                  <Wallet className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.exp.markPaid')}
                </Button>
              ) : null}
            </div>
          </SheetFooter>
        ) : null}

        <Dialog open={rejecting} onOpenChange={(o) => !o && setRejecting(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('payTreasury.exp.rejectTitle')}</DialogTitle>
              <DialogDescription>{t('payTreasury.exp.rejectBody')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="er-reason">{t('payTreasury.exp.rejectReason')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {(['noReceipt', 'wrongAmount', 'wrongCategory', 'duplicate', 'notApproved'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setReason(t(`payTreasury.exp.rejectPreset.${k}`))}
                    className="rounded-full border border-border px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t(`payTreasury.exp.rejectPreset.${k}`)}
                  </button>
                ))}
              </div>
              <Textarea id="er-reason" rows={3} maxLength={500} value={reason} onChange={(ev) => setReason(ev.target.value)} />
              <p className="text-right text-2xs tabular-nums text-muted-foreground">{reason.length}/500</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRejecting(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={!reason.trim() || act.isPending}
                onClick={() =>
                  e &&
                  run({ id: e.id, action: 'reject', reason: reason.trim() }, () => {
                    setRejecting(false);
                    setReason('');
                  })
                }
              >
                {t('payTreasury.exp.reject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={overriding} onOpenChange={(o) => !o && setOverriding(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('payTreasury.exp.poMatch.overrideTitle')}</DialogTitle>
              <DialogDescription>
                {t('payTreasury.exp.poMatch.overrideBody', {
                  status: e?.poMatch ? t(`payTreasury.exp.poMatch.${e.poMatch.status}`) : '',
                  variance: (e?.poMatch?.variance ?? 0).toLocaleString('en-US'),
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="er-override">{t('payTreasury.exp.poMatch.overrideReason')}</Label>
              <Textarea id="er-override" rows={3} maxLength={500} value={overrideReason} onChange={(ev) => setOverrideReason(ev.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOverriding(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={!overrideReason.trim() || act.isPending}
                onClick={() =>
                  e &&
                  run(
                    { id: e.id, action: 'approve', overrideMatch: true, overrideReason: overrideReason.trim() },
                    () => {
                      setOverriding(false);
                      setOverrideReason('');
                    },
                    t('payTreasury.exp.toast.approved', { count: 1 }),
                  )
                }
              >
                {t('payTreasury.exp.poMatch.overrideApprove')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={voiding} onOpenChange={(o) => !o && setVoiding(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('payTreasury.exp.voidTitle')}</DialogTitle>
              <DialogDescription>
                {e?.status === 'PAID' ? t('payTreasury.exp.voidBodyPaid') : t('payTreasury.exp.voidBody')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-reason">{t('payTreasury.exp.rejectReason')}</Label>
              <Textarea id="ev-reason" rows={3} maxLength={500} value={voidReason} onChange={(ev) => setVoidReason(ev.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setVoiding(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={!voidReason.trim() || act.isPending}
                onClick={() =>
                  e &&
                  run({ id: e.id, action: 'void', reason: voidReason.trim() }, () => {
                    setVoiding(false);
                    setVoidReason('');
                  }, t('payTreasury.exp.toast.voided'))
                }
              >
                {t('payTreasury.exp.void')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {e ? (
          <PayExpenseDialog
            open={paying}
            onClose={() => setPaying(false)}
            branchId={e.branchId}
            currency={e.currency}
            count={1}
            amount={e.amount}
            busy={act.isPending}
            onConfirm={(input) => run({ id: e.id, action: 'pay', input }, () => setPaying(false), t('payTreasury.exp.toast.paid', { count: 1 }))}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}

const CALLOUT = {
  danger: 'bg-destructive-soft text-destructive',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
} as const;

function Callout({ tone, icon: Icon, title, children }: { tone: keyof typeof CALLOUT; icon: typeof Ban; title: string; children: ReactNode }) {
  return (
    <div className={cn('flex gap-2.5 rounded-lg px-3 py-2.5 text-sm', CALLOUT[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="text-[13px] text-foreground/80">{children}</div>
      </div>
    </div>
  );
}
