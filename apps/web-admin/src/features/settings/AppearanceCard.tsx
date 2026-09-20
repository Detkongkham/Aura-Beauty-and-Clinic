import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { COLOR_MODES, THEME_COLORS, useUiStore, type ColorMode, type ThemeColor } from '@/store/ui.store';

import { SettingsRow } from './components/SettingsRow';

const MODE_ICON: Record<ColorMode, typeof Sun> = { light: Sun, dark: Moon, system: Laptop };

/**
 * Preview swatches per tone — the same 4-step ramp defined in index.css
 * ([data-theme] blocks): subtle · primary · hover · strong. Hard-coded here so
 * the preview is accurate no matter which tone is currently live.
 */
const RAMP: Record<ThemeColor, [string, string, string, string]> = {
  azure: ['#E0F2FE', '#0369A1', '#0284C7', '#075985'],
  teal: ['#CCFBF1', '#0F766E', '#0D9488', '#115E59'],
  indigo: ['#E0E7FF', '#4338CA', '#4F46E5', '#3730A3'],
  cobalt: ['#DBEAFE', '#1D4ED8', '#2563EB', '#1E40AF'],
};

/** Card-less appearance controls (tone + table density) — lives inside a SettingsSection. */
export function AppearanceControls() {
  const { t } = useTranslation();
  const themeColor = useUiStore((s) => s.themeColor);
  const setThemeColor = useUiStore((s) => s.setThemeColor);
  const colorMode = useUiStore((s) => s.colorMode);
  const setColorMode = useUiStore((s) => s.setColorMode);
  const tableDensity = useUiStore((s) => s.tableDensity);
  const setTableDensity = useUiStore((s) => s.setTableDensity);

  const choose = (next: ThemeColor) => {
    if (next === themeColor) return;
    setThemeColor(next);
    toast.success(t('settings.themeApplied'));
  };

  const chooseMode = (next: ColorMode) => {
    if (next === colorMode) return;
    setColorMode(next);
    toast.success(t('settings.colorModeApplied'));
  };

  return (
    <>
      <SettingsRow label={t('settings.colorMode.label')} hint={t('settings.colorMode.hint')} trailing>
        <div role="radiogroup" aria-label={t('settings.colorMode.label')} className="flex rounded-lg border border-input bg-muted p-0.5">
          {COLOR_MODES.map((mode) => {
            const selected = mode === colorMode;
            const Icon = MODE_ICON[mode];
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseMode(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors',
                  selected ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`settings.colorMode.${mode}`)}
              </button>
            );
          })}
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.themeColor')} hint={t('settings.themeColorHint')} stack>
        <div role="radiogroup" aria-label={t('settings.themeColor')} className="grid gap-3 sm:grid-cols-2">
          {THEME_COLORS.map((tone) => {
            const selected = tone === themeColor;
            return (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(tone)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors',
                  'hover:bg-muted',
                  selected ? 'border-primary ring-1 ring-primary' : 'border-input',
                )}
              >
                <span className="flex shrink-0 overflow-hidden rounded-sm border border-border">
                  {RAMP[tone].map((hex) => (
                    <span key={hex} className="h-6 w-4" style={{ backgroundColor: hex }} />
                  ))}
                </span>
                <span className="flex-1 text-[13px] font-medium">{t(`settings.theme.${tone}`)}</span>
                {selected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.tableDensity')} hint={t('settings.tableDensityHint')} trailing>
        <div role="radiogroup" aria-label={t('settings.tableDensity')} className="flex rounded-lg border border-input bg-muted p-0.5">
          {(['standard', 'compact'] as const).map((d) => {
            const selected = d === tableDensity;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTableDensity(d)}
                className={cn(
                  'rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors',
                  selected ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`settings.density.${d}`)}
              </button>
            );
          })}
        </div>
      </SettingsRow>
    </>
  );
}
