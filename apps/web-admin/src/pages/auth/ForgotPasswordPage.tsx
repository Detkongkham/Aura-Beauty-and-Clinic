import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/router/paths';

/** Stub — wired to a real endpoint in step 4/Phase 5. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="font-display text-2xl text-primary">{t('auth.forgotPassword')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.forgotSubtitle')}</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <Input id="phone" type="tel" autoComplete="username" />
          </div>
          <Button type="submit" className="w-full" disabled>
            {t('auth.sendResetLink')}
          </Button>
          <div className="text-center">
            <Link to={ROUTES.login} className="text-xs text-primary hover:underline">
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
