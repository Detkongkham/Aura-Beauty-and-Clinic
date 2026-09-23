import { http } from 'msw';

import { api, ok } from '../helpers';
import { appointmentHandlers } from './appointments';
import { authHandlers } from './auth';
import { branchHandlers } from './branches';
import { chatHandlers } from './chat';
import { customerHandlers } from './customers';
import { dashboardHandlers } from './dashboard';
import { extraHandlers } from './extra';
import { homeServiceHandlers } from './home-service';
import { inventoryHandlers } from './inventory';
import { messagingHandlers } from './messaging';
import { miscHandlers } from './misc';
import { payrollHandlers } from './payroll';
import { paymentsTreasuryHandlers } from './payments-treasury';
import { resourcesHandlers } from './resources';
import { revenueHandlers } from './revenue';
import { serviceHandlers } from './services';
import { staffHandlers } from './staff';

/**
 * Mock request handlers (Option A — backend gap; implementation_plan.md §5 Phase 2).
 * Each handler mirrors the eventual real REST contract so switching to the live
 * backend is a base-URL change, not a rewrite.
 */
export const handlers = [
  http.get(api('/health'), () => ok({ status: 'ok', mocked: true, ts: new Date().toISOString() })),
  ...authHandlers,
  ...branchHandlers,
  ...dashboardHandlers,
  ...serviceHandlers,
  ...staffHandlers,
  ...payrollHandlers,
  ...paymentsTreasuryHandlers,
  ...customerHandlers,
  ...appointmentHandlers,
  ...miscHandlers,
  ...extraHandlers,
  ...inventoryHandlers,
  ...revenueHandlers,
  ...homeServiceHandlers,
  ...resourcesHandlers,
  ...chatHandlers,
  ...messagingHandlers,
];
