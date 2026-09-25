import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PurchaseOrderRevisionChange, PurchaseOrderRevisionView } from '@abcp/shared-types';

import { DateTimeText } from '@/components/shared';
import { cn } from '@/lib/utils';

/** M7 — PO revision history: who changed what (header/lines/status), newest first, with a readable diff. */
export function PoHistory({ revisions }: { revisions: PurchaseOrderRevisionView[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!revisions.length) return null;

  const val = (c: PurchaseOrderRevisionChange, v: string | number | null) => {
    if (v == null) return '—';
    if (c.field === 'status') return t(`inventory.po.st.${v}`);
    return typeof v === 'number' ? v.toLocaleString() : v;
  };
  const line = (c: PurchaseOrderRevisionChange) => {
    const label = t(`inventory.poHistory.field.${c.field.replace('.', '_')}`);
    if (c.field === 'item.added') return `${label}: ${c.productName ?? ''} (${val(c, c.to)})`;
    if (c.field === 'item.removed') return `${label}: ${c.productName ?? ''} (${val(c, c.from)})`;
    return `${label}${c.productName ? ` · ${c.productName}` : ''}: ${val(c, c.from)} → ${val(c, c.to)}`;
  };

  return (
    <section className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm font-medium text-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t('inventory.poHistory.title')}
        <span className="text-xs font-normal text-muted-foreground">({revisions.length})</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {revisions.map((r) => (
            <li key={r.id} className="space-y-1 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  #{r.revisionNo} · {t(`inventory.poHistory.action.${r.action}`, { defaultValue: r.action })}
                </span>
                <span className="text-muted-foreground">
                  <DateTimeText value={r.changedAt} />
                  {r.changedByUserName ? ` · ${r.changedByUserName}` : ''}
                </span>
              </div>
              {r.changes.length ? (
                <ul className="list-inside list-disc text-muted-foreground">
                  {r.changes.map((c, i) => (
                    <li key={i}>{line(c)}</li>
                  ))}
                </ul>
              ) : null}
              {r.note ? <p className="text-muted-foreground">{t('inventory.poHistory.note', { note: r.note })}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
