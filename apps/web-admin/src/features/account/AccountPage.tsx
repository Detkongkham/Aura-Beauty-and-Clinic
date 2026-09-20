import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/useAuth';

export function AccountPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.account')} description={t('account.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('account.profile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label={t('users.name')} value={user?.name ?? '–'} />
            <Row label={t('auth.phone')} value={user?.phone ?? '–'} />
            <Row label={t('users.email')} value={user?.email ?? '–'} />
            <Row
              label={t('users.role')}
              value={user ? <Badge variant="primary">{user.role}</Badge> : '–'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('account.preferences')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('common.language')}</span>
              <LanguageToggle />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('account.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cur">{t('account.currentPassword')}</Label>
            <Input id="cur" type="password" autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">{t('auth.newPassword')}</Label>
            <Input id="new" type="password" autoComplete="new-password" />
          </div>
          <Button className="mt-1 w-fit" disabled>
            {t('common.save')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('account.passwordNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
