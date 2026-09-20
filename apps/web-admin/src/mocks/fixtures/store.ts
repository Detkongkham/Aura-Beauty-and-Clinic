import {
  appointments,
  branches,
  categories,
  customers,
  queueTickets,
  services,
  staff,
  timeOff,
} from './dataset';
import { MOCK_ROLES } from './roles';
import { MOCK_USERS } from './users';

/**
 * Mutable in-memory copy of the seed dataset. Handlers read/write this so CRUD
 * works within a session; a full reload re-seeds from `dataset.ts`.
 */
export const db = {
  branches: structuredClone(branches),
  categories: structuredClone(categories),
  services: structuredClone(services),
  staff: structuredClone(staff),
  customers: structuredClone(customers),
  appointments: structuredClone(appointments),
  queueTickets: structuredClone(queueTickets),
  timeOff: structuredClone(timeOff),
  /** Shared with auth.ts so login/me reflect users.ts CRUD (create, permissions, quick-login). */
  users: structuredClone(MOCK_USERS),
  roles: structuredClone(MOCK_ROLES),
};

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}
