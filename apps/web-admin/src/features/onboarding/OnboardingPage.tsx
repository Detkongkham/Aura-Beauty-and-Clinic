import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

const STEP_KEYS = ['branch', 'admin', 'services'] as const;

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const isLast = step === STEP_KEYS.length - 1;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <div className="text-center">
        <p className="font-display text-2xl text-primary">{t('app.name')}</p>
        <p className="text-sm text-muted-foreground">{t('onboarding.subtitle')}</p>
      </div>

      <ol className="flex items-center justify-center gap-2">
        {STEP_KEYS.map((k, i) => (
          <li key={k} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                i < step
                  ? 'bg-success text-success-foreground'
                  : i === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            {i < STEP_KEYS.length - 1 ? <span className="h-px w-8 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{t(`onboarding.step.${STEP_KEYS[step]}.title`)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(`onboarding.step.${STEP_KEYS[step]}.body`)}
          </p>
          {step === 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="ob-branch">{t('branches.name')}</Label>
              <Input id="ob-branch" defaultValue="Aura Vientiane Centre" />
            </div>
          ) : step === 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="ob-admin">{t('users.name')}</Label>
              <Input id="ob-admin" defaultValue="Souphaphone Admin" />
            </div>
          ) : (
            <p className="rounded-sm bg-muted px-3 py-2 text-sm">{t('onboarding.seededNote')}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          {t('pagination.prev')}
        </Button>
        {isLast ? (
          <Button onClick={() => navigate(ROUTES.dashboard)}>{t('onboarding.finish')}</Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)}>{t('pagination.next')}</Button>
        )}
      </div>
    </div>
  );
}
