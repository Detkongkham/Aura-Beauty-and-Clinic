import { http } from 'msw';

import { api, ok, paginated } from '../helpers';

/**
 * Phase 6 — Inventory (Module 14 + 32) & Payroll (Module 34) mocks.
 * Offline-mode stubs only: the real `@abcp/backend` modules
 * (`/suppliers`, `/products`, `/stock-movements`, `/purchase-orders`)
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

const inventorySettings = {
  approvalThresholdLak: 1_000_000,
  poApprovalThresholdLak: 5_000_000,
  overReceiptTolerancePct: 0,
  invoiceMatchTolerancePct: 1,
  safetyStockDays: 3,
  reorderReviewDays: 7,
  defaultLeadTimeDays: 7,
  abcA: 80,
  abcB: 95,
};

/** 9C — M1 ໜ່ວຍມາດຕະຖານ (ຊຸດດຽວກັບ seed/migration). */
const mockUoms = [
  ['piece', 'Piece', 'ອັນ'],
  ['bottle', 'Bottle', 'ຕຸກ'],
  ['box', 'Box', 'ກ່ອງ'],
  ['ml', 'ml', 'ມລ'],
  ['g', 'g', 'ກຣາມ'],
  ['set', 'Set', 'ຊຸດ'],
  ['pack', 'Pack', 'ແພັກ'],
  ['sachet', 'Sachet', 'ຊອງ'],
  ['tube', 'Tube', 'ຫຼອດ'],
  ['jar', 'Jar', 'ກະປຸກ'],
].map(([code, name, nameLo], i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`,
  code,
  name,
  nameLo,
  isActive: true,
  productCount: 0,
}));

const emptyExport = () => ok({ items: [], total: 0, truncated: false, maxRows: 10_000 });

export const inventoryHandlers = [
  // ---- M15 exports + H3 stock counts + valuation/shrinkage reports (listed first so the
  // literal `/export` paths win over the `/:id` handlers below) ----
  ...['/products', '/stock-movements', '/purchase-orders', '/stock-transfers', '/stock-lots', '/stock-counts', '/supplier-returns', '/retail-sales'].map((base) =>
    http.get(api(`${base}/export`), emptyExport),
  ),
  // ---- 9C — M1 units, M3 categories + ABC, M2 barcode lookup ----
  http.get(api('/uoms'), () => ok(mockUoms)),
  http.post(api('/uoms'), async ({ request }) => {
    const body = (await request.json()) as { code: string; name: string; nameLo?: string | null };
    return ok({ id: crypto.randomUUID(), code: body.code.toLowerCase(), name: body.name, nameLo: body.nameLo ?? null, isActive: true, productCount: 0 }, { status: 201 });
  }),
  http.patch(api('/uoms/:id'), async ({ params, request }) => {
    const found = mockUoms.find((u) => u.id === params.id);
    return ok({ ...(found ?? mockUoms[0]), ...((await request.json()) as object) });
  }),
  http.get(api('/product-categories'), () => ok([])),
  http.post(api('/product-categories'), async ({ request }) => {
    const body = (await request.json()) as { name: string; nameLo?: string | null; parentId?: string | null; branchId?: string | null };
    return ok(
      {
        id: crypto.randomUUID(),
        name: body.name,
        nameLo: body.nameLo ?? null,
        parentId: body.parentId ?? null,
        parentName: null,
        sortOrder: 0,
        isActive: true,
        branchId: body.branchId ?? null,
        branchName: null,
        productCount: 0,
      },
      { status: 201 },
    );
  }),
  http.patch(api('/product-categories/:id'), async ({ params, request }) =>
    ok({ id: params.id, ...((await request.json()) as object) }),
  ),
  http.delete(api('/product-categories/:id'), () => new Response(null, { status: 204 })),
  // Offline: no products → every scan is "not found".
  http.get(api('/products/lookup'), () =>
    Response.json({ error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບສິນຄ້າ' } }, { status: 404 }),
  ),
  http.get(api('/stock-movements/abc'), ({ request }) => {
    const url = new URL(request.url);
    return ok({
      basis: url.searchParams.get('basis') ?? 'consumptionValue',
      from: null,
      to: null,
      branchId: url.searchParams.get('branchId'),
      thresholds: { a: 80, b: 95 },
      rows: [],
      classes: (['A', 'B', 'C'] as const).map((abcClass) => ({ abcClass, products: 0, value: 0, sharePct: 0 })),
      totals: { products: 0, value: 0 },
    });
  }),
  http.get(api('/stock-movements/valuation'), () =>
    ok({ asOf: '', branchId: null, rows: [], totals: { products: 0, value: 0, fallbackProducts: 0 } }),
  ),
  http.get(api('/stock-movements/shrinkage'), () =>
    ok({ from: '', to: '', branchId: null, byReason: [], byProduct: [], totals: { count: 0, value: 0 } }),
  ),
  // ---- 9D — turnover / aging / usage-per-service reports + suggested orders ----
  http.get(api('/stock-movements/turnover'), () =>
    ok({
      from: '', to: '', branchId: null, days: 30, rows: [],
      totals: { cogs: 0, openingValue: 0, closingValue: 0, avgValue: 0, turnover: 0, daysOnHand: null },
    }),
  ),
  http.get(api('/stock-movements/aging'), () =>
    ok({
      asOf: new Date().toISOString().slice(0, 10), branchId: null, rows: [],
      buckets: ['0-30', '31-60', '61-90', '90+'].map((bucket) => ({ bucket, qty: 0, value: 0, lines: 0 })),
      totals: { qty: 0, value: 0, lines: 0 },
    }),
  ),
  http.get(api('/stock-movements/service-usage'), () =>
    ok({ from: '', to: '', branchId: null, rows: [], byService: [], totals: { appointments: 0, value: 0 } }),
  ),
  http.get(api('/purchase-orders/suggestions'), () =>
    ok({ branchId: null, generatedAt: new Date().toISOString(), groups: [], totals: { products: 0, groups: 0 } }),
  ),
  http.get(api('/stock-counts'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/stock-counts/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/stock-counts'), () => new Response(null, { status: 501 })),
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
        taxId: body.taxId ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        leadTimeDays: body.leadTimeDays ?? null,
        currency: body.currency ?? 'LAK',
        bankName: body.bankName ?? null,
        bankAccountName: body.bankAccountName ?? null,
        bankAccountNo: body.bankAccountNo ?? null,
        isActive: body.isActive ?? true,
        deletedAt: null,
        branchId: body.branchId ?? null,
        branchName: null,
        purchaseOrderCount: 0,
        priceListCount: 0,
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
  // M8 — price list
  http.get(api('/suppliers/:id/products'), () => ok([])),
  http.put(api('/suppliers/:id/products'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({
      id: crypto.randomUUID(), supplierId: params.id, supplierName: '', productId: body.productId, productName: '', sku: '',
      unit: '', branchId: '', branchName: '', supplierSku: body.supplierSku ?? null, unitCost: body.unitCost ?? 0,
      currency: body.currency ?? 'LAK', moq: body.moq ?? null, leadTimeDays: body.leadTimeDays ?? null,
      isPreferred: body.isPreferred ?? false, updatedAt: new Date().toISOString(),
    });
  }),
  http.delete(api('/suppliers/:id/products/:productId'), () => new Response(null, { status: 204 })),

  // ---- products ----
  http.get(api('/products/stats'), () =>
    ok({
      totalProducts: 0,
      activeProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      totalStockValue: 0,
      openPurchaseOrders: 0,
      shortForUpcomingCount: 0,
      reservedProductCount: 0,
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
        reservedQty: 0,
        availableQty: Number(body.openingStock ?? 0),
        onOrderQty: 0,
        shortForUpcoming: false,
        reorderPoint: null,
        avgDailyUsage: null,
        reorderComputedAt: null,
        reorderThreshold: Number(body.minStockQty ?? 5),
        isSellable: body.isSellable ?? false,
        retailPrice: body.retailPrice ?? null,
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
    const body = (await request.json()) as { productId: string; delta: number; reason?: string; notes?: string };
    return ok(
      {
        outcome: 'POSTED',
        movement: {
        id: crypto.randomUUID(),
        productId: body.productId,
        productName: '—',
        branchId: '',
        type: body.delta > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_DEDUCT',
        qty: Math.abs(body.delta),
        balanceAfter: 0,
        refId: null,
        reasonCode: body.reason ?? null,
        notes: body.notes ?? null,
        createdByUserId: null,
        createdByUserName: null,
        createdAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  }),

  http.get(api('/stock-movements/service-margin'), () =>
    ok({ from: '', to: '', branchId: null, rows: [], totals: { completed: 0, revenue: 0, cogs: 0, grossMargin: 0, marginPct: 0 } }),
  ),
  http.get(api('/stock-adjustments'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/stock-adjustments/settings'), () => ok(inventorySettings)),
  http.put(api('/stock-adjustments/settings'), async ({ request }) => {
    Object.assign(inventorySettings, (await request.json()) as Partial<typeof inventorySettings>);
    return ok(inventorySettings);
  }),

  // ---- M13 — retail / OTC sales (offline: empty list, margin report zeros; writes need the backend) ----
  http.get(api('/retail-sales/margin'), () =>
    ok({
      from: new Date().toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
      branchId: null,
      rows: [],
      totals: { saleCount: 0, qtySold: 0, qtyReturned: 0, revenue: 0, cogs: 0, grossMargin: 0, marginPct: 0 },
    }),
  ),
  http.get(api('/retail-sales'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/retail-sales/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/retail-sales'), () => new Response(null, { status: 501 })),
  http.post(api('/retail-sales/:id/void'), () => new Response(null, { status: 501 })),
  http.post(api('/retail-sales/:id/post-stock'), () => new Response(null, { status: 501 })),
  http.post(api('/retail-sales/:id/returns'), () => new Response(null, { status: 501 })),

  // ---- 9D — supplier returns (H5) + supplier balance ----
  http.get(api('/supplier-returns'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/supplier-returns/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/supplier-returns'), () => new Response(null, { status: 501 })),
  http.post(api('/supplier-returns/:id/post'), () => new Response(null, { status: 501 })),
  http.post(api('/supplier-returns/:id/cancel'), () => new Response(null, { status: 501 })),
  http.get(api('/suppliers/:id/balance'), ({ params }) =>
    ok({ supplierId: params.id, supplierName: '—', invoiced: 0, paid: 0, debitNotes: 0, outstanding: 0 }),
  ),

  // ---- purchase orders ----
  http.get(api('/purchase-orders'), ({ request }) => {
    const { page: p, pageSize } = page(new URL(request.url));
    return paginated([], p, pageSize, 0);
  }),
  http.get(api('/purchase-orders/:id'), () => new Response(null, { status: 404 })),
  http.post(api('/purchase-orders'), async ({ request }) => {
    const body = (await request.json()) as {
      items?: Array<{ quantity: number; unitCost?: number }>;
      currency?: string;
      fxRate?: number;
    };
    const total = (body.items ?? []).reduce((s, it) => s + it.quantity * (it.unitCost ?? 0), 0);
    const fxRate = body.currency && body.currency !== 'LAK' ? (body.fxRate ?? 1) : 1;
    return ok(
      {
        id: crypto.randomUUID(),
        poNumber: `PO-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
        branchId: '',
        branchName: '—',
        supplierId: '',
        supplierName: '—',
        supplierInactive: false,
        status: 'DRAFT',
        totalAmount: total,
        currency: body.currency ?? 'LAK',
        fxRate,
        totalAmountLak: total * fxRate,
        itemCount: (body.items ?? []).length,
        orderDate: new Date().toISOString(),
        receivedDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
        revisions: [],
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
  // 9D — GRN / approval / close short / 3-way match (offline stubs)
  http.post(api('/purchase-orders/:id/receipts'), () => new Response(null, { status: 501 })),
  http.post(api('/purchase-orders/:id/approve'), ({ params }) => ok({ id: params.id, status: 'ORDERED' })),
  http.post(api('/purchase-orders/:id/reject'), ({ params }) => ok({ id: params.id, status: 'DRAFT' })),
  http.post(api('/purchase-orders/:id/close-short'), ({ params }) =>
    ok({ id: params.id, status: 'RECEIVED', closedShortAt: new Date().toISOString() }),
  ),
  http.get(api('/purchase-orders/:id/match'), ({ params }) =>
    ok({
      purchaseOrderId: params.id,
      poNumber: '—',
      poStatus: 'ORDERED',
      status: 'NO_INVOICE',
      tolerancePct: 1,
      ordered: 0,
      received: 0,
      returned: 0,
      netReceived: 0,
      invoiced: 0,
      invoicedTax: 0,
      netInvoiced: 0,
      expected: 0,
      variance: 0,
      invoices: [],
      debitNotes: [],
      lines: [],
    }),
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
  http.delete(api('/stock-transfers/:id'), () => new Response(null, { status: 204 }))
];
