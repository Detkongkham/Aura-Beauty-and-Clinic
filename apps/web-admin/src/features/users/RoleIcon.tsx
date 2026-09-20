import type { RoleIconKey } from '@abcp/shared-types';
import {
  Banknote,
  Briefcase,
  Building2,
  Crown,
  Factory,
  FileText,
  Landmark,
  Scale,
  ShieldCheck,
  Truck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const ROLE_ICON_MAP: Record<RoleIconKey, LucideIcon> = {
  UsersRound,
  Crown,
  Building2,
  Landmark,
  Briefcase,
  ShieldCheck,
  Wrench,
  Truck,
  FileText,
  Banknote,
  Scale,
  Factory,
};

/** Renders a role's chosen icon (falls back to the generic "members" glyph for unknown keys). */
export function RoleIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ROLE_ICON_MAP[icon as RoleIconKey] ?? UsersRound;
  return <Icon className={className} aria-hidden="true" />;
}
