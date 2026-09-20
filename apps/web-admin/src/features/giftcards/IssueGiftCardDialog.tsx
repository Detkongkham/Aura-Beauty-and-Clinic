import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  GIFT_CARD_MAX_AMOUNT,
  GIFT_CARD_MIN_AMOUNT,
  GIFT_CARD_VALID_MONTHS,
  issueGiftCardSchema,
  type GiftCardView,
  type IssueGiftCardInput,
} from '@abcp/shared-types';

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
import { useBranches } from '@/features/branches/branches.api';
import { formatCompactNumber, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useIssueGiftCard } from './giftcards.api';
import { GiftCardVisual } from './GiftCardVisual';

const PRESETS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000] as const;

interface IssueGiftCardDialogProps {
  open: boolean;
  defaultBranchId: string;
  onClose: () => void;
  /** Called with the new card so the page can open its detail sheet. */
  onIssued?: (card: GiftCardView) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function IssueGiftCardDialog({ open, defaultBranchId, onClose, onIssued }: IssueGiftCardDialogProps) {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const issue = useIssueGiftCard();

  const form = useForm<IssueGiftCardInput>({
    resolver: zodResolver(issueGiftCardSchema),
    defaultValues: {
      branchId: defaultBranchId === 'all' ? '' : defaultBranchId,
      amount: 200_000,
      recipientEmail: '',
      recipientName: '',
      message: '',
      issueReason: '',
    },
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open && !form.getValues('branchId') && defaultBranchId !== 'all') {
      form.setValue('branchId', defaultBranchId);
    }
  }, [open, defaultBranchId, form]);

  const amount = form.watch('amount');
  const branchId = form.watch('branchId');
  const email = form.watch('recipientEmail');
  const name = form.watch('recipientName');
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;
  const previewExpiry = new Date();
  previewExpiry.setMonth(previewExpiry.getMonth() + GIFT_CARD_VALID_MONTHS);

  function submit(values: IssueGiftCardInput) {
    const clean: IssueGiftCardInput = {
      ...values,
      recipientName: values.recipientName?.trim() || undefined,
      message: values.message?.trim() || undefined,
    };
    issue.mutate(clean, {
      onSuccess: (card) => {
        toast.success(t('giftCards.issued', { code: card.code }));
        form.reset({ ...form.formState.defaultValues, branchId: values.branchId });
        onClose();
        onIssued?.(card);
      },
      onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !issue.isPending && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('giftCards.issueTitle')}</DialogTitle>
          <DialogDescription>{t('giftCards.issueSubtitle')}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-5 md:grid-cols-[1fr_280px]" onSubmit={form.handleSubmit(submit)} noValidate>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gc-branch">{t('giftCards.col.branch')}</Label>
                <Select
                  id="gc-branch"
                  value={branchId}
                  onChange={(e) => form.setValue('branchId', e.target.value, { shouldValidate: true })}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={t('campaigns.selectBranch')}
                  aria-invalid={errors.branchId ? true : undefined}
                  aria-describedby="gc-branch-err"
                />
                <FieldError id="gc-branch-err" message={errors.branchId ? t('giftCards.form.branchRequired') : undefined} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-amount">{t('giftCards.amount')}</Label>
                <Input
                  id="gc-amount"
                  type="number"
                  inputMode="numeric"
                  min={GIFT_CARD_MIN_AMOUNT}
                  max={GIFT_CARD_MAX_AMOUNT}
                  step={10_000}
                  aria-invalid={errors.amount ? true : undefined}
                  aria-describedby="gc-amount-hint"
                  {...form.register('amount', { valueAsNumber: true })}
                />
                {errors.amount ? (
                  <FieldError id="gc-amount-hint" message={errors.amount.message} />
                ) : (
                  <p id="gc-amount-hint" className="text-2xs text-muted-foreground">
                    {t('giftCards.form.amountRange', {
                      min: formatCurrency(GIFT_CARD_MIN_AMOUNT),
                      max: formatCurrency(GIFT_CARD_MAX_AMOUNT),
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('giftCards.form.presets')}>
              {PRESETS.map((p) => {
                const active = amount === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => form.setValue('amount', p, { shouldValidate: true })}
                    className={cn(
                      'min-h-[32px] cursor-pointer rounded-full border px-3 text-xs font-medium tabular-nums transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
                    )}
                  >
                    {formatCompactNumber(p)}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gc-email">{t('giftCards.recipientEmail')}</Label>
                <Input
                  id="gc-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  aria-invalid={errors.recipientEmail ? true : undefined}
                  aria-describedby="gc-email-err"
                  {...form.register('recipientEmail')}
                />
                <FieldError id="gc-email-err" message={errors.recipientEmail ? t('giftCards.form.emailInvalid') : undefined} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-name">{t('giftCards.recipientName')}</Label>
                <Input id="gc-name" autoComplete="name" {...form.register('recipientName')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gc-msg">{t('giftCards.message')}</Label>
              <Textarea id="gc-msg" rows={2} maxLength={500} {...form.register('message')} />
            </div>

            <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning-soft/40 p-3">
              <Label htmlFor="gc-reason" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                {t('giftCards.issueReason')}
              </Label>
              <Textarea
                id="gc-reason"
                rows={2}
                maxLength={300}
                placeholder={t('giftCards.form.reasonPlaceholder')}
                aria-invalid={errors.issueReason ? true : undefined}
                aria-describedby="gc-reason-err"
                {...form.register('issueReason')}
              />
              <FieldError id="gc-reason-err" message={errors.issueReason ? t('giftCards.form.reasonShort') : undefined} />
            </div>
          </div>

          <aside className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{t('giftCards.form.preview')}</p>
            <GiftCardVisual
              code="GC-XXXX-XXXX"
              balance={Number.isFinite(amount) ? amount : 0}
              recipient={name?.trim() || email?.trim() || null}
              branchName={branchName}
              expireDate={previewExpiry.toISOString()}
            />
            <ul className="space-y-1.5 text-2xs text-muted-foreground">
              <li>• {t('giftCards.form.noteValidity', { months: GIFT_CARD_VALID_MONTHS })}</li>
              <li>• {t('giftCards.form.noteNotify')}</li>
              <li>• {t('giftCards.form.noteAudit')}</li>
            </ul>
          </aside>

          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={issue.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={issue.isPending}>
              {issue.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {issue.isPending ? t('giftCards.form.issuing') : t('giftCards.issue')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
