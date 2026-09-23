import { Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { paymentMethodKey } from '@/features/finance/finance.lib';
import { formatCurrency, formatDateTime } from '@/lib/format';

import { useZReport } from './reconciliation.api';

/** Wave 10C — Z-report ຂອງກະລິ້ນຊັກ (ພິມໄດ້). ກະທີ່ປິດແລ້ວ = snapshot ບໍ່ປ່ຽນແປງ; ກະທີ່ເປີດ = ເບິ່ງລ່ວງໜ້າ. */
export function ZReportDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: z, isLoading } = useZReport(sessionId);
  const m = (n: number) => formatCurrency(n, (z?.currency ?? 'LAK') as 'LAK' | 'THB' | 'USD');
  const row = (label: string, value: string, strong?: boolean) => (
    <p className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );

  return (
    <Dialog open={Boolean(sessionId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payTreasury.recon.cash.z.title')}</DialogTitle>
          <DialogDescription>{z?.isLive ? t('payTreasury.recon.cash.z.live') : t('payTreasury.recon.cash.z.frozen')}</DialogDescription>
        </DialogHeader>
        <style>{`@media print {
          body * { visibility: hidden !important; }
          #zreport-print, #zreport-print * { visibility: visible !important; }
          #zreport-print { position: absolute; left: 0; top: 0; width: 80mm; padding: 4mm; color: #000; background: #fff; }
        }`}</style>
        {isLoading || !z ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div id="zreport-print" className="max-h-[60vh] space-y-3 overflow-y-auto rounded-lg border border-dashed border-border p-4 text-xs">
            <div className="text-center">
              <p className="text-sm font-semibold">{z.branchName}</p>
              <p className="font-mono">{z.zNo ?? t('payTreasury.recon.cash.z.noNumber')}</p>
              <p className="text-muted-foreground">
                {formatDateTime(z.openedAt)} → {z.closedAt ? formatDateTime(z.closedAt) : '…'}
              </p>
              <p className="text-muted-foreground">
                {z.openedByName ?? '—'} / {z.closedByName ?? '—'}
              </p>
            </div>

            <div className="space-y-0.5 border-t border-dashed border-border pt-2">
              <p className="font-semibold">{t('payTreasury.recon.cash.z.sales')}</p>
              {z.sales.length === 0 ? <p className="text-muted-foreground">—</p> : null}
              {z.sales.map((s) => row(`${t(paymentMethodKey(s.method as never))} ×${s.count}`, m(s.amount)))}
              {row(t('payTreasury.recon.cash.z.salesTotal'), m(z.salesTotal), true)}
            </div>

            <div className="space-y-0.5 border-t border-dashed border-border pt-2">
              <p className="font-semibold">{t('payTreasury.recon.cash.z.invoices')}</p>
              {row(t('payTreasury.recon.cash.z.count'), String(z.invoices.count))}
              {z.invoices.first ? row(t('payTreasury.recon.cash.z.range'), z.invoices.first === z.invoices.last ? z.invoices.first : `${z.invoices.first} … ${z.invoices.last}`) : null}
              {row(t('payTreasury.recon.cash.z.net'), m(z.invoices.net))}
              {row(t('payTreasury.recon.cash.z.vat'), m(z.invoices.tax))}
              {row(t('payTreasury.recon.cash.z.gross'), m(z.invoices.gross), true)}
            </div>

            <div className="space-y-0.5 border-t border-dashed border-border pt-2">
              <p className="font-semibold">{t('payTreasury.recon.cash.z.refunds')}</p>
              {row(t('payTreasury.recon.cash.z.count'), String(z.refunds.count))}
              {z.refunds.firstCreditNote ? row(t('payTreasury.recon.cash.z.range'), z.refunds.firstCreditNote === z.refunds.lastCreditNote ? z.refunds.firstCreditNote : `${z.refunds.firstCreditNote} … ${z.refunds.lastCreditNote}`) : null}
              {row(t('payTreasury.recon.cash.z.refundPayout'), m(z.refunds.payout))}
              {row(t('payTreasury.recon.cash.z.refundStore'), m(z.refunds.storeCredit))}
              {row(t('payTreasury.recon.cash.z.voids'), String(z.voids))}
            </div>

            <div className="space-y-0.5 border-t border-dashed border-border pt-2">
              <p className="font-semibold">{t('payTreasury.recon.cash.z.cash')}</p>
              {row(t('payTreasury.recon.cash.z.float'), m(z.cash.openingFloat))}
              {row(t('payTreasury.recon.cash.z.cashSales'), m(z.cash.cashSales))}
              {row(t('payTreasury.recon.cash.z.cashRefunds'), `−${m(z.cash.cashRefunds)}`)}
              {row(t('payTreasury.recon.cash.z.movements'), m(z.cash.payIns - z.cash.drops - z.cash.payouts))}
              {row(t('payTreasury.recon.cash.z.expected'), m(z.cash.expected), true)}
              {z.cash.counted != null ? row(t('payTreasury.recon.cash.z.counted'), m(z.cash.counted)) : null}
              {z.cash.variance != null ? row(t('payTreasury.recon.cash.z.variance'), `${z.cash.variance > 0 ? '+' : ''}${m(z.cash.variance)}`, true) : null}
              {z.cash.note ? <p className="text-muted-foreground">{z.cash.note}</p> : null}
            </div>
          </div>
        )}
        <Button onClick={() => window.print()} disabled={!z}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
          {t('payTreasury.recon.cash.z.print')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
