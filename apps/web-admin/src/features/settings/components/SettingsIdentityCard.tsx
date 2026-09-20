import { Clock, Coins, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface SettingsIdentityCardProps {
  logoUrl: string;
  businessName: string;
  legalName: string;
  displayCurrency: string;
  timezone: string;
  defaultLanguage: 'lo' | 'en';
  className?: string;
}

/** "Face" strip atop Settings — the business's own identity, at a glance. */
export function SettingsIdentityCard({
  logoUrl,
  businessName,
  legalName,
  displayCurrency,
  timezone,
  defaultLanguage,
  className,
}: SettingsIdentityCardProps) {
  const { t } = useTranslation();

  const chips = [
    { icon: Coins, label: displayCurrency },
    { icon: Clock, label: timezone },
    { icon: Languages, label: t(`settings.language.${defaultLanguage}`) },
  ];

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-border bg-gradient-to-br from-primary-subtle/60 via-card to-card px-4 py-3 shadow-sm',
        'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none',
        className,
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
        <img src={logoUrl?.trim() || '/logo.png'} alt="" className="h-full w-full object-contain" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-base font-semibold leading-tight text-foreground">
          {businessName}
        </h2>
        {legalName ? <p className="truncate text-xs text-muted-foreground">{legalName}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
          >
            <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
