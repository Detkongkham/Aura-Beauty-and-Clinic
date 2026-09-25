import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Check, Clock, MapPin, Power, Sparkles, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import type { Branch, LaoProvinceId } from '@/types/models';

import { BranchExtrasFields } from './BranchExtrasFields';
import { extrasFrom, extrasInvalid, extrasPayload, type BranchExtras } from './branchExtras.lib';
import { BranchMapPicker } from './BranchMapPicker';
import { AMENITY_ICON, AMENITY_IDS } from './branches.lib';
import { LAO_PROVINCES, provinceOptions } from './lao-provinces';
import { useSaveBranch, type BranchInput } from './branches.api';

const PROVINCE_IDS = LAO_PROVINCES.map((p) => p.id) as [LaoProvinceId, ...LaoProvinceId[]];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const formSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20),
  province: z.enum(PROVINCE_IDS),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(''), z.string().trim().email().max(160)]),
  amenities: z.array(z.enum(['wifi', 'parking', 'drink', 'lounge', 'kids', 'card'])),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  openTime: z.string().regex(TIME_RE),
  closeTime: z.string().regex(TIME_RE),
  isActive: z.boolean(),
  allowNegativeStock: z.boolean(),
});
type FormValues = z.input<typeof formSchema>;

const EMPTY: FormValues = {
  name: '',
  code: '',
  province: 'vientiane-capital',
  address: '',
  phone: '',
  email: '',
  amenities: [],
  latitude: 0,
  longitude: 0,
  openTime: '09:00',
  closeTime: '20:00',
  isActive: true,
  allowNegativeStock: false,
};

/** Whole hours a branch is open per day, from HH:mm (handles a past-midnight close). */
function hoursPerDay(open: string, close: string): number {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  let span = toMin(close) - toMin(open);
  if (span <= 0) span += 24 * 60;
  return Math.round((span / 60) * 10) / 10;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
  upcomingAppointments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branch?: Branch | null;
  /** Future PENDING/CONFIRMED appointments — closing the branch asks for confirmation when > 0. */
  upcomingAppointments?: number;
}) {
  const { t, i18n } = useTranslation();
  const save = useSaveBranch(branch?.id);
  const [confirmClose, setConfirmClose] = useState(false);
  const [extras, setExtras] = useState<BranchExtras>(() => extrasFrom(null));

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset(
      branch
        ? {
            name: branch.name,
            code: branch.code,
            province: branch.province,
            address: branch.address,
            phone: branch.phone,
            email: branch.email ?? '',
            amenities: (branch.amenities ?? []).filter((a): a is (typeof AMENITY_IDS)[number] =>
              (AMENITY_IDS as string[]).includes(a),
            ),
            latitude: branch.latitude,
            longitude: branch.longitude,
            openTime: branch.openTime,
            closeTime: branch.closeTime,
            isActive: branch.isActive,
            allowNegativeStock: branch.allowNegativeStock,
          }
        : EMPTY,
    );
    setConfirmClose(false);
    setExtras(extrasFrom(branch ?? null));
  }, [open, branch, form]);

  const province = form.watch('province');
  const openTime = form.watch('openTime');
  const closeTime = form.watch('closeTime');
  const isActive = form.watch('isActive');
  const allowNegativeStock = form.watch('allowNegativeStock');
  const amenities = form.watch('amenities') ?? [];
  // Turning an open branch off while it still has bookings needs an explicit second click.
  const closingWithBookings = Boolean(branch?.isActive) && !isActive && (upcomingAppointments ?? 0) > 0;
  const toggleAmenity = (a: (typeof AMENITY_IDS)[number]) =>
    form.setValue(
      'amenities',
      amenities.includes(a) ? amenities.filter((x) => x !== a) : [...amenities, a],
      { shouldDirty: true },
    );
  const lat = Number(form.watch('latitude')) || 0;
  const lng = Number(form.watch('longitude')) || 0;

  const setCoords = (nextLat: number, nextLng: number) => {
    form.setValue('latitude', nextLat, { shouldDirty: true, shouldValidate: true });
    form.setValue('longitude', nextLng, { shouldDirty: true, shouldValidate: true });
  };
  const perDay =
    TIME_RE.test(openTime) && TIME_RE.test(closeTime) ? hoursPerDay(openTime, closeTime) : null;

  const onSubmit = form.handleSubmit((values) => {
    const parsed = formSchema.parse(values);
    if (extrasInvalid(extras)) {
      toast.error(t('branches.extras.hoursInvalid'));
      return;
    }
    if (closingWithBookings && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    const payload: BranchInput = { ...parsed, ...extrasPayload(extras), ...(closingWithBookings ? { force: true } : {}) };
    save.mutate(payload, {
      onSuccess: () => {
        toast.success(t('branches.saved'));
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(err instanceof NormalizedApiError ? err.message : t('services.saveError')),
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3.5 border-b border-border bg-gradient-to-br from-primary/[0.07] via-muted/40 to-muted/40 px-7 py-5 pr-12">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm"
            aria-hidden="true"
          >
            <Building2 className="h-[22px] w-[22px]" />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-xl">
              {branch ? t('branches.editTitle') : t('branches.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('branches.formSubtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-muted/30 px-5 py-6 sm:px-7">
            {/* Row 1: details + hours/status */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Section icon={Building2} title={t('branches.form.sectionInfo')}>
                <Field label={t('branches.name')} error={errors.name && t('branches.form.nameRequired')}>
                  <Input
                    {...form.register('name')}
                    aria-invalid={Boolean(errors.name)}
                    placeholder={t('branches.form.namePlaceholder')}
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t('branches.code')}
                    error={errors.code && t('branches.form.codeRequired')}
                  >
                    <Input
                      {...form.register('code')}
                      aria-invalid={Boolean(errors.code)}
                      placeholder={t('branches.form.codePlaceholder')}
                      className="tabular-nums uppercase placeholder:normal-case"
                    />
                  </Field>
                  <Field label={t('branches.province')}>
                    <Select
                      {...form.register('province')}
                      className="h-10"
                      options={provinceOptions(i18n.language)}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('branches.phone')}>
                    <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register('phone')} />
                  </Field>
                  <Field label={t('branches.email')} error={errors.email && t('branches.form.emailInvalid')}>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      aria-invalid={Boolean(errors.email)}
                      placeholder="branch@aura.la"
                      {...form.register('email')}
                    />
                  </Field>
                </div>
              </Section>

              <div className="space-y-6">
                <Section icon={Clock} title={t('branches.form.sectionHours')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('branches.form.openTime')}>
                      <Input type="time" className="tabular-nums" {...form.register('openTime')} />
                    </Field>
                    <Field label={t('branches.form.closeTime')}>
                      <Input type="time" className="tabular-nums" {...form.register('closeTime')} />
                    </Field>
                  </div>
                  {perDay != null ? (
                    <p className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t('branches.form.hoursPerDay', { count: perDay })}
                    </p>
                  ) : null}
                </Section>

                <Section icon={Power} title={t('branches.form.sectionStatus')}>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium text-foreground">
                        {t('branches.summary.active')}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('branches.form.activeHint')}
                      </span>
                    </span>
                    <Toggle
                      checked={Boolean(isActive)}
                      onChange={(e) =>
                        form.setValue('isActive', e.target.checked, { shouldDirty: true })
                      }
                      aria-label={t('branches.summary.active')}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium text-foreground">
                        {t('inventory.allowNegative.title')}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('inventory.allowNegative.hint')}
                      </span>
                    </span>
                    <Toggle
                      checked={Boolean(allowNegativeStock)}
                      onChange={(e) =>
                        form.setValue('allowNegativeStock', e.target.checked, { shouldDirty: true })
                      }
                      aria-label={t('inventory.allowNegative.title')}
                    />
                  </label>
                  {closingWithBookings ? (
                    <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t('branches.form.closeWarning', { count: upcomingAppointments })}
                    </p>
                  ) : null}
                </Section>

                <Section icon={Sparkles} title={t('branches.amenities.title')}>
                  <p className="-mt-1 text-xs text-muted-foreground">{t('branches.amenities.hint')}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {AMENITY_IDS.map((a) => {
                      const Icon = AMENITY_ICON[a];
                      const on = amenities.includes(a);
                      return (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleAmenity(a)}
                          className={cn(
                            'flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors motion-reduce:transition-none',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            on ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{t(`branches.amenities.${a}`)}</span>
                          {on ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </Section>
              </div>
            </div>

            {/* Wave 11: weekly hours, manager, targets, photos */}
            <BranchExtrasFields value={extras} onChange={setExtras} branchId={branch?.id} />

            {/* Row 2: address + big map */}
            <Section icon={MapPin} title={t('branches.form.sectionLocation')}>
              <Field label={t('branches.address')}>
                <Textarea
                  {...form.register('address')}
                  rows={2}
                  placeholder={t('branches.form.addressPlaceholder')}
                />
              </Field>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">{t('branches.coordinates')}</Label>
                  <BranchMapPicker
                    provinceId={province}
                    lat={lat}
                    lng={lng}
                    onChange={setCoords}
                    onClear={() => setCoords(0, 0)}
                    className="h-[360px]"
                  />
                </div>
                <div className="space-y-4">
                  <Field label="lat" error={errors.latitude && t('branches.form.latRange')}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      className="tabular-nums"
                      {...form.register('latitude')}
                    />
                  </Field>
                  <Field label="lng" error={errors.longitude && t('branches.form.lngRange')}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      className="tabular-nums"
                      {...form.register('longitude')}
                    />
                  </Field>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('branches.form.mapHint')}
                  </p>
                </div>
              </div>
            </Section>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-7 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="lg"
              variant={confirmClose && closingWithBookings ? 'danger' : 'primary'}
              disabled={save.isPending}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {save.isPending
                ? t('common.loading')
                : confirmClose && closingWithBookings
                  ? t('branches.form.confirmClose', { count: upcomingAppointments })
                  : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5 border-b border-border pb-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const Toggle = ({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) => (
  <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
    <input type="checkbox" className={cn('peer sr-only', className)} {...props} />
    <span className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 motion-reduce:transition-none" />
    <span className="absolute left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5 motion-reduce:transition-none" />
  </span>
);

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string | false;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[13px]">{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
