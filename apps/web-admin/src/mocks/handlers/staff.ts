import { http } from 'msw';

import type { StaffProfile } from '@/types/models';

import { db } from '../fixtures/store';
import { api, delay, fail, ok, paginated } from '../helpers';

function num(v: string | null, dflt: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

export const staffHandlers = [
  http.get(api('/staff'), async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const branchId = url.searchParams.get('branchId');
    const page = num(url.searchParams.get('page'), 1);
    const pageSize = num(url.searchParams.get('pageSize'), 25);

    let rows = [...db.staff];
    if (q) rows = rows.filter((s) => s.name.toLowerCase().includes(q));
    if (branchId && branchId !== 'all') rows = rows.filter((s) => s.branchId === branchId);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return paginated(rows, page, pageSize);
  }),

  http.get(api('/staff/time-off'), async () => {
    await delay(150);
    return ok({ items: db.timeOff });
  }),

  http.patch(api('/staff/time-off/:id'), async ({ params, request }) => {
    await delay();
    const req = db.timeOff.find((t) => t.id === params.id);
    if (!req) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບຄຳຮ້ອງ');
    const body = (await request.json().catch(() => ({}))) as { status?: 'APPROVED' | 'REJECTED' };
    if (body.status) req.status = body.status;
    return ok(req);
  }),

  http.get(api('/staff/:id'), async ({ params }) => {
    await delay(120);
    const s = db.staff.find((x) => x.id === params.id);
    return s ? ok(s) : fail(404, 'NOT_FOUND', 'ບໍ່ພົບພະນັກງານ');
  }),

  http.patch(api('/staff/:id'), async ({ params, request }) => {
    await delay();
    const idx = db.staff.findIndex((s) => s.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບພະນັກງານ');
    const body = (await request.json().catch(() => ({}))) as Partial<StaffProfile>;
    db.staff[idx] = { ...db.staff[idx]!, ...body };
    return ok(db.staff[idx]);
  }),
];
