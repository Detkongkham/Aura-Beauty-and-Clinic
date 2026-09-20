import { useTranslation } from 'react-i18next';

/** Methodology notes — gives the report the provenance a dashboard never states. */
export function ReportFootnotes() {
  const { t } = useTranslation();
  const notes = [
    t('reports.footnote.window'),
    t('reports.footnote.tz'),
    t('reports.footnote.revenue'),
    t('reports.footnote.source'),
  ];
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
        {t('reports.footnote.title')}
      </p>
      <ol className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="tabular-nums text-muted-foreground/60">{i + 1}.</span>
            <span>{n}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
