/**
 * Analytics wrapper — no-op adapter for Phase 2 (design.md infra §18).
 * Swap `adapter` for a real sink (PostHog/GA/etc.) later without touching call sites.
 */
type AnalyticsEvent = Record<string, unknown>;

interface AnalyticsAdapter {
  track(name: string, props?: AnalyticsEvent): void;
  identify(userId: string, traits?: AnalyticsEvent): void;
  page(name: string, props?: AnalyticsEvent): void;
}

const noopAdapter: AnalyticsAdapter = {
  track: () => {},
  identify: () => {},
  page: () => {},
};

let adapter: AnalyticsAdapter = noopAdapter;

export const analytics = {
  setAdapter(next: AnalyticsAdapter) {
    adapter = next;
  },
  track: (name: string, props?: AnalyticsEvent) => adapter.track(name, props),
  identify: (userId: string, traits?: AnalyticsEvent) => adapter.identify(userId, traits),
  page: (name: string, props?: AnalyticsEvent) => adapter.page(name, props),
};
