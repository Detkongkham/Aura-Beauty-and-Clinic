import { useTranslation } from 'react-i18next';

import { useSettings } from '@/features/settings/settings.api';
import { formatDate, formatDateTime } from '@/lib/format';

interface Props {
  branchName: string;
  from: string;
  to: string;
}

/**
 * Only rendered on paper — gives the printout a title block the on-screen
 * chrome (toolbar, tabs) can't provide. Business name + logo come live from
 * Settings ▸ Business profile (shares the `['settings']` query cache the rest
 * of the app already warms, so this costs nothing extra) instead of a
 * hardcoded string, so a rename/rebrand in Settings shows up on the next print.
 */
export function PrintHeader({ branchName, from, to }: Props) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();

  return (
    <div className="hidden print:mb-4 print:flex print:items-start print:gap-3" aria-hidden="true">
      {settings?.logoUrl ? (
        <img src={settings.logoUrl} alt="" className="h-10 w-10 shrink-0 object-contain" />
      ) : null}
      <div>
        <p className="text-xl font-bold text-foreground">{t('reports.title')}</p>
        <p className="text-sm text-muted-foreground">
          {settings?.businessName ?? t('reports.businessName')} · {branchName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(from)} – {formatDate(to)} ·{' '}
          {t('reports.generatedAt', { at: formatDateTime(new Date()) })}
        </p>
      </div>
    </div>
  );
}
