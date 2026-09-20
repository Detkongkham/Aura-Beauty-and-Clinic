import { CalendarClock, Scissors, UserRound, Users, type LucideIcon } from 'lucide-react';

import { appointmentsApi } from '@/features/appointments/appointments.api';
import { customersApi } from '@/features/customers/customers.api';
import { servicesApi } from '@/features/services/services.api';
import { staffApi } from '@/features/staff/staff.api';
import { formatDate, formatDateTime } from '@/lib/format';

export type CsvValue = string | number;

export interface ExportField<Row> {
  key: string;
  /** i18n key under `importExport.field.<datasetId>.<key>`. */
  labelKey: string;
  pick: (row: Row) => CsvValue;
  /** Included in the default selection. */
  default?: boolean;
}

export interface ExportDataset<Row = Record<string, unknown>> {
  id: string;
  icon: LucideIcon;
  fields: ExportField<Row>[];
  /** Pull every page from the paginated list endpoint. `onProgress` reports 0..1. */
  fetchAll: (onProgress?: (loaded: number, total: number) => void) => Promise<Row[]>;
}

const PAGE = 100;

async function pageAll<Row>(
  fetchPage: (page: number) => Promise<{ items: Row[]; total: number }>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Row[]> {
  const first = await fetchPage(1);
  const out = [...first.items];
  onProgress?.(out.length, first.total);
  const pages = Math.ceil(first.total / PAGE);
  for (let p = 2; p <= pages; p += 1) {
    const next = await fetchPage(p);
    out.push(...next.items);
    onProgress?.(out.length, first.total);
  }
  return out;
}

type CustomerRow = Awaited<ReturnType<typeof customersApi.list>>['items'][number];
type ServiceRow = Awaited<ReturnType<typeof servicesApi.list>>['items'][number];
type StaffRow = Awaited<ReturnType<typeof staffApi.list>>['items'][number];
type AppointmentRow = Awaited<ReturnType<typeof appointmentsApi.list>>['items'][number];

const customers: ExportDataset<CustomerRow> = {
  id: 'customers',
  icon: Users,
  fields: [
    { key: 'name', labelKey: 'name', pick: (r) => r.name, default: true },
    { key: 'phone', labelKey: 'phone', pick: (r) => r.phone, default: true },
    { key: 'email', labelKey: 'email', pick: (r) => r.email ?? '', default: true },
    { key: 'gender', labelKey: 'gender', pick: (r) => r.gender ?? '' },
    { key: 'birthDate', labelKey: 'birthDate', pick: (r) => (r.birthDate ? formatDate(r.birthDate) : '') },
    { key: 'tier', labelKey: 'tier', pick: (r) => r.loyaltyTier ?? '', default: true },
    { key: 'loyaltyPoints', labelKey: 'loyaltyPoints', pick: (r) => r.loyaltyPoints },
    { key: 'totalVisits', labelKey: 'totalVisits', pick: (r) => r.totalVisits, default: true },
    { key: 'totalSpent', labelKey: 'totalSpent', pick: (r) => r.totalSpent, default: true },
    { key: 'lastVisitAt', labelKey: 'lastVisitAt', pick: (r) => (r.lastVisitAt ? formatDate(r.lastVisitAt) : '') },
    { key: 'notes', labelKey: 'notes', pick: (r) => r.notes ?? '' },
    { key: 'createdAt', labelKey: 'createdAt', pick: (r) => formatDate(r.createdAt) },
  ],
  fetchAll: (onProgress) =>
    pageAll(
      (page) => customersApi.list({ page, pageSize: PAGE }),
      onProgress,
    ),
};

const services: ExportDataset<ServiceRow> = {
  id: 'services',
  icon: Scissors,
  fields: [
    { key: 'name', labelKey: 'name', pick: (r) => r.name, default: true },
    { key: 'category', labelKey: 'category', pick: (r) => r.categoryName, default: true },
    { key: 'price', labelKey: 'price', pick: (r) => r.price, default: true },
    { key: 'durationMinutes', labelKey: 'durationMinutes', pick: (r) => r.durationMinutes, default: true },
    { key: 'requireDeposit', labelKey: 'requireDeposit', pick: (r) => (r.requireDeposit ? 'yes' : 'no') },
    { key: 'depositAmount', labelKey: 'depositAmount', pick: (r) => r.depositAmount ?? '' },
    { key: 'isActive', labelKey: 'isActive', pick: (r) => (r.isActive ? 'active' : 'inactive'), default: true },
    { key: 'description', labelKey: 'description', pick: (r) => r.description ?? '' },
  ],
  fetchAll: (onProgress) =>
    pageAll((page) => servicesApi.list({ page, pageSize: PAGE }), onProgress),
};

const staff: ExportDataset<StaffRow> = {
  id: 'staff',
  icon: UserRound,
  fields: [
    { key: 'name', labelKey: 'name', pick: (r) => r.name, default: true },
    { key: 'jobTitle', labelKey: 'jobTitle', pick: (r) => r.jobTitle, default: true },
    { key: 'phone', labelKey: 'phone', pick: (r) => r.phone, default: true },
    { key: 'email', labelKey: 'email', pick: (r) => r.email ?? '', default: true },
    { key: 'branch', labelKey: 'branch', pick: (r) => r.branchName, default: true },
    { key: 'commissionRate', labelKey: 'commissionRate', pick: (r) => `${Math.round(r.commissionRate * 100)}%` },
    { key: 'isActive', labelKey: 'isActive', pick: (r) => (r.isActive ? 'active' : 'inactive'), default: true },
    { key: 'hiredAt', labelKey: 'hiredAt', pick: (r) => formatDate(r.hiredAt) },
  ],
  fetchAll: (onProgress) =>
    pageAll((page) => staffApi.list({ page, pageSize: PAGE }), onProgress),
};

const appointments: ExportDataset<AppointmentRow> = {
  id: 'appointments',
  icon: CalendarClock,
  fields: [
    { key: 'code', labelKey: 'code', pick: (r) => r.code, default: true },
    { key: 'startAt', labelKey: 'startAt', pick: (r) => formatDateTime(r.startAt), default: true },
    { key: 'customerName', labelKey: 'customerName', pick: (r) => r.customerName, default: true },
    { key: 'customerPhone', labelKey: 'customerPhone', pick: (r) => r.customerPhone },
    { key: 'serviceName', labelKey: 'serviceName', pick: (r) => r.serviceName, default: true },
    { key: 'staffName', labelKey: 'staffName', pick: (r) => r.staffName, default: true },
    { key: 'branchName', labelKey: 'branchName', pick: (r) => r.branchName },
    { key: 'status', labelKey: 'status', pick: (r) => r.status, default: true },
    { key: 'price', labelKey: 'price', pick: (r) => r.price, default: true },
    { key: 'depositPaid', labelKey: 'depositPaid', pick: (r) => r.depositPaid },
    { key: 'isWalkIn', labelKey: 'isWalkIn', pick: (r) => (r.isWalkIn ? 'yes' : 'no') },
  ],
  fetchAll: (onProgress) =>
    pageAll((page) => appointmentsApi.list({ page, pageSize: PAGE }), onProgress),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EXPORT_DATASETS: ExportDataset<any>[] = [customers, services, staff, appointments];

export function getExportDataset(id: string) {
  return EXPORT_DATASETS.find((d) => d.id === id) ?? EXPORT_DATASETS[0]!;
}
