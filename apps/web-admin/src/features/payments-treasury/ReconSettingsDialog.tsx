import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NormalizedApiError } from '@/services/apiError';

import { useReconSettings, useUpdateReconSettings } from './reconciliation.api';

/** G9 — morning reminder + the size of difference that raises a warning. SUPER_ADMIN edits. */
export function ReconSettingsDialog({ open, onClose, canEdit }: { open: boolean; onClose: () => void; canEdit: boolean }) {
  const { t } = useTranslation();
  const { data } = useReconSettings();
  const update = useUpdateReconSettings();
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState('');

  useEffect(() => {
    if (open && data) {
      setEnabled(data.reminderEnabled);
      setThreshold(String(data.varianceAlertThreshold));
    }
  }, [open, data]);

  const n = Number(threshold);
  const valid = threshold !== '' && Number.isFinite(n) && n >= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('payTreasury.recon.settings.title')}
          </DialogTitle>
          <DialogDescription>{t('payTreasury.recon.settings.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <Label htmlFor="rs-enabled">{t('payTreasury.recon.settings.reminder')}</Label>
            <p className="mt-0.5 text-2xs text-muted-foreground">{t('payTreasury.recon.settings.reminderHint')}</p>
          </div>
          <Switch id="rs-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} aria-label={t('payTreasury.recon.settings.reminder')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rs-threshold">{t('payTreasury.recon.settings.threshold')}</Label>
          <Input
            id="rs-threshold"
            type="number"
            inputMode="numeric"
            min={0}
            className="tabular-nums"
            value={threshold}
            disabled={!canEdit}
            onChange={(e) => setThreshold(e.target.value)}
          />
          <p className="text-2xs text-muted-foreground">{t('payTreasury.recon.settings.thresholdHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canEdit ? (
            <Button
              type="button"
              disabled={!valid || update.isPending}
              onClick={() =>
                update.mutate(
                  { reminderEnabled: enabled, varianceAlertThreshold: n },
                  {
                    onSuccess: () => {
                      toast.success(t('common.saved'));
                      onClose();
                    },
                    onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
                  },
                )
              }
            >
              {t('common.save')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
