import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

/** Browser Service Worker used during `pnpm dev` when VITE_ENABLE_MOCKS=true. */
export const worker = setupWorker(...handlers);

export async function startMockWorker(): Promise<void> {
  await worker.start({
    // Warn (don't silently bypass) so a missed handler is visible in the console.
    onUnhandledRequest: 'warn',
    quiet: false,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
  console.info('[web-admin] MSW mock API active — no backend/database required');
}
