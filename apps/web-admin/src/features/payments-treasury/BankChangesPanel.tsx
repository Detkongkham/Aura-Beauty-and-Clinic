import type { BankAccountChangeView } from '@abcp/shared-types';
import { ArrowRight, Check, ShieldAlert, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { BankMonogram, ReauthField, TonePill } from './banks.parts';
import { groupAccountNumber } from './banks.lib';
import { useApproveBankChange, useCancelBankChange, useRejectBankChange } from './treasury.api';

/**
 * Payee changes waiting for the owner. A branch admin's new account / number / name / currency / QR has
 * no effect until a SUPER_ADMIN approves it here with their password — the defence against someone
 * quietly swapping the account customers pay into. The owner sees full numbers (they must verify them,
 * ideally by calling the bank); the requester can withdraw their own request.
 */
export function BankChangesPanel({
  changes,
  isOwner,
  userId,
}: {
  changes: BankAccountChangeView[];
  isOwner: boolean;
  userId: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const [approving, setApproving] = useState<BankAccountChangeView | null>(null);
  const [rejecting, setRejecting] = useState<BankAccountChangeView | null>(null);
  const cancel = useCancelBankChange();
  if (changes.length === 0) return null;

  return (
    <section
      aria-labelledby="changes-title"
      className="rounded-xl border border-warning/50 bg-warning-soft/30 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="changes-title" className="text-sm font-semibold">
            {t('payTreasury.banks.change.queueTitle', { count: changes.length })}
          </h2>
          <p className="text-2xs text-muted-foreground">
            {t(
              isOwner
                ? 'payTreasury.banks.change.queueHintOwner'
                : 'payTreasury.banks.change.queueHint',
            )}
          </p>
        </div>
      </div>

      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
        {changes.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2.5">
              <BankMonogram code={c.bankCode || '—'} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{c.accountName}</p>
                  <TonePill tone={c.kind === 'CREATE' ? 'info' : 'warning'}>
                    {t(`payTreasury.banks.change.kind.${c.kind}`)}
                  </TonePill>
                </div>
                <p
                  className="truncate text-2xs text-muted-foreground"
                  title={formatDateTime(c.createdAt)}
                >
                  {t('payTreasury.banks.change.by', {
                    name: c.requestedByName,
                    branch: c.branchName,
                  })}{' '}
                  · {formatRelative(c.createdAt, lang)}
                </p>
              </div>
            </div>

            <ChangeDiff change={c} />

            <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
              {isOwner ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-destructive hover:bg-destructive-soft"
                    onClick={() => setRejecting(c)}
                  >
                    <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    {t('payTreasury.banks.change.reject')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setApproving(c)}
                    disabled={c.requestedById === userId}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    {t('payTreasury.banks.change.approve')}
                  </Button>
                </>
              ) : c.requestedById === userId ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(c.id, {
                      onSuccess: () => toast.success(t('payTreasury.banks.change.cancelled')),
                      onError: (err) =>
                        toast.error(
                          err instanceof NormalizedApiError ? err.message : t('common.saveError'),
                        ),
                    })
                  }
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.banks.change.withdraw')}
                </Button>
              ) : (
                <span className="text-2xs text-muted-foreground">
                  {t('payTreasury.banks.change.waiting')}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ApproveDialog change={approving} onClose={() => setApproving(null)} />
      <RejectDialog change={rejecting} onClose={() => setRejecting(null)} />
    </section>
  );
}

/** What the request changes: before → after per field, or the two QR images side by side. */
function ChangeDiff({ change: c }: { change: BankAccountChangeView }) {
  const { t } = useTranslation();
  return c.kind === 'QR' ? (
    <div className="mt-2 flex items-center gap-2">
      <QrThumb url={c.qrBeforeUrl} label={t('payTreasury.banks.change.before')} />
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <QrThumb url={c.qrAfterUrl} label={t('payTreasury.banks.change.after')} highlight />
    </div>
  ) : (
    <dl className="mt-2 divide-y divide-border rounded-md border border-border text-xs">
      {c.changes.map((d) => (
        <div key={d.field} className="grid grid-cols-[96px_1fr] items-center gap-2 px-2.5 py-1.5">
          <dt className="text-muted-foreground">
            {t(`payTreasury.banks.change.field.${d.field}`)}
          </dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
            {d.before != null ? (
              <>
                <span className="text-muted-foreground line-through">
                  {fmt(d.field, d.before, t)}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              </>
            ) : null}
            <span className={cn('font-semibold', d.field === 'accountNumber' && 'font-mono')}>
              {fmt(d.field, d.after, t)}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function fmt(field: string, v: string | null, t: (k: string) => string): string {
  if (v == null || v === '') return '—';
  if (field === 'accountNumber') return groupAccountNumber(v);
  if (field === 'isDefault') return t('payTreasury.banks.default');
  return v;
}

function QrThumb({
  url,
  label,
  highlight,
}: {
  url: string | null;
  label: string;
  highlight?: boolean;
}) {
  return (
    <figure className="grid justify-items-center gap-1">
      <div
        className={cn(
          'flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-card',
          highlight ? 'border-warning' : 'border-border',
        )}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-2xs text-muted-foreground">—</span>
        )}
      </div>
      <figcaption className="text-2xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function ApproveDialog({
  change,
  onClose,
}: {
  change: BankAccountChangeView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const approve = useApproveBankChange();
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const close = () => {
    setPassword('');
    setNote('');
    onClose();
  };
  return (
    <Dialog open={Boolean(change)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('payTreasury.banks.change.approveTitle', { name: change?.accountName ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('payTreasury.banks.change.approveBody')}</DialogDescription>
        </DialogHeader>
        {change ? <ChangeDiff change={change} /> : null}
        <ReauthField
          id="approve-pw"
          value={password}
          onChange={setPassword}
          hint={t('payTreasury.banks.change.approvePwHint')}
          tone="warning"
        />
        <div className="grid gap-1.5">
          <Label htmlFor="approve-note">{t('payTreasury.banks.change.note')}</Label>
          <Textarea
            id="approve-note"
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('payTreasury.banks.change.notePlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!password || approve.isPending}
            onClick={() =>
              change &&
              approve.mutate(
                {
                  id: change.id,
                  input: {
                    currentPassword: password,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  },
                },
                {
                  onSuccess: () => {
                    toast.success(t('payTreasury.banks.change.approved'));
                    close();
                  },
                  onError: (err) =>
                    toast.error(
                      err instanceof NormalizedApiError ? err.message : t('common.saveError'),
                    ),
                },
              )
            }
          >
            <Check className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.banks.change.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  change,
  onClose,
}: {
  change: BankAccountChangeView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reject = useRejectBankChange();
  const [note, setNote] = useState('');
  const close = () => {
    setNote('');
    onClose();
  };
  return (
    <Dialog open={Boolean(change)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payTreasury.banks.change.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('payTreasury.banks.change.rejectBody')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="reject-note">{t('payTreasury.banks.change.reason')}</Label>
          <Textarea
            id="reject-note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!note.trim() || reject.isPending}
            onClick={() =>
              change &&
              reject.mutate(
                { id: change.id, note: note.trim() },
                {
                  onSuccess: () => {
                    toast.success(t('payTreasury.banks.change.rejected'));
                    close();
                  },
                  onError: (err) =>
                    toast.error(
                      err instanceof NormalizedApiError ? err.message : t('common.saveError'),
                    ),
                },
              )
            }
          >
            {t('payTreasury.banks.change.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
