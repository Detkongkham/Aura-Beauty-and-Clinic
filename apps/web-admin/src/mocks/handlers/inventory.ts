import { http } from 'msw';

import { api, ok, paginated } from '../helpers';

/**
 * Phase 6 — Inventory (Module 14 + 32) & Payroll (Module 34) mocks.
 * Offline-mode stubs only: the real `@abcp/backend` modules
 * (`/suppliers`, `/products`, `/stock-movements`, `/purchase-orders`, `/payroll`)
 * are the source of truth. These return empty/zero data so the pages render
 * without network errors when `VITE_ENABLE_MOCKS=true`.
 */

const num = (v: string | null, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const page = (url: URL) => ({
  page: num(url.searchParams.get('page'), 1),
  pageSize: num(url.searchParams.get('pageSize'), 20),
});

export const inventoryHandlers = [
  // ---- suppliers ----
  http.get(api('/suppliers'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.post(api('/suppliers'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok(
      {
        id: crypto.randomUUID(),
        name: body.name ?? '',
        contactPerson: body.contactPerson ?? null,
        phone: body.phone ?? '',
        email: body.email ?? null,
        address: body.address ?? null,
        purchaseOrderCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),
  http.patch(api('/suppliers/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({
      id: params.id,
      ...body,
      purchaseOrderCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),
  http.delete(api('/suppliers/:id'), () => new Response(null, { status: 204 })),

  // ---- products ----
  http.get(api('/products/stats'), () =>
    ok({
      totalProducts: 0,
      activeProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      totalStockValue: 0,
      openPurchaseOrders: 0,
    }),
  ),
  http.get(api('/products'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/products/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/products'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok(
      {
        id: crypto.randomUUID(),
        branchId: body.branchId ?? '',
        branchName: '—',
        name: body.name ?? '',
        sku: body.sku ?? '',
        unit: body.unit ?? '',
        costPrice: Number(body.costPrice ?? 0),
        stockQty: Number(body.openingStock ?? 0),
        minStockQty: Number(body.minStockQty ?? 5),
        stockValue: 0,
        outOfStock: Number(body.openingStock ?? 0) <= 0,
        lowStock: false,
        isActive: body.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),
  http.patch(api('/products/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, ...body });
  }),
  http.delete(api('/products/:id'), () => new Response(null, { status: 204 })),

  // ---- stock movements ----
  http.get(api('/stock-movements'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.post(api('/stock-movements/adjust'), async ({ request }) => {
    const body = (await request.json()) as { productId: string; delta: number; notes?: string };
    return ok(
      {
        id: crypto.randomUUID(),
        productId: body.productId,
        productName: '—',
        branchId: '',
        type: body.delta > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_DEDUCT',
        qty: Math.abs(body.delta),
        balanceAfter: 0,
        refId: null,
        notes: body.notes ?? null,
        createdByUserId: null,
        createdByUserName: null,
        createdAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  // ---- purchase orders ----
  http.get(api('/purchase-orders'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/purchase-orders/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/purchase-orders'), async ({ request }) => {
    const body = (await request.json()) as { items?: Array<{ quantity: number; unitCost: number }> };
    const total = (body.items ?? []).reduce((s, it) => s + it.quantity * it.unitCost, 0);
    return ok(
      {
        id: crypto.randomUUID(),
        poNumber: `PO-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
        branchId: '',
        branchName: '—',
        supplierId: '',
        supplierName: '—',
        status: 'DRAFT',
        totalAmount: total,
        itemCount: (body.items ?? []).length,
        orderDate: new Date().toISOString(),
        receivedDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
      },
      { status: 201 },
    );
  }),
  http.patch(api('/purchase-orders/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, ...body });
  }),
  http.post(api('/purchase-orders/:id/receive'), ({ params }) =>
    ok({ id: params.id, status: 'RECEIVED', receivedDate: new Date().toISOString() }),
  ),
  http.delete(api('/purchase-orders/:id'), () => new Response(null, { status: 204 })),

  // ---- stock transfers ----
  http.get(api('/stock-transfers'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/stock-transfers/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/stock-transfers'), async ({ request }) => {
    const body = (await request.json()) as {
      fromBranchId?: string;
      toBranchId?: string;
      items?: Array<{ quantity: number }>;
      notes?: string;
    };
    return ok(
      {
        id: crypto.randomUUID(),
        transferNumber: `TRF-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
        fromBranchId: body.fromBranchId ?? '',
        fromBranchName: '—',
        toBranchId: body.toBranchId ?? '',
        toBranchName: '—',
        status: 'DRAFT',
        notes: body.notes ?? null,
        itemCount: (body.items ?? []).length,
        totalValue: 0,
        sentAt: null,
        receivedAt: null,
        createdByUserName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
      },
      { status: 201 },
    );
  }),
  http.post(api('/stock-transfers/:id/send'), ({ params }) =>
    ok({ id: params.id, status: 'IN_TRANSIT', sentAt: new Date().toISOString() }),
  ),
  http.post(api('/stock-transfers/:id/receive'), ({ params }) =>
    ok({ id: params.id, status: 'COMPLETED', receivedAt: new Date().toISOString() }),
  ),
  http.delete(api('/stock-transfers/:id'), () => new Response(null, { status: 204 })),

  // ---- payroll ----
  http.get(api('/payroll/kpi'), ({ request }) => {
    const url = new URL(request.url);
    return ok({
      monthYear: url.searchParams.get('monthYear') ?? new Date().toISOString().slice(0, 7),
      generatedAt: new Date().toISOString(),
      bonusRate: 0.05,
      rows: [],
      totals: {
        staff: 0,
        completedJobs: 0,
        grossRevenue: 0,
        commissionTotal: 0,
        commissionUnpaid: 0,
        bonusTotal: 0,
        outstanding: 0,
      },
    });
  }),
  http.get(api('/payroll/export'), () =>
    new Response('﻿rank,staff,branch\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    }),
  ),
  http.put(api('/payroll/kpi/:staffProfileId'), async ({ params }) =>
    ok({ staffProfileId: params.staffProfileId, rank: 1, targetMet: false, bonusAmount: 0 }),
  ),
  http.post(api('/payroll/kpi/recompute'), async ({ request }) => {
    const body = (await request.json()) as { monthYear: string };
    return ok({ monthYear: body.monthYear, updated: 0 });
  }),
  http.patch(api('/payroll/kpi/:staffProfileId/bonus-paid'), async ({ params, request }) => {
    const body = (await request.json()) as { monthYear: string; isBonusPaid: boolean };
    return ok({ staffProfileId: params.staffProfileId, ...body });
  }),
  http.post(api('/payroll/commissions/pay'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ ...body, affected: 0 });
  }),
];
