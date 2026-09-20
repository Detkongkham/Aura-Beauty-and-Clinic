import { http } from 'msw';

import { api, ok, paginated } from '../helpers';

/**
 * Phase 7A — Dynamic Pricing (Module 28) & Referral/Affiliate (Module 33) mocks.
 * Offline-mode stubs only: the real `@abcp/backend` modules (`/pricing-rules`,
 * `/affiliates`) are the source of truth. These return empty data so the pages
 * render without network errors when `VITE_ENABLE_MOCKS=true`.
 */
export const revenueHandlers = [
  // ---- pricing rules ----
  http.get(api('/pricing-rules'), () => ok([])),
  http.post(api('/pricing-rules'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok(
      {
        id: crypto.randomUUID(),
        branchName: '',
        serviceName: null,
        dayOfWeek: 1,
        startTime: '13:00',
        endTime: '16:00',
        discountPercent: 0,
        priceMultiplier: 1,
        isActive: true,
        ...body,
      },
      { status: 201 },
    );
  }),
  http.patch(api('/pricing-rules/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, branchName: '', serviceName: null, ...body });
  }),
  http.delete(api('/pricing-rules/:id'), () => new Response(null, { status: 204 })),

  // ---- loyalty (admin roster + member ledger) ----
  http.get(api('/loyalty/accounts'), ({ request }) => {
    const url = new URL(request.url);
    return paginated([], Number(url.searchParams.get('page')) || 1, Number(url.searchParams.get('pageSize')) || 20, 0);
  }),
  http.get(api('/loyalty/accounts/:userId/ledger'), ({ request }) => {
    const url = new URL(request.url);
    return paginated([], Number(url.searchParams.get('page')) || 1, Number(url.searchParams.get('pageSize')) || 20, 0);
  }),

  // ---- affiliates ----
  http.get(api('/affiliates'), ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 20;
    return paginated([], page, pageSize, 0);
  }),
  http.post(api('/affiliates'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok(
      {
        id: crypto.randomUUID(),
        userName: '',
        userPhone: '',
        totalEarnings: 0,
        unpaidBalance: 0,
        referredCount: 0,
        currency: 'LAK',
        createdAt: new Date().toISOString(),
        ...body,
      },
      { status: 201 },
    );
  }),
  http.patch(api('/affiliates/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, ...body });
  }),
  http.delete(api('/affiliates/:id'), () => new Response(null, { status: 204 })),
  http.get(api('/affiliates/:id/payouts'), () => ok([])),
  http.post(api('/affiliates/:id/payouts'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok(
      {
        id: crypto.randomUUID(),
        affiliateProfileId: params.id,
        status: 'PENDING',
        paidAt: null,
        createdAt: new Date().toISOString(),
        ...body,
      },
      { status: 201 },
    );
  }),
  http.patch(api('/affiliates/payouts/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, paidAt: null, ...body });
  }),

  // ---- marketing campaigns ----
  http.get(api('/marketing/campaigns'), ({ request }) => {
    const url = new URL(request.url);
    return paginated([], Number(url.searchParams.get('page')) || 1, Number(url.searchParams.get('pageSize')) || 20, 0);
  }),
  http.get(api('/marketing/campaigns/:id/recipients'), () => ok({ items: [] })),
];
