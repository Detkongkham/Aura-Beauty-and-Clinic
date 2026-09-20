import { zodResolver } from '@hookform/resolvers/zod';
import { ImageOff, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
import type { Service } from '@/types/models';

import { useProducts } from '@/features/inventory/inventory.api';

import { useSaveService, useServiceCategories, type ServiceInput } from './services.api';

const formSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    categoryId: z.string().uuid('ເລືອກໝວດໝູ່'),
    price: z.coerce.number().nonnegative(),
    compareAtPrice: z.coerce.number().nonnegative().optional(),
    durationMinutes: z.coerce
      .number()
      .int()
      .positive()
      .refine((n) => n % 5 === 0, 'ຕ້ອງເປັນຕົວຄູນຂອງ 5'),
    description: z.string().max(2000).optional(),
    imageUrl: z.string().trim().url('URL ບໍ່ຖືກຕ້ອງ').optional().or(z.literal('')),
    highlights: z.array(z.string().trim().min(1).max(60)).max(12),
    requireDeposit: z.boolean(),
    depositAmount: z.coerce.number().nonnegative().optional(),
    isActive: z.boolean(),
    consumables: z.array(
      z.object({
        productId: z.string().uuid('ເລືອກສິນຄ້າ'),
        qtyPerUse: z.coerce.number().positive(),
      }),
    ),
  })
  .refine((v) => !v.compareAtPrice || v.compareAtPrice > v.price, {
    message: 'ລາຄາປົກກະຕິຕ້ອງສູງກວ່າລາຄາຂາຍ',
    path: ['compareAtPrice'],
  });
type FormValues = z.input<typeof formSchema>;

const EMPTY: FormValues = {
  name: '',
  categoryId: '',
  price: 0,
  compareAtPrice: undefined,
  durationMinutes: 30,
  description: '',
  imageUrl: '',
  highlights: [],
  requireDeposit: false,
  depositAmount: 0,
  isActive: true,
  consumables: [],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
}

export function ServiceFormDialog({ open, onOpenChange, service }: Props) {
  const { t } = useTranslation();
  const { data: categories = [] } = useServiceCategories();
  const { data: productsPage } = useProducts({ page: 1, pageSize: 200 });
  const products = productsPage?.items ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const save = useSaveService(service?.id);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'consumables' });

  useEffect(() => {
    if (!open) return;
    form.reset(
      service
        ? {
            name: service.name,
            categoryId: service.categoryId,
            price: service.price,
            compareAtPrice: service.compareAtPrice ?? undefined,
            durationMinutes: service.durationMinutes,
            description: service.description ?? '',
            imageUrl: service.imageUrl ?? '',
            highlights: service.highlights,
            requireDeposit: service.requireDeposit,
            depositAmount: service.depositAmount ?? 0,
            isActive: service.isActive,
            consumables: service.consumables.map((c) => ({
              productId: c.productId,
              qtyPerUse: c.qtyPerUse,
            })),
          }
        : EMPTY,
    );
  }, [open, service, form]);

  const onSubmit = form.handleSubmit((values) => {
    const parsed = formSchema.parse(values);
    const payload: ServiceInput = {
      ...parsed,
      description: parsed.description || undefined,
      compareAtPrice: parsed.compareAtPrice || null,
      imageUrl: parsed.imageUrl || null,
      depositAmount: parsed.requireDeposit ? parsed.depositAmount : null,
      consumables: parsed.consumables.map((c) => ({
        productId: c.productId,
        productName: productById.get(c.productId)?.name ?? '',
        qtyPerUse: c.qtyPerUse,
        unit: productById.get(c.productId)?.unit ?? '',
      })),
    };
    save.mutate(payload, {
      onSuccess: () => {
        toast.success(t('services.saved'));
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(err instanceof NormalizedApiError ? err.message : t('services.saveError'));
      },
    });
  });

  const requireDeposit = form.watch('requireDeposit');
  const isActive = form.watch('isActive');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>
              {service ? t('services.editTitle') : t('services.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('services.formSubtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex max-h-[calc(100vh-13rem)] flex-col">
          <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
            {/* Basic details */}
            <section className="space-y-4">
              <SectionLabel>{t('services.sectionBasic')}</SectionLabel>

              <Field label={t('services.name')} error={form.formState.errors.name?.message}>
                <Input
                  {...form.register('name')}
                  aria-invalid={Boolean(form.formState.errors.name)}
                  placeholder={t('services.name')}
                />
              </Field>

              <Field
                label={t('nav.categories')}
                error={form.formState.errors.categoryId?.message}
              >
                <Select
                  {...form.register('categoryId')}
                  className="h-10"
                  placeholder={t('services.pickCategory')}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('services.price')} error={form.formState.errors.price?.message}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₭
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="pl-7 tabular-nums"
                      {...form.register('price')}
                    />
                  </div>
                </Field>
                <Field
                  label={t('services.duration')}
                  error={form.formState.errors.durationMinutes?.message}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    step={5}
                    className="tabular-nums"
                    {...form.register('durationMinutes')}
                  />
                </Field>
              </div>

              <Field
                label={t('services.compareAtPrice')}
                error={form.formState.errors.compareAtPrice?.message}
                hint={t('services.compareAtPriceHint')}
              >
                <div className="relative max-w-[calc(50%-0.375rem)]">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₭
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="pl-7 tabular-nums"
                    placeholder="0"
                    {...form.register('compareAtPrice')}
                  />
                </div>
              </Field>

              <Field label={t('services.description')}>
                <Textarea {...form.register('description')} rows={3} />
              </Field>
            </section>

            {/* Presentation — catalog image + booking-app highlight chips */}
            <section className="space-y-4">
              <SectionLabel>{t('services.sectionPresentation')}</SectionLabel>

              <Field label={t('services.imageUrl')} error={form.formState.errors.imageUrl?.message}>
                <div className="flex items-center gap-3">
                  <ImagePreview url={form.watch('imageUrl')} name={form.watch('name')} />
                  <Input
                    className="flex-1"
                    placeholder="https://..."
                    {...form.register('imageUrl')}
                  />
                </div>
              </Field>

              <Field label={t('services.highlights')} hint={t('services.highlightsHint')}>
                <HighlightsInput
                  value={form.watch('highlights') ?? []}
                  onChange={(v) => form.setValue('highlights', v, { shouldDirty: true })}
                />
              </Field>
            </section>

            {/* Settings */}
            <section className="space-y-3">
              <SectionLabel>{t('services.sectionSettings')}</SectionLabel>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                <SettingRow title={t('services.requireDeposit')} title2={t('services.depositHint')}>
                  <Toggle
                    checked={requireDeposit}
                    onCheckedChange={(v) => form.setValue('requireDeposit', v, { shouldDirty: true })}
                    aria-label={t('services.requireDeposit')}
                  />
                </SettingRow>
                {requireDeposit ? (
                  <div className="bg-muted/30 px-3.5 py-3">
                    <Field label={t('services.depositAmount')}>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          ₭
                        </span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          className="pl-7 tabular-nums"
                          {...form.register('depositAmount')}
                        />
                      </div>
                    </Field>
                  </div>
                ) : null}
                <SettingRow title={t('services.active')} title2={t('services.activeHint')}>
                  <Toggle
                    checked={isActive}
                    onCheckedChange={(v) => form.setValue('isActive', v, { shouldDirty: true })}
                    aria-label={t('services.active')}
                  />
                </SettingRow>
              </div>
            </section>

            {/* Bill of materials */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel className="mb-0">{t('services.bom')}</SectionLabel>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={products.length === 0}
                  onClick={() => append({ productId: '', qtyPerUse: 1 })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('common.create')}
                </Button>
              </div>

              {products.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  {t('services.bomNoProducts')}
                </p>
              ) : fields.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  {t('services.bomEmpty')}
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map((f, i) => {
                    const picked = productById.get(form.watch(`consumables.${i}.productId`));
                    return (
                      <div
                        key={f.id}
                        className="grid grid-cols-[1fr_5rem_3.5rem_auto] items-end gap-2 rounded-xl border border-border bg-muted/30 p-3"
                      >
                        <Field label={t('services.bomProduct')}>
                          <Select
                            {...form.register(`consumables.${i}.productId`)}
                            options={[
                              { value: '', label: t('services.bomPickProduct') },
                              ...products.map((p) => ({
                                value: p.id,
                                label: `${p.name} (${p.sku})`,
                              })),
                            ]}
                          />
                        </Field>
                        <Field label={t('services.bomQty')}>
                          <Input
                            type="number"
                            step="0.001"
                            className="tabular-nums"
                            {...form.register(`consumables.${i}.qtyPerUse`)}
                          />
                        </Field>
                        <Field label={t('services.bomUnit')}>
                          <span className="inline-flex h-10 items-center text-xs text-muted-foreground">
                            {picked?.unit ?? '—'}
                          </span>
                        </Field>
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          aria-label={t('common.delete')}
                          className="mb-0.5 inline-flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('mb-1 text-sm font-semibold text-foreground', className)}>{children}</p>
  );
}

function SettingRow({
  title,
  title2,
  children,
}: {
  title: string;
  title2?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3">
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {title2 ? <span className="block text-xs text-muted-foreground">{title2}</span> : null}
      </span>
      {children}
    </label>
  );
}

// Controlled on purpose: RHF `reset()` does not reliably re-sync a bare
// `sr-only` checkbox's `.checked`, which left the switch stuck off in edit
// mode. Drive it from `watch` + `setValue` at the call site instead.
const Toggle = ({
  checked,
  onCheckedChange,
  className,
  ...props
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
} & Omit<ComponentProps<'input'>, 'type' | 'checked' | 'onChange'>) => (
  <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
    <input
      type="checkbox"
      className={cn('peer sr-only', className)}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
    <span className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
    <span className="absolute left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5" />
  </span>
);

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** 44×44 live thumbnail next to the image URL input — swaps to a neutral
 *  placeholder on empty/broken URLs instead of leaving a dead layout gap. */
function ImagePreview({ url, name }: { url?: string; name?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const show = url && !broken;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/50 text-muted-foreground">
      {show ? (
        <img
          src={url}
          alt={name || ''}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <ImageOff className="h-4 w-4" aria-hidden="true" />
      )}
    </span>
  );
}

/** Enter-to-add chip editor for `Service.highlights` (short catalog badges
 *  like "ຜົມສຸຂະພາບດີ") — no shared TagInput exists yet, kept local. */
function HighlightsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim();
    if (!v || value.includes(v) || value.length >= 12) return setDraft('');
    onChange([...value, v]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((h, i) => (
            <li
              key={`${h}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary"
            >
              {h}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={h}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        disabled={value.length >= 12}
        placeholder={value.length >= 12 ? undefined : '+ Enter'}
      />
    </div>
  );
}
