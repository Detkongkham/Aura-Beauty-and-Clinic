import type { BranchInsight } from '@abcp/shared-types';
import { http } from 'msw';

import type { Branch } from '@/types/models';

import { db, newId } from '../fixtures/store';
import { api, delay, fail, ok } from '../helpers';

export const branchHandlers = [
  http.get(api('/branches'), async () => {
    await delay(120);
    return ok({ items: db.branches });
  }),

  // Deterministic per-branch metrics (seeded by the branch index) so the console has something to show.
  http.get(api('/branches/insights'), async ({ request }) => {
    await delay(150);
    const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    const items: BranchInsight[] = db.branches.map((b, n) => {
      const scale = b.isActive ? 1 + ((n * 7) % 5) / 4 : 0;
      const daily = Array.from({ length: days }, (_, d) => Math.round(scale * (900_000 + ((d * 37 + n * 11) % 13) * 150_000)));
      const revenue = daily.reduce((s, v) => s + v, 0);
      const bookings = Math.round(scale * days * 6);
      return {
        branchId: b.id,
        staffCount: b.isActive ? 4 + (n % 4) : 0,
        roomCount: 3 + (n % 3),
        roomsAvailable: 2 + (n % 3),
        equipmentCount: 2 + (n % 2),
        serviceCount: 12,
        today: {
          appointments: Math.round(scale * 8),
          completed: Math.round(scale * 3),
          inProgress: Math.round(scale * 2),
          upcoming: Math.round(scale * 3),
          revenue: Math.round(scale * 1_200_000),
          queueWaiting: n % 3 === 0 ? 6 : 1,
          utilization: b.isActive ? 0.45 + (n % 4) * 0.12 : null,
        },
        period: {
          bookings,
          completed: Math.round(bookings * 0.8),
          cancelled: Math.round(bookings * 0.08),
          noShow: Math.round(bookings * 0.04),
          revenue,
          revenuePrev: Math.round(revenue * (0.85 + (n % 3) * 0.1)),
          bookingsPrev: Math.round(bookings * 0.95),
          avgTicket: bookings ? Math.round(revenue / Math.max(1, Math.round(bookings * 0.8))) : 0,
          customers: Math.round(bookings * 0.7),
          utilization: b.isActive ? 0.5 + (n % 4) * 0.1 : null,
          daily,
        },
        rating: { avg: b.isActive ? 4.2 + (n % 5) / 10 : null, count: b.isActive ? 20 + n : 0 },
        upcomingAppointments: b.isActive ? 12 : n % 2 ? 2 : 0,
        lowStock: n % 2,
        outstandingBills: n % 3 === 1 ? 2 : 0,
        outstandingAmount: n % 3 === 1 ? 850_000 : 0,
        closures: [],
      };
    });
    return ok({
      days,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      generatedAt: to.toISOString(),
      items,
    });
  }),

  http.post(api('/branches'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<Branch>;
    if (!body.name?.trim() || !body.code?.trim()) {
      return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ຊື່ ແລະ ລະຫັດສາຂາ');
    }
    const branch: Branch = {
      id: newId('br'),
      name: body.name.trim(),
      code: body.code.trim(),
      address: body.address ?? '',
      phone: body.phone ?? '',
      province: body.province ?? 'vientiane-capital',
      latitude: body.latitude ?? 0,
      longitude: body.longitude ?? 0,
      timezone: 'Asia/Vientiane',
      isActive: body.isActive ?? true,
      allowNegativeStock: body.allowNegativeStock ?? false,
      openTime: body.openTime ?? '09:00',
      closeTime: body.closeTime ?? '20:00',
    };
    db.branches.push(branch);
    return ok(branch, { status: 201 });
  }),

  http.patch(api('/branches/:id'), async ({ params, request }) => {
    await delay();
    const idx = db.branches.findIndex((b) => b.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບສາຂາ');
    const body = (await request.json().catch(() => ({}))) as Partial<Branch>;
    db.branches[idx] = { ...db.branches[idx]!, ...body };
    return ok(db.branches[idx]);
  }),
];
