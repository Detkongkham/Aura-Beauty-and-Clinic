import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/router/paths';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-5xl text-primary">404</p>
      <p className="text-sm text-muted-foreground">{t('system.notFound')}</p>
      <Button asChild variant="secondary">
        <Link to={ROUTES.dashboard}>{t('nav.dashboard')}</Link>
      </Button>
    </div>
  );
}
