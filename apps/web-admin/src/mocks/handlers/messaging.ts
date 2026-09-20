import { http } from 'msw';

import { api, ok } from '../helpers';

/**
 * Phase 8 — Platform-Wide Messaging (Module 38, Wave 8B) mocks.
 * Offline-mode stub only: the real `@abcp/backend` `/conversations` module is the source of truth.
 */
export const messagingHandlers = [
  http.get(api('/conversations'), () => ok([])),
  http.post(api('/conversations'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({
      id: 'mock-conversation',
      type: 'STAFF_INTERNAL',
      title: null,
      participants: [],
      lastMessageAt: null,
      createdAt: new Date().toISOString(),
      isLocked: false,
      messageCount: 0,
      unreadCount: 0,
      lastMessage: null,
      ...body,
    });
  }),
  http.get(api('/conversations/:id/media'), () => ok({ photoCount: 0, voiceCount: 0, photos: [] })),
  http.post(api('/conversations/:id/read'), ({ params }) => ok({ id: params.id })),
  http.get(api('/conversations/reports'), () => ok([])),
  http.patch(api('/conversations/reports/:id'), ({ params }) => ok({ id: params.id, status: 'REVIEWED' })),
];
