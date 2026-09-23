import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { BankAccountView } from '@abcp/shared-types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/useAuth';
import { NormalizedApiError } from '@/services/apiError';

import { ReauthField } from './banks.parts';
import { FileTooLargeError, fileToBase64 } from './treasury.lib';
import { useUpdateBankAccount, useUploadBankQr } from './treasury.api';

interface Props {
  account: BankAccountView | null;
  onClose: () => void;
  canManage: boolean;
}

/** Static QR image of a bank account — preview, replace or remove. */
export function BankQrDialog({ account, onClose, canManage }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadBankQr();
  const update = useUpdateBankAccount();
  const { user } = useAuth();
  const needsApproval = user?.role !== 'SUPER_ADMIN';
  const [password, setPassword] = useState('');
  useEffect(() => setPassword(''), [account?.id]);
  const pendingQr = account?.pendingChange?.kind === 'QR' ? account.pendingChange : null;
  // keep showing the latest value after a mutation refetch
  const url = account?.qrImageUrl ?? null;

  async function onPick(file: File | undefined) {
    if (!file || !account) return;
    try {
      const { dataBase64 } = await fileToBase64(file, { maxDimension: 1200 });
      upload.mutate(
        { id: account.id, input: { contentType: 'image/jpeg', dataBase64, currentPassword: password } },
        {
          onSuccess: (r) => {
            toast.success(t(r.pending ? 'payTreasury.banks.change.sent' : 'common.saved'));
            onClose();
          },
          onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
        },
      );
    } catch (err) {
      toast.error(err instanceof FileTooLargeError ? t('payTreasury.fileTooLarge') : t('payTreasury.fileUnreadable'));
    }
  }

  return (
    <Dialog open={Boolean(account)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('payTreasury.banks.qrTitle')}</DialogTitle>
          <DialogDescription>
            {account ? `${account.bank.code} · ${account.accountName}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
          {url ? (
            <img src={url} alt={t('payTreasury.banks.qrAlt')} className="h-full w-full object-contain" />
          ) : (
            <p className="px-6 text-center text-sm text-muted-foreground">{t('payTreasury.banks.qrEmpty')}</p>
          )}
        </div>

        {pendingQr ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            {t('payTreasury.banks.change.qrPending', { name: pendingQr.requestedByName })}
          </p>
        ) : null}

        {canManage && !pendingQr ? (
          <ReauthField
            id="qr-password"
            value={password}
            onChange={setPassword}
            hint={t(needsApproval ? 'payTreasury.banks.change.approvalHint' : 'payTreasury.banks.change.ownerHint')}
            tone={needsApproval ? 'warning' : 'info'}
          />
        ) : null}

        {canManage ? (
          <div className="flex justify-between gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t('payTreasury.banks.qrUpload')}
              onChange={(e) => {
                void onPick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending || !password || Boolean(pendingQr)}
            >
              <ImagePlus className="mr-1 h-4 w-4" aria-hidden="true" />
              {t(url ? 'payTreasury.banks.qrReplace' : 'payTreasury.banks.qrUpload')}
            </Button>
            {url ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive-soft"
                disabled={update.isPending}
                onClick={() =>
                  account &&
                  update.mutate(
                    { id: account.id, input: { qrImageKey: null } },
                    {
                      onSuccess: () => {
                        toast.success(t('common.saved'));
                        onClose();
                      },
                    },
                  )
                }
              >
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.banks.qrRemove')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
