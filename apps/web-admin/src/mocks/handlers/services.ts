import { http } from 'msw';

import type { Service } from '@/types/models';

import { db, newId } from '../fixtures/store';
import { api, delay, fail, ok, paginated } from '../helpers';

function num(v: string | null, dflt: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

export const serviceHandlers = [
  // No object storage in mock mode — hand the uploaded image back as a data URL.
  http.post(api('/services/images'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as { contentType?: string; dataBase64?: string };
    if (!body.contentType || !body.dataBase64) return fail(400, 'VALIDATION_ERROR', 'ໄຟລ໌ບໍ່ຖືກຕ້ອງ');
    return ok({ url: `data:${body.contentType};base64,${body.dataBase64}` }, { status: 201 });
  }),
  http.post(api('/services/images/discard'), async () => ok({ deleted: false })),

  http.get(api('/service-categories'), async () => {
    await delay(120);
    return ok({ items: db.categories });
  }),

  http.post(api('/service-categories'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as { name?: string; imageUrl?: string };
    if (!body.name?.trim()) return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ຊື່ໝວດໝູ່');
    const cat = {
      id: newId('cat'),
      name: body.name.trim(),
      imageUrl: body.imageUrl ?? null,
      serviceCount: 0,
      sortOrder: db.categories.length,
    };
    db.categories.push(cat);
    return ok(cat, { status: 201 });
  }),

  http.patch(api('/service-categories/:id'), async ({ params, request }) => {
    await delay();
    const cat = db.categories.find((c) => c.id === params.id);
    if (!cat) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບໝວດໝູ່');
    const body = (await request.json().catch(() => ({}))) as { name?: string; imageUrl?: string };
    if (body.name !== undefined) {
      if (!body.name.trim()) return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ຊື່ໝວດໝູ່');
      cat.name = body.name.trim();
      db.services.forEach((s) => {
        if (s.categoryId === cat.id) s.categoryName = cat.name;
      });
    }
    if (body.imageUrl !== undefined) cat.imageUrl = body.imageUrl ?? null;
    return ok(cat);
  }),

  http.delete(api('/service-categories/:id'), async ({ params }) => {
    await delay();
    const idx = db.categories.findIndex((c) => c.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບໝວດໝູ່');
    if (db.categories[idx]!.serviceCount > 0) {
      return fail(409, 'CONFLICT', 'ໝວດໝູ່ນີ້ຍັງມີບໍລິການຢູ່');
    }
    const [removed] = db.categories.splice(idx, 1);
    return ok({ id: removed!.id });
  }),

  http.get(api('/services'), async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const categoryId = url.searchParams.get('categoryId');
    const isActive = url.searchParams.get('isActive');
    const page = num(url.searchParams.get('page'), 1);
    const pageSize = num(url.searchParams.get('pageSize'), 25);

    let rows = [...db.services];
    if (q) rows = rows.filter((s) => s.name.toLowerCase().includes(q));
    if (categoryId) rows = rows.filter((s) => s.categoryId === categoryId);
    if (isActive === 'true' || isActive === 'false') {
      rows = rows.filter((s) => s.isActive === (isActive === 'true'));
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginated(rows, page, pageSize);
  }),

  http.get(api('/services/stats'), async () => {
    await delay(120);
    const all = db.services;
    const total = all.length;
    const active = all.filter((s) => s.isActive).length;
    const withDeposit = all.filter((s) => s.requireDeposit).length;
    const avgPrice = total ? Math.round(all.reduce((sum, s) => sum + s.price, 0) / total) : 0;
    const avgDuration = total
      ? Math.round(all.reduce((sum, s) => sum + s.durationMinutes, 0) / total)
      : 0;
    const byCategory = db.categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        count: all.filter((s) => s.categoryId === c.id).length,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    return ok({ total, active, inactive: total - active, withDeposit, avgPrice, avgDuration, byCategory });
  }),

  http.get(api('/services/:id'), async ({ params }) => {
    await delay(120);
    const svc = db.services.find((s) => s.id === params.id);
    return svc ? ok(svc) : fail(404, 'NOT_FOUND', 'ບໍ່ພົບບໍລິການ');
  }),

  http.post(api('/services'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<Service>;
    if (!body.name?.trim() || !body.categoryId) {
      return fail(400, 'VALIDATION_ERROR', 'ຂໍ້ມູນບໍ່ຄົບຖ້ວນ');
    }
    const category = db.categories.find((c) => c.id === body.categoryId);
    const svc: Service = {
      id: newId('svc'),
      categoryId: body.categoryId,
      categoryName: category?.name ?? '—',
      branchId: body.branchId ?? null,
      branchName: null,
      name: body.name.trim(),
      description: body.description ?? null,
      price: body.price ?? 0,
      compareAtPrice: body.compareAtPrice ?? null,
      currency: 'LAK',
      durationMinutes: body.durationMinutes ?? 30,
      imageUrl: body.imageUrl ?? null,
      highlights: body.highlights ?? [],
      requireDeposit: body.requireDeposit ?? false,
      depositAmount: body.depositAmount ?? null,
      isActive: body.isActive ?? true,
      consumables: body.consumables ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.services.push(svc);
    if (category) category.serviceCount += 1;
    return ok(svc, { status: 201 });
  }),

  http.patch(api('/services/:id'), async ({ params, request }) => {
    await delay();
    const idx = db.services.findIndex((s) => s.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບໍລິການ');
    const body = (await request.json().catch(() => ({}))) as Partial<Service>;
    db.services[idx] = { ...db.services[idx]!, ...body, updatedAt: new Date().toISOString() };
    return ok(db.services[idx]);
  }),

  http.delete(api('/services/:id'), async ({ params }) => {
    await delay();
    const idx = db.services.findIndex((s) => s.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບໍລິການ');
    const [removed] = db.services.splice(idx, 1);
    const category = db.categories.find((c) => c.id === removed!.categoryId);
    if (category) category.serviceCount = Math.max(0, category.serviceCount - 1);
    return ok({ id: removed!.id });
  }),
];
