import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DateTimeText } from '@/components/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';

import { useLotUsage } from './inventory.api';

/** C5 recall report — who received treatment with this lot, plus where else it was shipped. */
export function LotUsageDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useLotUsage(lotId);

  return (
    <Dialog open={Boolean(lotId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <ClipboardList className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{t('inventory.lot.usageTitle')}</DialogTitle>
            <DialogDescription>{t('inventory.lot.usageSubtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto px-6 py-5">
            <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm">
              <p className="font-medium text-foreground">
                {data.lot.productName} · <span className="font-mono">{data.lot.lotNumber}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {data.lot.branchName} · {t('inventory.lot.expiry')}:{' '}
                {data.lot.expiryDate ? formatDate(data.lot.expiryDate) : '—'} · {t('inventory.lot.onHand')}:{' '}
                {data.lot.qtyOnHand.toLocaleString()} {data.lot.unit}
              </p>
              <p className="mt-1 text-xs font-medium text-foreground">
                {t('inventory.lot.usageSummary', {
                  customers: data.customerCount,
                  qty: data.totalConsumedQty.toLocaleString(),
                  unit: data.lot.unit,
                })}
              </p>
            </div>

            {data.appointments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('inventory.lot.usageEmpty')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">{t('inventory.lot.customer')}</th>
                      <th className="p-2">{t('inventory.lot.service')}</th>
                      <th className="p-2">{t('inventory.ledger.when')}</th>
                      <th className="p-2 text-right">{t('inventory.ledger.qty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.appointments.map((a) => (
                      <tr key={a.appointmentId} className="border-t border-border">
                        <td className="p-2">
                          <div className="font-medium">{a.customerName}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{a.customerPhone ?? '—'}</div>
                        </td>
                        <td className="p-2">{a.serviceName}</td>
                        <td className="p-2 text-xs">
                          <DateTimeText value={a.startAt} />
                        </td>
                        <td className="p-2 text-right tabular-nums">{a.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.transfersOut.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">{t('inventory.lot.transfersOut')}</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data.transfersOut.map((tr) => (
                    <li key={tr.transferId}>
                      {tr.transferNumber} → {tr.toBranchName} · {tr.qty.toLocaleString()} {data.lot.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
