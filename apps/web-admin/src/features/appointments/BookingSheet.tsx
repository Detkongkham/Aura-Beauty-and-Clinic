import { AlertTriangle, CalendarClock, Check, Loader2, Search, User } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/DateField';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Select } from '@/components/ui/select';
import { useEquipmentList, useRooms } from '@/features/resources/resources.api';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useBranches } from '@/features/branches/branches.api';
import { useCustomers } from '@/features/customers/customers.api';
import { useServices } from '@/features/services/services.api';
import { useStaffList } from '@/features/staff/staff.api';
import { useDebounce } from '@/hooks/useDebounce';
import { dayjs, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import type { AppointmentListItem } from '@/types/models';

import { useAvailability, useCreateAppointment, useRescheduleAppointment } from './booking.api';
import { formatDuration } from './appointments.lib';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present = reschedule that appointment; absent = create a new one. */
  appointment?: AppointmentListItem | null;
  defaultBranchId?: string;
  onDone?: (appointmentId: string) => void;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium">
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="text-2xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * Create or move a booking, on the customer's behalf, without leaving the console.
 *
 * Both flows share one sheet because they are the same decision — *who, what,
 * with whom, when* — and only differ in which fields are already answered. The
 * time is never a free-text field: it is always picked from
 * `GET /booking/availability`, so the desk cannot invent a slot the engine would
 * refuse a second later.
 *
 * Reschedule additionally offers **force**, but only after the server has said
 * no: the clash is surfaced first, and overriding it is a separate, deliberate
 * second click rather than a checkbox nobody reads.
 */
export function BookingSheet({ open, onOpenChange, appointment, defaultBranchId, onDone }: Props) {
  const { t } = useTranslation();
  const isReschedule = Boolean(appointment);

  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [slotStaffId, setSlotStaffId] = useState('');
  const [notes, setNotes] = useState('');
  const [roomId, setRoomId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  /** Set once the server has rejected the chosen slot as a clash. */
  const [clash, setClash] = useState(false);

  // Reset to a clean, pre-filled state every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setBranchId(appointment?.branchId ?? defaultBranchId ?? '');
    setCustomerId(appointment?.customerId ?? '');
    setCustomerQuery('');
    setServiceId(appointment?.serviceId ?? '');
    setStaffId(appointment?.staffId ?? '');
    setDate(appointment ? dayjs(appointment.startAt).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
    setSlotStart('');
    setSlotStaffId('');
    setNotes('');
    setRoomId('');
    setEquipmentId('');
    setClash(false);
  }, [open, appointment, defaultBranchId]);

  // Rooms/equipment belong to one branch — a branch change invalidates the pick.
  useEffect(() => {
    setRoomId('');
    setEquipmentId('');
  }, [branchId]);

  const debouncedCustomer = useDebounce(customerQuery, 300);
  const { data: branches = [] } = useBranches();
  const { data: servicesPage } = useServices({ page: 1, pageSize: 100, isActive: 'true' });
  const { data: staffPage } = useStaffList({ page: 1, pageSize: 100 });
  const { data: rooms = [] } = useRooms({ branchId: branchId || undefined });
  const { data: equipment = [] } = useEquipmentList({ branchId: branchId || undefined });
  const openRooms = rooms.filter((r) => r.isAvailable && r.branchId === branchId);
  const openEquipment = equipment.filter((e) => e.isAvailable && e.branchId === branchId);
  const { data: customersPage, isFetching: customersLoading } = useCustomers({
    page: 1,
    pageSize: 20,
    q: debouncedCustomer || undefined,
  });

  const availability = useAvailability({
    branchId: branchId || undefined,
    serviceId: serviceId || undefined,
    date: date || undefined,
    staffProfileId: staffId || undefined,
  });

  const create = useCreateAppointment();
  const reschedule = useRescheduleAppointment();
  const pending = create.isPending || reschedule.isPending;

  const service = servicesPage?.items.find((s) => s.id === serviceId);
  const slots = availability.data?.slots ?? [];

  const customerOptions = useMemo(
    () =>
      (customersPage?.items ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        description: c.phone,
      })),
    [customersPage],
  );

  // A chosen slot stops being valid the moment the inputs behind it change.
  useEffect(() => {
    setSlotStart('');
    setSlotStaffId('');
    setClash(false);
  }, [branchId, serviceId, staffId, date]);

  const canSubmit =
    Boolean(slotStart) && (isReschedule || Boolean(branchId && customerId && serviceId));

  const submit = () => {
    if (!canSubmit) return;
    if (isReschedule && appointment) {
      reschedule.mutate(
        {
          id: appointment.id,
          startAt: slotStart,
          ...(slotStaffId && slotStaffId !== appointment.staffId ? { staffProfileId: slotStaffId } : {}),
          ...(clash ? { force: true } : {}),
        },
        {
          onSuccess: (res) => {
            toast.success(t('appointments.rescheduled'));
            onOpenChange(false);
            onDone?.(res.id);
          },
          onError: (err) => {
            if (err instanceof NormalizedApiError && err.status === 409) {
              setClash(true);
              toast.error(t('appointments.slotTaken'));
            } else {
              toast.error(t('services.saveError'));
            }
          },
        },
      );
      return;
    }

    create.mutate(
      {
        branchId,
        customerId,
        serviceId,
        staffProfileId: slotStaffId || staffId || undefined,
        startAt: slotStart,
        ...(notes.trim() ? { customerNotes: notes.trim() } : {}),
        ...(roomId ? { roomId } : {}),
        ...(equipmentId ? { equipmentId } : {}),
      },
      {
        onSuccess: (res) => {
          toast.success(t('appointments.created'));
          onOpenChange(false);
          onDone?.(res.id);
        },
        onError: (err) => {
          if (err instanceof NormalizedApiError && err.status === 409 && !roomId && !equipmentId) {
            toast.error(t('appointments.slotTaken'));
          } else if (err instanceof NormalizedApiError && err.message) {
            toast.error(err.message);
          } else {
            toast.error(t('services.saveError'));
          }
        },
      },
    );
  };

  const staffOptions = (staffPage?.items ?? []).filter((s) => !branchId || s.branchId === branchId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[560px]" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>
            {isReschedule ? t('appointments.rescheduleTitle') : t('appointments.newAppointment')}
          </SheetTitle>
          <SheetDescription>
            {isReschedule && appointment
              ? t('appointments.rescheduleBody', { name: appointment.customerName })
              : t('appointments.newAppointmentBody')}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4 py-4">
          {isReschedule && appointment ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <PersonAvatar name={appointment.customerName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{appointment.customerName}</p>
                <p className="truncate text-2xs text-muted-foreground">
                  {appointment.serviceName} · {formatDuration(appointment.durationMin)}
                </p>
              </div>
              <div className="shrink-0 text-right text-2xs text-muted-foreground">
                <p>{t('appointments.currentSlot')}</p>
                <p className="font-medium tabular-nums text-foreground">
                  <DateTimeText value={appointment.startAt} mode="datetime" />
                </p>
              </div>
            </div>
          ) : (
            <>
              <Field label={t('branch.title')} required>
                <Select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  placeholder={t('appointments.pickBranch')}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Field>

              <Field
                label={t('appointments.customer')}
                required
                hint={
                  <span className="inline-flex items-center gap-1">
                    <Search className="h-3 w-3" aria-hidden="true" />
                    {customersLoading ? t('common.loading') : t('appointments.customerSearchHint')}
                  </span>
                }
              >
                <Combobox
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerOptions}
                  placeholder={t('appointments.pickCustomer')}
                  searchPlaceholder={t('appointments.searchPlaceholder')}
                  emptyText={t('appointments.noCustomers')}
                  aria-label={t('appointments.customer')}
                />
              </Field>

              <Field label={t('appointments.service')} required>
                <Combobox
                  value={serviceId}
                  onChange={setServiceId}
                  options={(servicesPage?.items ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                    description: `${formatDuration(s.durationMinutes)} · ${formatCurrency(s.price)}`,
                  }))}
                  placeholder={t('appointments.pickService')}
                  searchPlaceholder={t('appointments.searchPlaceholder')}
                  emptyText={t('appointments.empty')}
                  aria-label={t('appointments.service')}
                />
              </Field>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('appointments.staff')} hint={t('appointments.anyStaffHint')}>
              <Select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder={t('appointments.anyStaff')}
                options={staffOptions.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>
            <Field label={t('appointments.when')} required>
              <DateField
                value={date}
                onChange={setDate}
                aria-label={t('appointments.when')}
                className="w-full"
              />
            </Field>
          </div>

          {/* slot picker */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {t('appointments.pickSlot')}
              {service ? (
                <span className="text-2xs font-normal text-muted-foreground">
                  · {formatDuration(service.durationMinutes)}
                </span>
              ) : null}
            </p>

            {!branchId || !serviceId || !date ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-2xs text-muted-foreground">
                {t('appointments.slotPrereq')}
              </p>
            ) : availability.isLoading ? (
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-8 rounded-md" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-2xs text-muted-foreground">
                {t('appointments.noSlots')}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {slots.map((s) => {
                  const active = slotStart === s.startAt;
                  return (
                    <button
                      key={`${s.startAt}-${s.staffProfileId}`}
                      type="button"
                      onClick={() => {
                        setSlotStart(s.startAt);
                        setSlotStaffId(s.staffProfileId);
                        setClash(false);
                      }}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex h-8 items-center justify-center rounded-md border text-2xs font-medium tabular-nums',
                        'transition-colors duration-150 ease-out motion-reduce:transition-none',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-muted',
                      )}
                    >
                      <DateTimeText value={s.startAt} mode="time" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!isReschedule && branchId && (openRooms.length > 0 || openEquipment.length > 0) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {openRooms.length > 0 ? (
                <Field label={t('appointments.room')}>
                  <Select
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder={t('appointments.noRoom')}
                    options={openRooms.map((r) => ({ value: r.id, label: r.name }))}
                  />
                </Field>
              ) : null}
              {openEquipment.length > 0 ? (
                <Field label={t('appointments.equipment')}>
                  <Select
                    value={equipmentId}
                    onChange={(e) => setEquipmentId(e.target.value)}
                    placeholder={t('appointments.noEquipment')}
                    options={openEquipment.map((x) => ({ value: x.id, label: `${x.name} · ${x.code}` }))}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {!isReschedule ? (
            <Field label={t('appointments.customerNotes')}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={t('appointments.notesPlaceholder')}
              />
            </Field>
          ) : null}

          {clash ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 text-2xs">
                <p className="font-semibold text-warning">{t('appointments.slotTaken')}</p>
                <p className="mt-0.5 text-muted-foreground">{t('appointments.forceHint')}</p>
              </div>
            </div>
          ) : null}
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || pending}
            variant={clash ? 'secondary' : 'primary'}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : clash ? (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {clash
              ? t('appointments.forceAnyway')
              : isReschedule
                ? t('appointments.confirmReschedule')
                : t('appointments.confirmBooking')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Small inline trigger used by the detail page header. */
export function BookingTriggerIcon() {
  return <User className="h-4 w-4" aria-hidden="true" />;
}
