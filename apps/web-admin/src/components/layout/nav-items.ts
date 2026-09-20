import {
  ArrowLeftRight,
  Bell,
  Boxes,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Coins,
  DoorOpen,
  FileBarChart,
  Gem,
  Gift,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MapPin,
  Megaphone,
  MessageCircle,
  Navigation,
  Percent,
  Plane,
  Scissors,
  ScrollText,
  Settings,
  Share2,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@/lib/rbac';
import { ROUTES } from '@/router/paths';

export interface NavItem {
  /** i18n key under `nav.*` */
  labelKey: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  /** match child routes as active */
  end?: boolean;
  /** Cannot be hidden from Settings ▸ ຈັດການໂມດູນ — keeps the admin's way back in. */
  locked?: boolean;
  /** Renders as an expandable group instead of a direct link (Sidebar.tsx). */
  children?: NavItem[];
}

export interface NavGroup {
  /** i18n key under `nav.*` */
  labelKey: string;
  items: NavItem[];
  /** Cannot be hidden from Settings ▸ ຈັດການໂມດູນ. */
  locked?: boolean;
}

/** Sidebar structure — design.md §8: Overview · Scheduling · Catalog · People · Settings. */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'overview',
    items: [
      {
        labelKey: 'dashboard',
        to: ROUTES.dashboard,
        icon: LayoutDashboard,
        end: true,
        permission: 'dashboard:view',
        locked: true,
      },
      { labelKey: 'notifications', to: ROUTES.notifications, icon: Bell },
    ],
  },
  {
    labelKey: 'scheduling',
    items: [
      { labelKey: 'calendar', to: ROUTES.calendar, icon: CalendarDays, permission: 'calendar:view' },
      { labelKey: 'appointments', to: ROUTES.appointments, icon: ClipboardList, permission: 'appointments:view', end: true },
      { labelKey: 'queue', to: ROUTES.queue, icon: ListChecks, permission: 'queue:manage' },
    ],
  },
  {
    labelKey: 'operations',
    items: [
      {
        labelKey: 'homeServiceDispatch',
        to: ROUTES.homeServiceDispatch,
        icon: Navigation,
        permission: 'queue:manage',
      },
      { labelKey: 'resources', to: ROUTES.resources, icon: DoorOpen, permission: 'queue:manage' },
      { labelKey: 'messaging', to: ROUTES.messaging, icon: MessageCircle, permission: 'queue:manage' },
    ],
  },
  {
    labelKey: 'catalog',
    items: [
      { labelKey: 'services', to: ROUTES.services, icon: Scissors, permission: 'services:view', end: true },
    ],
  },
  {
    labelKey: 'people',
    items: [
      { labelKey: 'staff', to: ROUTES.staff, icon: UsersRound, permission: 'staff:view', end: true },
      { labelKey: 'roster', to: ROUTES.roster, icon: CalendarRange, permission: 'staff:view' },
      { labelKey: 'timeOff', to: ROUTES.timeOff, icon: Plane, permission: 'staff:view' },
      { labelKey: 'payroll', to: ROUTES.payroll, icon: Coins, permission: 'staff:view' },
      { labelKey: 'customers', to: ROUTES.customers, icon: Users, permission: 'customers:view', end: true },
      { labelKey: 'branches', to: ROUTES.branches, icon: MapPin, permission: 'branches:view', end: true },
    ],
  },
  {
    labelKey: 'inventory',
    items: [
      { labelKey: 'inventoryProducts', to: ROUTES.inventory, icon: Boxes, permission: 'inventory:view', end: true },
      { labelKey: 'inventorySuppliers', to: ROUTES.inventorySuppliers, icon: Truck, permission: 'inventory:view' },
      {
        labelKey: 'inventoryPurchaseOrders',
        to: ROUTES.inventoryPurchaseOrders,
        icon: ClipboardList,
        permission: 'inventory:view',
      },
      {
        labelKey: 'inventoryTransfers',
        to: ROUTES.inventoryTransfers,
        icon: ArrowLeftRight,
        permission: 'inventory:view',
      },
      { labelKey: 'inventoryLedger', to: ROUTES.inventoryLedger, icon: ScrollText, permission: 'inventory:view' },
    ],
  },
  {
    labelKey: 'financeMarketing',
    items: [
      { labelKey: 'finance', to: ROUTES.finance, icon: Wallet, permission: 'finance:view', end: true },
      { labelKey: 'loyalty', to: ROUTES.loyalty, icon: Gem, permission: 'finance:view' },
      { labelKey: 'giftCards', to: ROUTES.giftCards, icon: Gift, permission: 'finance:view' },
      { labelKey: 'marketing', to: ROUTES.marketing, icon: Megaphone, permission: 'marketing:view' },
    ],
  },
  {
    labelKey: 'revenue',
    items: [
      { labelKey: 'pricing', to: ROUTES.pricing, icon: Percent, permission: 'finance:view' },
      { labelKey: 'referrals', to: ROUTES.referrals, icon: Share2, permission: 'finance:view' },
    ],
  },
  {
    labelKey: 'reports',
    items: [
      { labelKey: 'reports', to: ROUTES.reports, icon: FileBarChart, permission: 'reports:view', end: true },
      { labelKey: 'importExport', to: ROUTES.importExport, icon: FileBarChart, permission: 'reports:view' },
    ],
  },
  {
    labelKey: 'settings',
    locked: true,
    items: [
      { labelKey: 'settings', to: ROUTES.settings, icon: Settings, permission: 'settings:view', end: true },
      { labelKey: 'settingsNotifications', to: ROUTES.settingsNotifications, icon: Bell, permission: 'settings:view' },
      {
        labelKey: 'settingsModules',
        to: ROUTES.settingsModules,
        icon: LayoutGrid,
        permission: 'settings:view',
        locked: true,
      },
      {
        labelKey: 'userSettings',
        to: ROUTES.usersRoles,
        icon: UserCog,
        permission: 'users:view',
        children: [
          { labelKey: 'usersRoles', to: ROUTES.usersRoles, icon: UsersRound, permission: 'users:view', end: true },
          {
            labelKey: 'userPermissions',
            to: ROUTES.userPermissions,
            icon: ShieldCheck,
            permission: 'users:manage',
          },
          {
            labelKey: 'quickLoginManagement',
            to: ROUTES.quickLoginManagement,
            icon: Zap,
            permission: 'users:manage',
          },
        ],
      },
      { labelKey: 'auditLog', to: ROUTES.auditLog, icon: ClipboardList, permission: 'settings:view' },
      {
        labelKey: 'chatModeration',
        to: ROUTES.chatModeration,
        icon: MessageCircle,
        permission: 'settings:view',
      },
    ],
  },
];
