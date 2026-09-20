import { http } from 'msw';

import { api, ok } from '../helpers';

/**
 * Phase 7B — Home Service Dispatch (Module 29) mocks.
 * Offline-mode stub only: the real `@abcp/backend` `/home-service/admin` module is the source of
 * truth. Returns empty data so the dispatch page renders without network errors under
 * `VITE_ENABLE_MOCKS=true`.
 */
export const homeServiceHandlers = [
  http.get(api('/home-service/admin/trips'), () => ok([])),
  http.patch(api('/home-service/admin/trips/:appointmentId/assign'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({
      id: params.appointmentId,
      appointmentId: params.appointmentId,
      status: 'ASSIGNED',
      ...body,
    });
  }),
];
