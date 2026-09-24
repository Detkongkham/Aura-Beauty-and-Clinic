import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// `.env.test` points DATABASE_URL/STORAGE_LOCAL_DIR at an isolated test DB/uploads dir — integration
// tests' wipe() helpers do blanket deletes (e.g. conversations.test.ts deletes *every* STAFF_INTERNAL
// thread) that previously ran against the same dev DB the app uses interactively, silently deleting
// real chat history mid-development. `override: true` because src/config/env.ts's own `loadEnv()`
// call (dotenv defaults to not overriding already-set vars) must not win a race against this one.
const testEnv = loadEnv({ path: '.env.test', override: true }).parsed ?? {};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: [],
    testTimeout: 20_000,
    pool: 'forks',
    // every integration file shares the one abcp_test DB and several touch the same singleton rows
    // (branch cash-drawer shift, Z-report/invoice counters, ledger-lock triggers) — running files in
    // parallel made refund/slip/wave10 tests fail at random, so files run one at a time
    fileParallelism: false,
    env: testEnv,
  },
});
