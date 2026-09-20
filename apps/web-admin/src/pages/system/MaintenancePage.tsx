import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Rendered by the app-level ErrorBoundary fallback when the app fails to boot. */
export function MaintenancePage({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Wrench className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl">{t('system.maintenanceTitle')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('system.maintenanceBody')}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {t('common.confirm')}
        </button>
      ) : null}
    </div>
  );
}
