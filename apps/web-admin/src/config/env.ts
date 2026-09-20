/**
 * Typed, validated access to build-time env (design.md workflow: no raw import.meta.env in features).
 * Feature flags for the placeholder route groups live here too (design.md §0 / infra `config`).
 */
import { z } from 'zod';

const rawSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default('http://localhost:4000/api/v1'),
  // Default false — hit the real @abcp/backend. Set true in .env.local to run
  // fully offline against the MSW mock handlers (src/mocks/).
  VITE_ENABLE_MOCKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  VITE_APP_NAME: z.string().default('Aura Admin'),
});

const parsed = rawSchema.safeParse(import.meta.env);

if (!parsed.success) {
  // Fail loudly at boot rather than deep inside a request.
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration for web-admin');
}

export const env = {
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  enableMocks: parsed.data.VITE_ENABLE_MOCKS,
  appName: parsed.data.VITE_APP_NAME,
  isDev: import.meta.env.DEV,
} as const;

/** Phase-gated feature flags — placeholder route groups (see implementation_plan.md §5). */
export const features = {
  finance: false, // Phase 5
  inventory: true, // Phase 6
  marketing: false, // Phase 5
  reports: false, // later
} as const;

export type FeatureFlag = keyof typeof features;
