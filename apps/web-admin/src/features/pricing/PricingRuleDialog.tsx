import type { ReactNode } from 'react';
import { useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarRange, Clock, Percent, Store, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PricingRuleView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { previewPrice, ruleEffect, toMinutes } from './pricingRules';

const DOW = [0, 1, 2, 3, 4, 5, 6];

/** ຊ່ວງເວລາທີ່ໃຊ້ເລື້ອຍ — ກົດດຽວຕື່ມໄດ້ທັງສອງຊ່ອງ. */
const TIME_PRESETS: { key: string; startTime: string; endTime: string }[] = [
  { key: 'morning', startTime: '09:00', endTime: '12:00' },
  { key: 'lunch', startTime: '11:00', endTime: '14:00' },
  { key: 'afternoon', startTime: '13:00', endTime: '16:00' },
  { key: 'evening', startTime: '17:00', endTime: '20:00' },
];

const DISCOUNT_PRESETS = [0, 10, 15, 20, 30];
const MULTIPLIER_PRESETS = [0.9, 1, 1.1, 1.25, 1.5];

/** ລາຄາຕົວຢ່າງເມື່ອກົດຄຸມ "ທຸກບໍລິການ" (ບໍ່ມີລາຄາພື້ນຖານດຽວ). */
const SAMPLE_BASE_PRICE = 300_000;

export interface RuleDraft {
  branchId: string;
  serviceId: string;
  ruleName: string;
  /** ຫຼາຍວັນໄດ້ຕອນສ້າງໃໝ່ (1 ວັນ = 1 ກົດ); ຕອນແກ້ໄຂມີໄດ້ວັນດຽວ. */
  days: number[];
  startTime: string;
  endTime: string;
  discountPercent: string;
  priceMultiplier: string;
  isActive: boolean;
}

const emptyDraft = (branchId = ''): RuleDraft => ({
  branchId,
  serviceId: '',
  ruleName: '',
  days: [1],
  startTime: '13:00',
  endTime: '16:00',
  discountPercent: '20',
  priceMultiplier: '1',
  isActive: true,
});

interface ServiceOption {
  id: string;
  name: string;
  branchId?: string | null;
  price?: number;
}

interface PricingRuleDialogProps {
  open: boolean;
  rule: PricingRuleView | null;
  branches: { id: string; name: string }[];
  services: ServiceOption[];
  /** ກົດທີ່ມີຢູ່ແລ້ວ — ໃຊ້ເຕືອນເລື່ອງການຊ້ອນທັບກ່ອນບັນທຶກ. */
  existingRules: PricingRuleView[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (draft: RuleDraft) => void;
}

function SectionHeading({ icon: Icon, children }: { icon: typeof Store; children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'h-8 min-w-[2.5rem] cursor-pointer rounded-full border px-3 text-xs font-medium tabular-nums',
        'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * ຟອມສ້າງ/ແກ້ໄຂກົດລາຄາ — ແບ່ງເປັນ 3 ໜ່ວຍ (ຂອບເຂດ · ຊ່ວງເວລາ · ຜົນຕໍ່ລາຄາ)
 * ພ້ອມ preview ລາຄາສົດ ແລະ ຄຳເຕືອນການຊ້ອນທັບ ກ່ອນກົດບັນທຶກ.
 */
export function PricingRuleDialog({
  open,
  rule,
  branches,
  services,
  existingRules,
  pending,
  onClose,
  onSubmit,
}: PricingRuleDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  const [initedFor, setInitedFor] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sampleBase, setSampleBase] = useState(String(SAMPLE_BASE_PRICE));

  // seed the draft when the dialog opens / target changes
  const targetKey = rule?.id ?? (open ? 'new' : null);
  if (open && targetKey !== initedFor) {
    setInitedFor(targetKey);
    setSubmitted(false);
    setDraft(
      rule
        ? {
            branchId: rule.branchId,
            serviceId: rule.serviceId ?? '',
            ruleName: rule.ruleName,
            days: [rule.dayOfWeek],
            startTime: rule.startTime,
            endTime: rule.endTime,
            discountPercent: String(rule.discountPercent),
            priceMultiplier: String(rule.priceMultiplier),
            isActive: rule.isActive,
          }
        : emptyDraft(branches[0]?.id ?? ''),
    );
  }
  if (!open && initedFor !== null) setInitedFor(null);

  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const branchServices = services.filter((s) => !s.branchId || s.branchId === draft.branchId);
  const selectedService = branchServices.find((s) => s.id === draft.serviceId);

  const numbers = {
    discountPercent: Number(draft.discountPercent) || 0,
    priceMultiplier: Number(draft.priceMultiplier) || 1,
  };
  const effect = ruleEffect(numbers);
  const basePrice = selectedService?.price ?? (Number(sampleBase) || SAMPLE_BASE_PRICE);
  const preview = previewPrice(basePrice, numbers);

  const nameError = !draft.ruleName.trim() ? t('pricing.err.name') : null;
  const timeError = draft.startTime >= draft.endTime ? t('pricing.err.time') : null;
  const daysError = draft.days.length === 0 ? t('pricing.err.days') : null;
  const branchError = !draft.branchId ? t('pricing.err.branch') : null;
  const hasError = Boolean(nameError || timeError || daysError || branchError);

  // ກົດທີ່ຈະຊ້ອນກັບຮ່າງນີ້ (ຂອບເຂດບໍລິການທັບກັນ + ເວລາຕັດກັນ + ເປີດຢູ່ທັງສອງ).
  const overlaps = !timeError
    ? existingRules.filter((r) => {
        if (r.id === rule?.id || !r.isActive || !draft.isActive) return false;
        if (r.branchId !== draft.branchId || !draft.days.includes(r.dayOfWeek)) return false;
        if (r.serviceId && draft.serviceId && r.serviceId !== draft.serviceId) return false;
        return (
          toMinutes(draft.startTime) < toMinutes(r.endTime) && toMinutes(draft.endTime) > toMinutes(r.startTime)
        );
      })
    : [];

  const toggleDay = (d: number) => {
    if (rule) {
      set('days', [d]);
      return;
    }
    set('days', draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? t('pricing.editRule') : t('pricing.newRule')}</DialogTitle>
          <DialogDescription>{t('pricing.formHint')}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (hasError) return;
            onSubmit(draft);
          }}
        >
          {/* ── ຂອບເຂດ ─────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeading icon={Store}>{t('pricing.section.scope')}</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pr-branch">{t('inventory.col.branch')}</Label>
                <Select
                  id="pr-branch"
                  value={draft.branchId}
                  disabled={Boolean(rule)}
                  onChange={(e) => set('branchId', e.target.value)}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                />
                {rule ? <p className="text-2xs text-muted-foreground">{t('pricing.branchLocked')}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-service">{t('pricing.field.service')}</Label>
                <Select
                  id="pr-service"
                  value={draft.serviceId}
                  onChange={(e) => set('serviceId', e.target.value)}
                  options={[
                    { value: '', label: t('pricing.allServices') },
                    ...branchServices.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
                <p className="text-2xs text-muted-foreground">{t('pricing.serviceHint')}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-name">{t('pricing.field.name')}</Label>
              <Input
                id="pr-name"
                value={draft.ruleName}
                onChange={(e) => set('ruleName', e.target.value)}
                placeholder={t('pricing.namePlaceholder')}
                aria-invalid={submitted && Boolean(nameError)}
                aria-describedby={submitted && nameError ? 'pr-name-err' : undefined}
              />
              {submitted && nameError ? (
                <p id="pr-name-err" role="alert" className="text-xs text-destructive">
                  {nameError}
                </p>
              ) : null}
            </div>
          </section>

          {/* ── ຊ່ວງເວລາ ───────────────────────────── */}
          <section className="space-y-3 border-t border-border pt-4">
            <SectionHeading icon={CalendarRange}>{t('pricing.section.schedule')}</SectionHeading>
            <div className="space-y-1.5">
              <Label>{rule ? t('pricing.field.day') : t('pricing.field.days')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {DOW.map((d) => (
                  <Chip
                    key={d}
                    active={draft.days.includes(d)}
                    onClick={() => toggleDay(d)}
                    label={t(`pricing.dow.${d}`)}
                  >
                    {t(`pricing.dowShort.${d}`)}
                  </Chip>
                ))}
              </div>
              {!rule ? (
                <p className="text-2xs text-muted-foreground">
                  {t('pricing.daysHint', { count: draft.days.length })}
                </p>
              ) : null}
              {submitted && daysError ? (
                <p role="alert" className="text-xs text-destructive">
                  {daysError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="pr-start">{t('pricing.field.start')}</Label>
                <Input
                  id="pr-start"
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => set('startTime', e.target.value)}
                  aria-invalid={Boolean(timeError)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-end">{t('pricing.field.end')}</Label>
                <Input
                  id="pr-end"
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                  aria-invalid={Boolean(timeError)}
                  aria-describedby={timeError ? 'pr-time-err' : undefined}
                />
              </div>
              <p className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {timeError
                  ? '—'
                  : t('pricing.durationHint', {
                      hours: ((toMinutes(draft.endTime) - toMinutes(draft.startTime)) / 60).toFixed(1),
                    })}
              </p>
            </div>
            {timeError ? (
              <p id="pr-time-err" role="alert" className="text-xs text-destructive">
                {timeError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map((p) => (
                <Chip
                  key={p.key}
                  active={draft.startTime === p.startTime && draft.endTime === p.endTime}
                  onClick={() => setDraft((d) => ({ ...d, startTime: p.startTime, endTime: p.endTime }))}
                >
                  {t(`pricing.preset.${p.key}`)}
                </Chip>
              ))}
            </div>
          </section>

          {/* ── ຜົນຕໍ່ລາຄາ ──────────────────────────── */}
          <section className="space-y-3 border-t border-border pt-4">
            <SectionHeading icon={Percent}>{t('pricing.section.effect')}</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pr-discount">{t('pricing.field.discount')}</Label>
                <Input
                  id="pr-discount"
                  type="number"
                  min="0"
                  max="90"
                  value={draft.discountPercent}
                  onChange={(e) => set('discountPercent', e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {DISCOUNT_PRESETS.map((d) => (
                    <Chip
                      key={d}
                      active={numbers.discountPercent === d}
                      onClick={() => set('discountPercent', String(d))}
                    >
                      {d}%
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-multiplier">{t('pricing.field.multiplier')}</Label>
                <Input
                  id="pr-multiplier"
                  type="number"
                  min="0.1"
                  max="3"
                  step="0.05"
                  value={draft.priceMultiplier}
                  onChange={(e) => set('priceMultiplier', e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {MULTIPLIER_PRESETS.map((m) => (
                    <Chip
                      key={m}
                      active={numbers.priceMultiplier === m}
                      onClick={() => set('priceMultiplier', String(m))}
                    >
                      ×{m}
                    </Chip>
                  ))}
                </div>
                <p className="text-2xs text-muted-foreground">{t('pricing.multiplierHint')}</p>
              </div>
            </div>

            {/* live preview */}
            <div
              className={cn(
                'rounded-lg border p-3',
                effect.kind === 'discount'
                  ? 'border-success/40 bg-success-soft/50'
                  : effect.kind === 'surge'
                    ? 'border-warning/40 bg-warning-soft/50'
                    : 'border-border bg-muted/40',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  {effect.kind === 'surge' ? (
                    <TrendingUp className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  ) : (
                    <TrendingDown
                      className={cn(
                        'h-4 w-4 shrink-0',
                        effect.kind === 'discount' ? 'text-success' : 'text-muted-foreground',
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{t('pricing.preview.title')}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {selectedService ? selectedService.name : t('pricing.preview.sample')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-sm text-muted-foreground line-through">
                    <CurrencyText amount={preview.base} />
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="text-base font-semibold">
                    <CurrencyText amount={preview.final} />
                  </span>
                  <Badge
                    variant={effect.kind === 'discount' ? 'success' : effect.kind === 'surge' ? 'warning' : 'neutral'}
                  >
                    {effect.kind === 'flat'
                      ? t('pricing.effect.none')
                      : `${effect.netPercent > 0 ? '−' : '+'}${Math.abs(effect.netPercent)}%`}
                  </Badge>
                </div>
              </div>

              {!selectedService ? (
                <div className="mt-2 flex items-center gap-2">
                  <Label htmlFor="pr-sample" className="text-2xs text-muted-foreground">
                    {t('pricing.preview.baseLabel')}
                  </Label>
                  <Input
                    id="pr-sample"
                    type="number"
                    min="0"
                    step="1000"
                    value={sampleBase}
                    onChange={(e) => setSampleBase(e.target.value)}
                    className="h-8 w-36 text-sm"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('pricing.field.active')}</p>
                <p className="text-2xs text-muted-foreground">{t('pricing.activeHint')}</p>
              </div>
              <Switch
                checked={draft.isActive}
                onCheckedChange={(v) => set('isActive', v)}
                aria-label={t('pricing.field.active')}
              />
            </div>

            {overlaps.length > 0 ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-soft/60 px-3 py-2.5"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    {t('pricing.overlapWarn', { count: overlaps.length })}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {overlaps
                      .slice(0, 3)
                      .map((r) => `${r.ruleName} (${r.startTime}–${r.endTime})`)
                      .join(' · ')}
                  </p>
                  <p className="text-2xs text-muted-foreground">{t('pricing.overlapHint')}</p>
                </div>
              </div>
            ) : null}
          </section>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending || (submitted && hasError)}>
              {rule ? t('common.save') : t('pricing.createCount', { count: draft.days.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
