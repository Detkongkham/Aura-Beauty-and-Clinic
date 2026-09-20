import { ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { ROUTES } from '@/router/paths';

export function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <ShieldX className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-display text-3xl">403</p>
      <p className="text-sm text-muted-foreground">{t('system.forbidden')}</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => navigate(ROUTES.dashboard)}>
          {t('nav.dashboard')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            logout();
            navigate(ROUTES.login);
          }}
        >
          {t('auth.logout')}
        </Button>
      </div>
    </div>
  );
}
