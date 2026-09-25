import { ArrowLeftRight, Boxes, ClipboardCheck, ClipboardList, ScrollText, ShoppingBag, Truck, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

const TAB_BASE =
  'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition-colors';

type TabKey = 'products' | 'suppliers' | 'purchaseOrders' | 'transfers' | 'counts' | 'returns' | 'sales' | 'ledger';

export function InventoryTabs({ active }: { active: TabKey }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('inventory:manage');
  const canSales = hasPermission('finance:view');
  const tabs = [
    { key: 'products' as const, to: ROUTES.inventory, label: t('inventory.tab.products'), icon: Boxes },
    { key: 'suppliers' as const, to: ROUTES.inventorySuppliers, label: t('inventory.tab.suppliers'), icon: Truck },
    {
      key: 'purchaseOrders' as const,
      to: ROUTES.inventoryPurchaseOrders,
      label: t('inventory.tab.purchaseOrders'),
      icon: ClipboardList,
    },
    {
      key: 'transfers' as const,
      to: ROUTES.inventoryTransfers,
      label: t('inventory.tab.transfers'),
      icon: ArrowLeftRight,
    },
    ...(canManage
      ? [
          { key: 'counts' as const, to: ROUTES.inventoryCounts, label: t('inventory.tab.counts'), icon: ClipboardCheck },
          { key: 'returns' as const, to: ROUTES.inventoryReturns, label: t('inventory.tab.returns'), icon: Undo2 },
        ]
      : []),
    ...(canSales ? [{ key: 'sales' as const, to: ROUTES.inventorySales, label: t('inventory.tab.sales'), icon: ShoppingBag }] : []),
    { key: 'ledger' as const, to: ROUTES.inventoryLedger, label: t('inventory.tab.ledger'), icon: ScrollText },
  ];

  return (
    <nav className="mt-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
      {tabs.map(({ key, to, label, icon: Icon }) => {
        const isActive = key === active;
        const className = cn(
          TAB_BASE,
          isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        );
        const inner = (
          <>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </>
        );
        return isActive ? (
          <span key={key} aria-current="page" className={className} data-testid={`tab-${key}`}>
            {inner}
          </span>
        ) : (
          <Link key={key} to={to} className={className} data-testid={`tab-${key}`}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
