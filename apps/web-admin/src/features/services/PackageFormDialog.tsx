import type { PackageView } from '@abcp/shared-types';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { NormalizedApiError } from '@/services/apiError';

import { useSavePackage } from './packages.api';
import { useServices } from './services.api';

type Item = { serviceId: string; totalUnits: string };

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = create */
  pkg: PackageView | null;
  branches: { id: string; name: string }[];
  defaultBranchId: string;
  lockBranch: boolean;
}

/** Create / edit a service package: price, validity and the sessions it contains. */
export function PackageFormDialog({ open, onClose, pkg, branches, defaultBranchId, lockBranch }: Props) {
  const { t } = useTranslation();
  const save = useSavePackage();
  const { data: services } = useServices({ page: 1, pageSize: 500, isActive: 'true' });
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [validity, setValidity] = useState('365');
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<Item[]>([{ serviceId: '', totalUnits: '5' }]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setBranchId(pkg?.branchId ?? defaultBranchId);
    setName(pkg?.name ?? '');
    setDescription(pkg?.description ?? '');
    setImageUrl(pkg?.imageUrl ?? '');
    setPrice(pkg ? String(pkg.totalPrice) : '');
    setValidity(String(pkg?.validityDays ?? 365));
    setIsActive(pkg?.isActive ?? true);
    setItems(pkg ? pkg.items.map((i) => ({ serviceId: i.serviceId, totalUnits: String(i.totalUnits) })) : [{ serviceId: '', totalUnits: '5' }]);
  }, [open, pkg, defaultBranchId]);

  const svcList = useMemo(
    () => (services?.items ?? []).filter((s) => !s.branchId || s.branchId === branchId),
    [services, branchId],
  );
  const priceOf = (id: string) => svcList.find((s) => s.id === id)?.price ?? 0;
  const value = items.reduce((s, i) => s + priceOf(i.serviceId) * (Number(i.totalUnits) || 0), 0);
  const sessions = items.reduce((s, i) => s + (Number(i.totalUnits) || 0), 0);
  const p = Number(price) || 0;
  const ids = items.map((i) => i.serviceId);
  const itemsOk =
    items.length > 0 &&
    ids.every(Boolean) &&
    new Set(ids).size === ids.length &&
    items.every((i) => Number.isInteger(Number(i.totalUnits)) && Number(i.totalUnits) >= 1 && Number(i.totalUnits) <= 100);
  const valid = name.trim() && p > 0 && Number(validity) >= 1 && Number(validity) <= 1825 && itemsOk && (imageUrl === '' || /^https?:\/\//.test(imageUrl));

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      totalPrice: p,
      validityDays: Number(validity),
      isActive,
      items: items.map((i) => ({ serviceId: i.serviceId, totalUnits: Number(i.totalUnits) })),
    };
    save.mutate(pkg ? { id: pkg.id, update: body } : { create: { ...body, branchId } }, {
      onSuccess: () => {
        toast.success(t('common.saved'));
        onClose();
      },
      onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg ? t('packagesAdmin.edit') : t('packagesAdmin.create')}</DialogTitle>
          <DialogDescription>{t('packagesAdmin.formHint')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="pkg-name">{t('packagesAdmin.name')}</Label>
            <Input id="pkg-name" className="mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            {touched && !name.trim() ? <p className="mt-1 text-xs text-destructive">{t('packagesAdmin.err.name')}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pkg-desc">{t('packagesAdmin.description')}</Label>
            <Textarea id="pkg-desc" className="mt-1" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pkg-branch">{t('packagesAdmin.branch')}</Label>
            <Select
              id="pkg-branch"
              className="mt-1"
              value={branchId}
              disabled={lockBranch || Boolean(pkg)}
              onChange={(e) => setBranchId(e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
          <div>
            <Label htmlFor="pkg-img">{t('packagesAdmin.imageUrl')}</Label>
            <Input id="pkg-img" className="mt-1" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pkg-price">{t('packagesAdmin.price')}</Label>
            <Input id="pkg-price" className="mt-1 tabular-nums" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            {touched && !(p > 0) ? <p className="mt-1 text-xs text-destructive">{t('packagesAdmin.err.price')}</p> : null}
          </div>
          <div>
            <Label htmlFor="pkg-valid">{t('packagesAdmin.validity')}</Label>
            <Input id="pkg-valid" className="mt-1 tabular-nums" type="number" min={1} max={1825} value={validity} onChange={(e) => setValidity(e.target.value)} />
          </div>
        </div>

        <fieldset className="mt-2 space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t('packagesAdmin.items')}</legend>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_auto] items-center gap-2">
              <Select
                aria-label={t('packagesAdmin.service')}
                value={it.serviceId}
                placeholder={t('packagesAdmin.pickService')}
                onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, serviceId: e.target.value } : x)))}
                options={svcList.map((s) => ({ value: s.id, label: `${s.name} · ₭${s.price.toLocaleString()}` }))}
              />
              <Input
                aria-label={t('packagesAdmin.sessions')}
                type="number"
                min={1}
                max={100}
                value={it.totalUnits}
                onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, totalUnits: e.target.value } : x)))}
                className="tabular-nums"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('packagesAdmin.removeItem')}
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((_, k) => k !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {touched && !itemsOk ? <p className="text-xs text-destructive">{t('packagesAdmin.err.items')}</p> : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setItems([...items, { serviceId: '', totalUnits: '1' }])}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('packagesAdmin.addItem')}
          </Button>
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2 text-xs">
            <div>
              <div className="text-muted-foreground">{t('packagesAdmin.valueAlone')}</div>
              <CurrencyText amount={value} className="font-semibold" />
            </div>
            <div>
              <div className="text-muted-foreground">{t('packagesAdmin.perSession')}</div>
              <CurrencyText amount={sessions ? Math.round(p / sessions) : 0} className="font-semibold" />
            </div>
            <div>
              <div className="text-muted-foreground">{t('packagesAdmin.savings')}</div>
              <span className="font-semibold tabular-nums">{value > 0 && p < value ? Math.round(((value - p) / value) * 100) : 0}%</span>
            </div>
          </div>
        </fieldset>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t('packagesAdmin.onSale')}</span>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
