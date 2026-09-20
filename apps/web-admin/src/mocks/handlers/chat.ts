import { http } from 'msw';

import { api, ok } from '../helpers';

/**
 * Phase 7C — In-App Chat (Module 21) mocks.
 * Offline-mode stub only: the real `@abcp/backend` `/chat` module is the source of truth.
 * Returns an empty thread/history so `ChatPanel` renders without network errors under
 * `VITE_ENABLE_MOCKS=true`.
 */
export const chatHandlers = [
  http.get(api('/chat/appointments/:appointmentId/thread'), ({ params }) =>
    ok({
      id: `mock-thread-${params.appointmentId}`,
      appointmentId: params.appointmentId,
      branchId: 'mock-branch',
      customerId: 'mock-customer',
      customerName: 'Mock Customer',
      staffProfileId: null,
      staffName: null,
      lastMessageAt: null,
      createdAt: new Date().toISOString(),
    }),
  ),
  http.get(api('/chat/threads/:id/messages'), () =>
    ok({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 }),
  ),
  http.post(api('/chat/threads/:id/messages'), async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({
      id: `mock-message-${Date.now()}`,
      threadId: params.id,
      senderId: 'mock-user',
      senderRole: 'BRANCH_ADMIN',
      senderName: 'Mock Admin',
      readAt: null,
      createdAt: new Date().toISOString(),
      ...body,
    });
  }),
];
