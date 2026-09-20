import { lazy, type ComponentType } from 'react';

/**
 * Wrap a dynamic import that resolves to a module with a *named* export.
 * Feature pages (step 4) are code-split via this helper; AppShell provides the
 * <Suspense> boundary + PageLoader fallback.
 *
 * @example lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
 */
export function lazyPage<M extends Record<string, ComponentType<unknown>>>(
  factory: () => Promise<M>,
  exportName: keyof M,
) {
  return lazy(async () => {
    const mod = await factory();
    return { default: mod[exportName] };
  });
}
