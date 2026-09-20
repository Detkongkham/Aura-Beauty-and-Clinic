import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { formatDateTime } from '@/lib/format';

import { ReportSection } from './components/ReportSection';
import { ExportPanel } from './import-export/ExportPanel';
import { ImportPanel } from './import-export/ImportPanel';

export function ImportExportPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.importExport')} description={t('importExport.subtitle')} />

      {/* document strip — mirrors the reports masthead */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted px-4 py-2">
          <span className="font-display text-[15px] font-semibold text-foreground">
            {t('reports.businessName')}
          </span>
          <span className="text-[11px] text-muted-foreground">· {t('importExport.docTitle')}</span>
        </div>
        <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {t('importExport.docBlurb')}
          <span aria-hidden="true" className="mx-2 text-border">
            ·
          </span>
          {t('reports.generatedAt', { at: formatDateTime(new Date()) })}
        </p>
      </div>

      <ReportSection
        index={1}
        title={t('importExport.export.title')}
        desc={t('importExport.export.desc')}
        actions={<ArrowDownToLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        insight={t('importExport.export.insight')}
      >
        <ExportPanel />
      </ReportSection>

      <ReportSection
        index={2}
        title={t('importExport.import.title')}
        desc={t('importExport.import.desc')}
        actions={<ArrowUpFromLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        insight={t('importExport.import.insight')}
      >
        <ImportPanel />
      </ReportSection>
    </div>
  );
}
