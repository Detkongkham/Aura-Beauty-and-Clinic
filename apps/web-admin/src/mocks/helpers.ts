import { HttpResponse } from 'msw';

import { env } from '@/config/env';

/** Build an absolute URL for a mock route from the configured API base. */
export function api(path: string): string {
  return new URL(path.replace(/^\//, ''), env.apiBaseUrl.replace(/\/?$/, '/')).toString();
}

/** Simulate latency so loading states are exercised in dev. */
export function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Success envelope — mirrors backend `{ data: T }`. */
export function ok<T>(data: T, init?: ResponseInit) {
  return HttpResponse.json({ data }, init);
}

/** Error envelope — mirrors backend `{ error: { code, message, details? } }`. */
export function fail(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

/** Paginated envelope — `{ data: { items, page, pageSize, total } }`. */
export function paginated<T>(items: T[], page: number, pageSize: number, total = items.length) {
  const start = (page - 1) * pageSize;
  return ok({ items: items.slice(start, start + pageSize), page, pageSize, total });
}
