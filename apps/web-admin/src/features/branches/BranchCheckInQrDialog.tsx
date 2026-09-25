import { buildBranchCheckInPayload } from '@abcp/shared-types';
import { Download, Printer, QrCode, ScanLine, Smartphone, Ticket } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Branch } from '@/types/models';

interface BranchCheckInQrDialogProps {
  branch: Branch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** escape ຂໍ້ຄວາມກ່ອນຂຽນລົງ HTML ຂອງໜ້າພິມ. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * QR Check-in ຂອງສາຂາ (Module 10) — ຕັ້ງໄວ້ເຄົາເຕີ້. ລູກຄ້າສະແກນດ້ວຍແອັບ Aura → `POST /queue/check-in`
 * ພ້ອມ branchId ນີ້ ເພື່ອຢືນຢັນວ່າມາຮອດສາຂາທີ່ມີນັດແທ້. payload ມາຈາກ shared-types ໃຫ້ກົງກັບ mobile.
 */
export function BranchCheckInQrDialog({ branch, open, onOpenChange }: BranchCheckInQrDialogProps) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const payload = buildBranchCheckInPayload(branch.id);

  const dataUrl = (): string | null => wrapRef.current?.querySelector('canvas')?.toDataURL('image/png') ?? null;

  const onDownload = () => {
    const url = dataUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `check-in-qr-${branch.code || branch.id}.png`;
    a.click();
  };

  const onPrint = () => {
    const url = dataUrl();
    const w = url ? window.open('', '_blank', 'width=600,height=800') : null;
    if (!w || !url) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(branch.name)}</title>
<style>body{font-family:'Noto Sans Lao',system-ui,sans-serif;text-align:center;padding:48px;color:#1E293B}
h1{font-family:'Plus Jakarta Sans',Inter,'Noto Sans Lao',system-ui,-apple-system,sans-serif;font-size:28px;margin:0 0 4px}h2{font-size:18px;font-weight:500;color:#64748B;margin:0 0 32px}
img{width:360px;height:360px}ol{display:inline-block;text-align:left;font-size:16px;line-height:1.9;margin-top:28px}
.brand{letter-spacing:.2em;color:#7C3AED;font-size:13px;margin-bottom:16px}</style></head><body>
<div class="brand">AURA</div><h1>${esc(t('branches.checkInQr.printTitle'))}</h1><h2>${esc(branch.name)}</h2>
<img src="${url}" alt="QR"/><br/><ol><li>${esc(t('branches.checkInQr.step1'))}</li><li>${esc(t('branches.checkInQr.step2'))}</li><li>${esc(t('branches.checkInQr.step3'))}</li></ol>
<script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  const steps = [
    { icon: Smartphone, text: t('branches.checkInQr.step1') },
    { icon: ScanLine, text: t('branches.checkInQr.step2') },
    { icon: Ticket, text: t('branches.checkInQr.step3') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <QrCode className="h-5 w-5" />
          </span>
          <div className="space-y-0.5 text-left">
            <DialogTitle>{t('branches.checkInQr.title')}</DialogTitle>
            <DialogDescription>{branch.name}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-5 bg-muted/30 px-6 py-6">
          <div
            ref={wrapRef}
            className="mx-auto flex w-fit flex-col items-center gap-2 rounded-2xl border border-border bg-white p-5 shadow-sm"
          >
            <QRCodeCanvas value={payload} size={220} level="M" marginSize={1} />
            <span className="font-mono text-[11px] text-slate-500">{branch.code}</span>
          </div>

          <ol className="space-y-2">
            {steps.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-foreground">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">{t('branches.checkInQr.hint')}</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="secondary" onClick={onDownload}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('branches.checkInQr.download')}
          </Button>
          <Button onClick={onPrint}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t('branches.checkInQr.print')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
