import { http } from 'msw';

import type { Customer } from '@/types/models';

import { db, newId } from '../fixtures/store';
import { api, delay, fail, ok, paginated } from '../helpers';

function num(v: string | null, dflt: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

export const customerHandlers = [
  http.get(api('/customers'), async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const tier = url.searchParams.get('tier');
    const page = num(url.searchParams.get('page'), 1);
    const pageSize = num(url.searchParams.get('pageSize'), 25);

    let rows = [...db.customers];
    if (q) {
      rows = rows.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
      );
    }
    if (tier) rows = rows.filter((c) => c.loyaltyTier === tier);
    rows.sort((a, b) => (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? ''));
    return paginated(rows, page, pageSize);
  }),

  http.get(api('/customers/:id'), async ({ params }) => {
    await delay(120);
    const c = db.customers.find((x) => x.id === params.id);
    if (!c) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບລູກຄ້າ');
    const history = db.appointments
      .filter((a) => a.customerId === c.id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
      .slice(0, 20);
    return ok({ ...c, history });
  }),

  http.post(api('/customers'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<Customer>;
    if (!body.name?.trim() || !body.phone?.trim()) {
      return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ຊື່ ແລະ ເບີໂທ');
    }
    const c: Customer = {
      id: newId('cus'),
      name: body.name.trim(),
      phone: body.phone.trim(),
      email: body.email ?? null,
      gender: body.gender ?? null,
      birthDate: body.birthDate ?? null,
      loyaltyPoints: 0,
      loyaltyTier: null,
      totalVisits: 0,
      totalSpent: 0,
      lastVisitAt: null,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    db.customers.push(c);
    return ok(c, { status: 201 });
  }),

  http.patch(api('/customers/:id'), async ({ params, request }) => {
    await delay();
    const idx = db.customers.findIndex((c) => c.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບລູກຄ້າ');
    const body = (await request.json().catch(() => ({}))) as Partial<Customer>;
    db.customers[idx] = { ...db.customers[idx]!, ...body };
    return ok(db.customers[idx]);
  }),
];
