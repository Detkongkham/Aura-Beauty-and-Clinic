import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

const LANGS = [
  { code: 'lo', label: 'ລາວ' },
  { code: 'en', label: 'EN' },
] as const;

/**
 * Two-segment language switch. The old version was a single button that
 * *cycled* — you could only learn what it would do by pressing it, and it
 * showed the current language while its aria-label announced the next one.
 * A segmented control shows both options and which one is active, so it is
 * self-describing in either language.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage === 'en' ? 'en' : 'lo';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn(
        'hidden h-8 shrink-0 items-center gap-0.5 rounded-full border border-border/80 bg-muted/50 p-0.5 sm:inline-flex',
        className,
      )}
    >
      {LANGS.map((l) => {
        const active = current === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => void i18n.changeLanguage(l.code)}
            aria-pressed={active}
            aria-label={`${t('common.language')}: ${l.label}`}
            className={cn(
              'inline-flex h-7 min-w-[2rem] items-center justify-center rounded-full px-2 text-2xs font-semibold',
              'transition-colors duration-150 ease-out',
              active
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
