import { CalendarDays, ImagePlus, Target, Trash2, UserRound } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { fileToBase64 } from '@/features/payments-treasury/treasury.lib';
import { useUploadServiceImage } from '@/features/services/services.api';
import { useUsers } from '@/features/users/users.api';
import { cn } from '@/lib/utils';

import type { BranchExtras } from './branchExtras.lib';

const MAX_PHOTOS = 12;

function Block({ icon: Icon, title, hint, children }: { icon: typeof Target; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Wave 11 — per-weekday hours, branch manager, photo gallery and monthly targets.
 * Controlled; the parent form merges `value` into its PATCH/POST payload.
 */
export function BranchExtrasFields({
  value,
  onChange,
  branchId,
}: {
  value: BranchExtras;
  onChange: (v: BranchExtras) => void;
  branchId?: string;
}) {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const upload = useUploadServiceImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const days = t('branches.extras.dayNames', { returnObjects: true }) as string[];

  const managers = users.filter(
    (u) => u.isActive && ['BRANCH_ADMIN', 'STAFF', 'SUPER_ADMIN'].includes(u.role) && (!branchId || u.branchId === branchId || u.role === 'SUPER_ADMIN'),
  );

  async function uploadFiles(files: FileList | null, asCover: boolean) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, asCover ? 1 : MAX_PHOTOS - value.photoUrls.length);
    const urls: string[] = [];
    for (const f of list) {
      try {
        const { contentType, dataBase64 } = await fileToBase64(f, { maxDimension: 1800 });
        if (contentType !== 'image/jpeg') continue;
        urls.push((await upload.mutateAsync({ contentType, dataBase64 })).url);
      } catch {
        toast.error(t('branches.extras.uploadFailed'));
      }
    }
    if (!urls.length) return;
    onChange(asCover ? { ...value, coverImageUrl: urls[0]! } : { ...value, photoUrls: [...value.photoUrls, ...urls].slice(0, MAX_PHOTOS) });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Block icon={CalendarDays} title={t('branches.extras.weeklyTitle')} hint={t('branches.extras.weeklyHint')}>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t('branches.extras.perDay')}</span>
          <Switch checked={value.perDay} onCheckedChange={(perDay) => onChange({ ...value, perDay })} />
        </label>
        {value.perDay ? (
          <ul className="space-y-1.5">
            {value.weeklyHours.map((d, i) => {
              const bad = !d.closed && d.open >= d.close;
              const set = (patch: Partial<typeof d>) =>
                onChange({ ...value, weeklyHours: value.weeklyHours.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              return (
                <li key={d.day} className="grid grid-cols-[72px_1fr_1fr_auto] items-center gap-2">
                  <span className="text-sm font-medium">{days[d.day]}</span>
                  <Input type="time" aria-label={t('branches.form.openTime')} disabled={d.closed} value={d.open} onChange={(e) => set({ open: e.target.value })} className={cn('h-9 tabular-nums', bad && 'border-destructive')} />
                  <Input type="time" aria-label={t('branches.form.closeTime')} disabled={d.closed} value={d.close} onChange={(e) => set({ close: e.target.value })} className={cn('h-9 tabular-nums', bad && 'border-destructive')} />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={d.closed} onCheckedChange={(closed) => set({ closed })} aria-label={t('branches.extras.closedDay', { day: days[d.day] })} />
                    {t('branches.extras.closed')}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Block>

      <div className="space-y-6">
        <Block icon={UserRound} title={t('branches.extras.managerTitle')}>
          <Select
            aria-label={t('branches.extras.managerTitle')}
            value={value.managerUserId}
            onChange={(e) => onChange({ ...value, managerUserId: e.target.value })}
            options={[{ value: '', label: t('branches.extras.noManager') }, ...managers.map((u) => ({ value: u.id, label: `${u.name} · ${u.phone}` }))]}
          />
        </Block>

        <Block icon={Target} title={t('branches.extras.targetsTitle')} hint={t('branches.extras.targetsHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="br-rev-target">{t('branches.extras.revenueTarget')}</Label>
              <Input id="br-rev-target" className="mt-1 tabular-nums" type="number" min={0} value={value.revenueTarget} onChange={(e) => onChange({ ...value, revenueTarget: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="br-book-target">{t('branches.extras.bookingTarget')}</Label>
              <Input id="br-book-target" className="mt-1 tabular-nums" type="number" min={0} value={value.bookingTarget} onChange={(e) => onChange({ ...value, bookingTarget: e.target.value })} />
            </div>
          </div>
        </Block>
      </div>

      <div className="lg:col-span-2">
        <Block icon={ImagePlus} title={t('branches.extras.photosTitle')} hint={t('branches.extras.photosHint')}>
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <p className="mb-1 text-xs font-medium">{t('branches.extras.cover')}</p>
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted"
              >
                {value.coverImageUrl ? <img src={value.coverImageUrl} alt="" className="h-full w-full object-cover" /> : t('branches.extras.addCover')}
              </button>
              {value.coverImageUrl ? (
                <button type="button" className="mt-1 text-xs text-destructive" onClick={() => onChange({ ...value, coverImageUrl: '' })}>
                  {t('branches.extras.removeCover')}
                </button>
              ) : null}
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadFiles(e.target.files, true).finally(() => (e.target.value = ''))} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium">{t('branches.extras.gallery', { count: value.photoUrls.length, max: MAX_PHOTOS })}</p>
              <div className="flex flex-wrap gap-2">
                {value.photoUrls.map((u, i) => (
                  <div key={u} className="group relative h-20 w-28 overflow-hidden rounded-lg border border-border">
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={t('branches.extras.removePhoto')}
                      onClick={() => onChange({ ...value, photoUrls: value.photoUrls.filter((_, k) => k !== i) })}
                      className="absolute right-1 top-1 rounded-md bg-background/90 p-1 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {value.photoUrls.length < MAX_PHOTOS ? (
                  <button
                    type="button"
                    disabled={upload.isPending}
                    onClick={() => fileRef.current?.click()}
                    className="flex h-20 w-28 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted"
                  >
                    <ImagePlus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {upload.isPending ? '…' : t('branches.extras.addPhotos')}
                  </button>
                ) : null}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadFiles(e.target.files, false).finally(() => (e.target.value = ''))} />
            </div>
          </div>
        </Block>
      </div>
    </div>
  );
}
