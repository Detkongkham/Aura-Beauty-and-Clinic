import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/format';

import { useReceipt } from './finance.api';
import { paymentMethodKey } from './finance.lib';

type Money = 'LAK' | 'THB' | 'USD';

/** Wave 10B — ໃບຮັບເງິນ/ໃບກຳກັບພາສີ ພິມໄດ້ (window.print → ບັນທຶກເປັນ PDF ໄດ້ຈາກໜ້າຕ່າງພິມ). */
export function ReceiptDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: r, isLoading } = useReceipt(paymentId);
  const money = (n: number) => formatCurrency(n, (r?.currency ?? 'LAK') as Money);

  return (
    <Dialog open={Boolean(paymentId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('finance.receipt.title')}</DialogTitle>
          <DialogDescription>{t('finance.receipt.subtitle')}</DialogDescription>
        </DialogHeader>

        {/* ພິມສະເພາະສ່ວນນີ້ */}
        <style>{`@media print {
          body * { visibility: hidden !important; }
          #receipt-print, #receipt-print * { visibility: visible !important; }
          #receipt-print { position: absolute; left: 0; top: 0; width: 80mm; padding: 4mm; color: #000; background: #fff; }
        }`}</style>

        {isLoading || !r ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div id="receipt-print" className="space-y-3 rounded-lg border border-dashed border-border bg-card p-4 text-xs">
            <div className="text-center">
              <p className="text-sm font-semibold">{r.business.name}</p>
              {r.business.legalName ? <p>{r.business.legalName}</p> : null}
              {r.business.taxId ? <p>{t('finance.receipt.taxId')}: {r.business.taxId}</p> : null}
              <p className="text-muted-foreground">{r.branch.name} · {r.branch.phone}</p>
              <p className="text-muted-foreground">{r.branch.address}</p>
            </div>

            <div className="border-y border-dashed border-border py-2">
              <p className="flex justify-between"><span>{t('finance.receipt.invoiceNo')}</span><span className="font-mono">{r.invoiceNo ?? '—'}</span></p>
              <p className="flex justify-between"><span>{t('finance.receipt.date')}</span><span>{r.issuedAt ? formatDate(r.issuedAt) : '—'}</span></p>
              {r.customerName ? <p className="flex justify-between"><span>{t('finance.receipt.customer')}</span><span>{r.customerName}</span></p> : null}
            </div>

            <ul className="space-y-1">
              {r.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2"><span>{l.label} × {l.qty}</span><span className="tabular-nums">{money(l.amount)}</span></li>
              ))}
            </ul>

            <div className="space-y-0.5 border-t border-dashed border-border pt-2">
              {r.netAmount != null && r.taxAmount != null ? (
                <>
                  <p className="flex justify-between"><span>{t('finance.receipt.net')}</span><span className="tabular-nums">{money(r.netAmount)}</span></p>
                  <p className="flex justify-between"><span>{t('finance.receipt.vat', { pct: Math.round((r.vatRate ?? 0) * 100) })}</span><span className="tabular-nums">{money(r.taxAmount)}</span></p>
                </>
              ) : null}
              <p className="flex justify-between text-sm font-semibold"><span>{t('finance.receipt.total')}</span><span className="tabular-nums">{money(r.total)}</span></p>
            </div>

            <ul className="space-y-0.5 text-muted-foreground">
              {r.tenders.map((x, i) => (
                <li key={i} className="flex justify-between"><span>{t(paymentMethodKey(x.method))}</span><span className="tabular-nums">{money(x.amount)}</span></li>
              ))}
            </ul>

            {r.refunds.length > 0 ? (
              <ul className="space-y-0.5 border-t border-dashed border-border pt-2">
                {r.refunds.map((x, i) => (
                  <li key={i} className="flex justify-between"><span className="font-mono">{x.creditNoteNo}</span><span className="tabular-nums">−{money(x.amount)}</span></li>
                ))}
              </ul>
            ) : null}

            {r.invoiceNo ? (
              <div className="flex flex-col items-center gap-1 pt-1">
                <QRCodeSVG value={`${r.invoiceNo}|${r.total}|${r.verifyCode}`} size={72} />
                <p className="font-mono text-2xs text-muted-foreground">{r.verifyCode}</p>
              </div>
            ) : (
              <p className="text-center text-warning">{t('finance.receipt.notIssued')}</p>
            )}
          </div>
        )}

        <Button onClick={() => window.print()} disabled={!r?.invoiceNo}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
          {t('finance.receipt.print')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
