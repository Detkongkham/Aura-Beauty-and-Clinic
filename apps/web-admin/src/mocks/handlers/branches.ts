import { http } from 'msw';

import type { Branch } from '@/types/models';

import { db, newId } from '../fixtures/store';
import { api, delay, fail, ok } from '../helpers';

export const branchHandlers = [
  http.get(api('/branches'), async () => {
    await delay(120);
    return ok({ items: db.branches });
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
