import { zodResolver } from '@hookform/resolvers/zod';
import { Crown, Loader2, MapPin, Scissors, TicketPlus, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useBranches } from '@/features/branches/branches.api';
import { useServices } from '@/features/services/services.api';
import { useStaffList } from '@/features/staff/staff.api';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useCreateWalkIn } from './queue.api';

const schema = z.object({
  branchId: z.string().uuid('ເລືອກສາຂາ'),
  customerName: z.string().trim().min(1, 'ກະລຸນາໃສ່ຊື່ລູກຄ້າ'),
  customerPhone: z.string().trim().optional(),
  serviceId: z.string().uuid('ເລືອກບໍລິການ'),
  staffId: z.string().optional(),
  vip: z.boolean(),
  note: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultBranchId?: string;
}

/** Labelled field with required marker + inline error / helper wiring. */
function Field({
  id,
  label,
  required,
  error,
  hint,
  hideLabel,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn('flex items-center gap-1', hideLabel && 'sr-only')}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof MapPin;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function WalkInSheet({ open, onOpenChange, defaultBranchId }: Props) {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const { data: servicesPage } = useServices({ page: 1, pageSize: 100, isActive: 'true' });
  const create = useCreateWalkIn();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      branchId: defaultBranchId ?? '',
      customerName: '',
      customerPhone: '',
      serviceId: '',
      staffId: '',
      vip: false,
      note: '',
    },
  });

  const branchId = form.watch('branchId');
  const { data: staffPage } = useStaffList({
    page: 1,
    pageSize: 100,
    branchId: branchId || undefined,
  });

  useEffect(() => {
    if (open)
      form.reset({
        branchId: defaultBranchId ?? '',
        customerName: '',
        customerPhone: '',
        serviceId: '',
        staffId: '',
        vip: false,
        note: '',
      });
  }, [open, defaultBranchId, form]);

  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        branchId: values.branchId,
        customerName: values.customerName,
        serviceId: values.serviceId,
        staffId: values.staffId || undefined,
        customerPhone: values.customerPhone || undefined,
        priority: values.vip ? 'VIP' : 'NORMAL',
        note: values.note?.trim() || undefined,
      },
      {
        onSuccess: ({ ticket }) => {
          toast.success(t('walkIn.issued', { number: ticket.number }));
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('services.saveError')),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border p-6 pb-4 pr-10">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TicketPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{t('walkIn.title')}</DialogTitle>
              <DialogDescription>{t('walkIn.subtitle')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <Section icon={MapPin} title={t('nav.branches')}>
              <Field
                id="wi-branch"
                label={t('nav.branches')}
                required
                hideLabel
                error={errors.branchId?.message}
              >
                <Select
                  id="wi-branch"
                  {...form.register('branchId')}
                  aria-invalid={!!errors.branchId}
                  aria-describedby={errors.branchId ? 'wi-branch-error' : undefined}
                  placeholder={t('walkIn.pickBranch')}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Field>
            </Section>

            <Section icon={UserRound} title={t('walkIn.sectionCustomer')}>
              <Field
                id="wi-name"
                label={t('walkIn.customerName')}
                required
                error={errors.customerName?.message}
              >
                <Input
                  id="wi-name"
                  autoComplete="name"
                  {...form.register('customerName')}
                  aria-invalid={!!errors.customerName}
                  aria-describedby={errors.customerName ? 'wi-name-error' : undefined}
                />
              </Field>
              <Field id="wi-phone" label={t('auth.phone')} hint={t('walkIn.phoneHint')}>
                <Input
                  id="wi-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-describedby="wi-phone-hint"
                  {...form.register('customerPhone')}
                />
              </Field>
            </Section>

            <Section icon={Scissors} title={t('walkIn.sectionService')}>
              <Field
                id="wi-service"
                label={t('appointments.service')}
                required
                error={errors.serviceId?.message}
              >
                <Select
                  id="wi-service"
                  {...form.register('serviceId')}
                  aria-invalid={!!errors.serviceId}
                  aria-describedby={errors.serviceId ? 'wi-service-error' : undefined}
                  placeholder={t('walkIn.pickService')}
                  options={(servicesPage?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Field id="wi-staff" label={t('appointments.staff')} hint={t('walkIn.staffHint')}>
                <Select
                  id="wi-staff"
                  {...form.register('staffId')}
                  aria-describedby="wi-staff-hint"
                  placeholder={t('walkIn.anyStaff')}
                  options={(staffPage?.items ?? [])
                    .filter((s) => s.isActive)
                    .map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
            </Section>

            <Section icon={Crown} title={t('walkIn.sectionExtras')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t('queue.vipPriority')}</p>
                  <p className="text-xs text-muted-foreground">{t('queue.vipPriorityHint')}</p>
                </div>
                <Switch
                  checked={form.watch('vip')}
                  onCheckedChange={(v) => form.setValue('vip', v)}
                  aria-label={t('queue.vipPriority')}
                />
              </div>
              <Field id="wi-note" label={t('queue.note')} hint={t('walkIn.noteHint')}>
                <Textarea
                  id="wi-note"
                  rows={2}
                  maxLength={500}
                  placeholder={t('queue.notePlaceholder')}
                  aria-describedby="wi-note-hint"
                  {...form.register('note')}
                />
              </Field>
            </Section>
          </div>

          <DialogFooter className="border-t border-border p-6 pt-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              <span className={cn(create.isPending && 'animate-spin motion-reduce:animate-none')}>
                {create.isPending ? (
                  <Loader2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <TicketPlus className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              {create.isPending ? t('common.loading') : t('walkIn.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
