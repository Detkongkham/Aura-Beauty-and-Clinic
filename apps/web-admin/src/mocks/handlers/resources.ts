import { http } from 'msw';

import { api, ok } from '../helpers';

/**
 * Phase 7C — Multi-Resource Allocation (Module 17) mocks.
 * Offline-mode stub only: the real `@abcp/backend` `/resources` module is the source of truth.
 * Returns empty lists / echoes the write payload so the page renders under `VITE_ENABLE_MOCKS=true`.
 */
export const resourcesHandlers = [
  http.get(api('/resources/rooms'), () => ok([])),
  http.post(api('/resources/rooms'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: 'mock-room', branchName: 'Mock Branch', isAvailable: true, ...body });
  }),
  http.patch(api('/resources/rooms/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, branchName: 'Mock Branch', isAvailable: true, ...body });
  }),
  http.delete(api('/resources/rooms/:id'), ({ params }) => ok({ id: params.id })),

  http.get(api('/resources/equipment'), () => ok([])),
  http.post(api('/resources/equipment'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: 'mock-equipment', branchName: 'Mock Branch', isAvailable: true, ...body });
  }),
  http.patch(api('/resources/equipment/:id'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ id: params.id, branchName: 'Mock Branch', isAvailable: true, ...body });
  }),
  http.delete(api('/resources/equipment/:id'), ({ params }) => ok({ id: params.id })),
];
