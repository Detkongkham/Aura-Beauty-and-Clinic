import { useState, type FormEvent } from 'react';
import { Plus, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NormalizedApiError } from '@/services/apiError';

import { useSaveUom, useUoms } from './inventory.api';

/** M1 (inventory 9C) — ໜ່ວຍນັບໃຊ້ຮ່ວມທົ່ວອົງກອນ: ເພີ່ມ (admin), ປິດ/ເປີດ (SUPER_ADMIN). */
export function UomManagerDialog({
  open,
  onClose,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data: uoms, isLoading } = useUoms(true);
  const save = useSaveUom();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameLo, setNameLo] = useState('');

  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  function add(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    save.mutate(
      { input: { code: code.trim(), name: name.trim(), nameLo: nameLo.trim() || null } },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          setCode('');
          setName('');
          setNameLo('');
        },
        onError,
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="flex-row items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Ruler className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{t('inventory.uom.title')}</DialogTitle>
            <DialogDescription>{t('inventory.uom.subtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={add} className="grid grid-cols-[1fr_1.3fr_1.3fr_auto] items-end gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('inventory.uom.code')}
            aria-label={t('inventory.uom.code')}
            className="font-mono"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('inventory.uom.name')}
            aria-label={t('inventory.uom.name')}
          />
          <Input
            value={nameLo}
            onChange={(e) => setNameLo(e.target.value)}
            placeholder={t('inventory.uom.nameLo')}
            aria-label={t('inventory.uom.nameLo')}
          />
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={save.isPending || !code.trim() || !name.trim()}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('inventory.uom.add')}</span>
          </Button>
        </form>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {(uoms ?? []).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{u.code}</span>
                      {u.name}
                      {u.nameLo ? (
                        <span className="text-muted-foreground">· {u.nameLo}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('inventory.uom.products', { count: u.productCount })}
                    </p>
                  </div>
                  <Switch
                    checked={u.isActive}
                    disabled={!canEdit || save.isPending}
                    onCheckedChange={(v) =>
                      save.mutate({ id: u.id, input: { isActive: v } }, { onError })
                    }
                    aria-label={t('inventory.uom.active')}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
