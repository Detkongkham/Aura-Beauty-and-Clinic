import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import type { GoodsReceiptView, PurchaseOrderView, SupplierReturnView } from '@abcp/shared-types';

/**
 * M15 (PDF remainder) — printable inventory documents via the browser print path (Print → "Save as PDF"),
 * mirroring the stock-count sheet: a self-contained HTML page in a popup with a clean A4 print stylesheet —
 * document number, branch, supplier, lines, totals and signature lines. No PDF library.
 */

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const money = (n: number | null | undefined, currency = 'LAK') =>
  n == null ? '' : `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}${currency === 'LAK' ? ' ₭' : ` ${currency}`}`;
const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '');

type Doc = {
  title: string;
  number: string;
  business?: string;
  meta: Array<[string, string]>;
  columns: Array<{ label: string; num?: boolean }>;
  rows: Array<Array<string>>;
  totals: Array<[string, string]>;
  notes?: string | null;
  signatures: string[];
};

export function printDocument(doc: Doc, t: TFunction): void {
  const head = doc.columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  const body = doc.rows
    .map((r) => `<tr>${r.map((cell, i) => `<td class="${doc.columns[i]?.num ? 'num' : ''}">${cell}</td>`).join('')}</tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.number)}</title>
    <style>
      @page{size:A4;margin:14mm}
      body{font-family:"Noto Sans Lao","Phetsarath OT",system-ui,sans-serif;font-size:12px;margin:0;color:#111}
      .top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:8px}
      h1{font-size:18px;margin:0} .no{font-size:14px;font-weight:600;margin-top:2px} .muted{color:#555;font-size:11px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-top:10px}
      .meta div{display:flex;gap:6px} .meta b{min-width:120px;color:#444;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:14px} th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}
      th{background:#f2f2f2} .num{text-align:right;font-variant-numeric:tabular-nums}
      .totals{margin-top:8px;margin-left:auto;width:320px} .totals div{display:flex;justify-content:space-between;padding:2px 0}
      .totals div:last-child{border-top:2px solid #111;font-weight:700;font-size:13px}
      .sign{display:flex;gap:32px;margin-top:48px} .sign div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center}
      tr{page-break-inside:avoid}
    </style></head><body>
    <div class="top"><div><div class="no">${esc(doc.business ?? '')}</div></div>
      <div style="text-align:right"><h1>${esc(doc.title)}</h1><div class="no">${esc(doc.number)}</div></div></div>
    <div class="meta">${doc.meta.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="totals">${doc.totals.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>
    ${doc.notes ? `<p class="muted">${esc(doc.notes)}</p>` : ''}
    <div class="sign">${doc.signatures.map((s) => `<div>${esc(s)}</div>`).join('')}</div>
    <p class="muted" style="margin-top:16px">${esc(t('inventory.print.printedAt', { at: new Date().toLocaleString() }))}</p>
    <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'noopener=no,width=900,height=700');
  if (!w) {
    toast.error(t('inventory.count.popupBlocked'));
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function printPurchaseOrder(po: PurchaseOrderView, t: TFunction, business?: string): void {
  printDocument(
    {
      title: t('inventory.print.po'),
      number: po.poNumber,
      business,
      meta: [
        [t('inventory.po.supplier'), po.supplierName],
        [t('inventory.col.branch'), po.branchName],
        [t('inventory.po.status'), t(`inventory.po.st.${po.status}`)],
        [t('inventory.po.ordered'), dt(po.orderDate)],
        ...(po.currency !== 'LAK' ? ([[t('inventory.po.fxRate'), `1 ${po.currency} = ${po.fxRate.toLocaleString()} ₭`]] as Array<[string, string]>) : []),
        ...(po.approvedByUserName ? ([[t('inventory.print.approvedBy'), po.approvedByUserName]] as Array<[string, string]>) : []),
      ],
      columns: [
        { label: '#' },
        { label: t('inventory.col.product') },
        { label: t('inventory.po.qty'), num: true },
        { label: t('inventory.po.unitCost'), num: true },
        { label: t('inventory.po.lineTotal'), num: true },
      ],
      rows: (po.items ?? []).map((it, i) => [
        String(i + 1),
        `${esc(it.productName)}<div class="muted">${esc(it.sku)}</div>`,
        it.uomCode && it.factorToBase !== 1
          ? `${esc(it.uomQty.toLocaleString())} ${esc(it.uomCode)}<div class="muted">= ${esc(it.quantity.toLocaleString())} ${esc(it.unit)}</div>`
          : `${esc(it.quantity.toLocaleString())} ${esc(it.unit)}`,
        esc(money(it.uomCode && it.factorToBase !== 1 ? it.uomUnitCost : it.unitCost, po.currency)),
        esc(money(it.lineTotal, po.currency)),
      ]),
      totals: [
        [t('inventory.po.total'), money(po.totalAmount, po.currency)],
        ...(po.currency !== 'LAK' ? ([['LAK', money(po.totalAmountLak)]] as Array<[string, string]>) : []),
      ],
      signatures: [t('inventory.po.preparedBy'), t('inventory.print.approvedBy'), t('inventory.print.supplierAck')],
    },
    t,
  );
}

export function printGoodsReceipt(grn: GoodsReceiptView, po: PurchaseOrderView, t: TFunction, business?: string): void {
  printDocument(
    {
      title: t('inventory.print.grn'),
      number: grn.grnNumber,
      business,
      meta: [
        [t('inventory.po.supplier'), po.supplierName],
        [t('inventory.col.branch'), po.branchName],
        [t('inventory.po.number'), grn.poNumber],
        [t('inventory.print.receivedAt'), dt(grn.receivedAt)],
        [t('inventory.grn.deliveryNote'), grn.supplierDeliveryNote ?? '—'],
        [t('inventory.po.receivedBy'), grn.receivedByUserName ?? '—'],
      ],
      columns: [
        { label: '#' },
        { label: t('inventory.col.product') },
        { label: t('inventory.lot.title') },
        { label: t('inventory.grn.receivedCol'), num: true },
        { label: t('inventory.print.rejected'), num: true },
        { label: t('inventory.po.unitCost'), num: true },
        { label: t('inventory.po.lineTotal'), num: true },
      ],
      rows: grn.lines.map((l, i) => [
        String(i + 1),
        `${esc(l.productName)}<div class="muted">${esc(l.sku)}</div>`,
        `${esc(l.lotNumber ?? '')}<div class="muted">${esc(l.expiryDate ?? '')}</div>`,
        `${esc(l.qtyReceived.toLocaleString())} ${esc(l.unit)}`,
        l.qtyRejected > 0 ? `${esc(l.qtyRejected.toLocaleString())}<div class="muted">${esc(l.rejectReason ?? '')}</div>` : '',
        esc(money(l.unitCost)),
        esc(money(l.lineValue)),
      ]),
      totals: [[t('inventory.po.total'), money(grn.totalValue)]],
      notes: grn.notes,
      signatures: [t('inventory.print.deliveredBy'), t('inventory.po.receivedBy'), t('inventory.print.checkedBy')],
    },
    t,
  );
}

export function printSupplierReturn(r: SupplierReturnView, t: TFunction, business?: string): void {
  printDocument(
    {
      title: t('inventory.print.rts'),
      number: r.returnNumber,
      business,
      meta: [
        [t('inventory.po.supplier'), r.supplierName],
        [t('inventory.col.branch'), r.branchName],
        [t('inventory.po.status'), t(`inventory.rts.st.${r.status}`)],
        [t('inventory.rts.reference'), [r.poNumber, r.grnNumber].filter(Boolean).join(' · ') || '—'],
        [t('inventory.rts.reason'), r.reason],
        [t('inventory.rts.postedAt'), dt(r.postedAt) || '—'],
      ],
      columns: [
        { label: '#' },
        { label: t('inventory.col.product') },
        { label: t('inventory.lot.title') },
        { label: t('inventory.po.qty'), num: true },
        { label: t('inventory.po.unitCost'), num: true },
        { label: t('inventory.rts.value'), num: true },
      ],
      rows: (r.lines ?? []).map((l, i) => [
        String(i + 1),
        `${esc(l.productName)}<div class="muted">${esc(l.sku)}</div>`,
        esc(l.lotNumber ?? ''),
        `${esc(l.qty.toLocaleString())} ${esc(l.unit)}`,
        esc(money(l.unitCost)),
        esc(money(l.value)),
      ]),
      totals: [[t('inventory.print.debitNote'), money(r.totalValue)]],
      notes: r.notes,
      signatures: [t('inventory.po.preparedBy'), t('inventory.print.approvedBy'), t('inventory.print.supplierAck')],
    },
    t,
  );
}
