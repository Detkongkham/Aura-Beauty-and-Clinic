import type { Permission } from '@/lib/rbac';

/** Bilingual label — flow content lives in code (not the locale JSON) so a flow stays one readable unit. */
export interface Text {
  lo: string;
  en: string;
}

/**
 * Swimlanes, top to bottom. Module flows use the actor lanes; status machines
 * use `main` (the happy path) and `exception` (cancel / fail / reverse).
 */
export type Lane = 'customer' | 'staff' | 'admin' | 'system' | 'external' | 'main' | 'exception';

/** data = ສົ່ງຂໍ້ມູນ · status = ປ່ຽນສະຖານະ · auto = job / webhook ກະຕຸ້ນເອງ */
export type EdgeKind = 'data' | 'status' | 'auto';

export interface MapNode {
  id: string;
  lane: Lane;
  /** Column along the flow, left → right. Fractions are fine for nudging. */
  col: number;
  /** 0 = top slot of the lane, 1 = bottom slot. */
  row?: 0 | 1;
  title: Text;
  desc: Text;
  /** Backend endpoints, relative to `/api/v1`. */
  apis?: string[];
  /** web-admin page this step happens on (clickable in the detail sheet). */
  route?: string;
  /** Mobile screen component that implements the step. */
  screen?: string;
  /** Background job + schedule, e.g. `reminder.job` plus its cron pattern. */
  job?: string;
  /** DB enum values this step reads or writes. */
  statuses?: string[];
  /** Needs this permission (renders the lock glyph). */
  permission?: Permission;
  /** Status-machine nodes: terminal state (success / failure) tint. */
  tone?: 'success' | 'danger' | 'warning';
}

export interface MapEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: Text;
}

export type FlowGroup = 'overview' | 'module' | 'status';

export interface Flow {
  id: string;
  group: FlowGroup;
  title: Text;
  /** One-line summary shown under the title in the flow list and the canvas header. */
  summary: Text;
  nodes: MapNode[];
  edges: MapEdge[];
}

export const L = (lo: string, en: string): Text => ({ lo, en });

export function edge(from: string, to: string, kind: EdgeKind, label?: Text): MapEdge {
  return label ? { from, to, kind, label } : { from, to, kind };
}
