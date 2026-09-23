import {
  Boxes,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Megaphone,
  Receipt,
  Scissors,
  Settings as SettingsIcon,
  UserCog,
  Users as UsersIcon,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Icon + accent colour per permission group — cycled across a small curated palette. */
export const GROUP_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  appointments: ClipboardList,
  queue: ListChecks,
  services: Scissors,
  staff: UsersRound,
  customers: UsersIcon,
  branches: MapPin,
  users: UserCog,
  settings: SettingsIcon,
  reports: FileBarChart,
  finance: Wallet,
  marketing: Megaphone,
  inventory: Boxes,
  payments: CreditCard,
  expenses: Receipt,
};

const GROUP_COLOR_ORDER = [
  '#4f46e5', // indigo
  '#db2777', // pink
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#e11d48', // rose
  '#0d9488', // teal
  '#c026d3', // fuchsia
  '#dc2626', // red
] as const;

export const GROUP_KEYS = Object.keys(GROUP_ICONS);

export const GROUP_COLORS: Record<string, string> = Object.fromEntries(
  GROUP_KEYS.map((key, i) => [key, GROUP_COLOR_ORDER[i % GROUP_COLOR_ORDER.length]!]),
);

export function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? GROUP_COLOR_ORDER[0];
}

export function groupIcon(group: string): LucideIcon {
  return GROUP_ICONS[group] ?? SettingsIcon;
}
