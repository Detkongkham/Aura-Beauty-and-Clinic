import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsDark } from '@/hooks/useIsDark';
import { useUiStore } from '@/store/ui.store';

/**
 * Quick light/dark switch. 'system' preference is only reachable from Settings ▸
 * Appearance (and from the user menu, which shows all three).
 *
 * Both icons are always mounted and cross-faded/rotated into place — swapping
 * the element instead makes the icon pop in with no continuity, which reads as
 * a glitch at this size (MASTER.md §6: motion conveys the state change).
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const colorMode = useUiStore((s) => s.colorMode);
  const setColorMode = useUiStore((s) => s.setColorMode);
  const isDark = useIsDark();
  const label = t(isDark ? 'common.switchToLight' : 'common.switchToDark');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setColorMode(isDark ? 'light' : 'dark')}
          aria-label={label}
          className="relative h-9 w-9 overflow-hidden"
        >
          <Sun
            className={iconClass(isDark, 'rotate-0 scale-100 opacity-100', '-rotate-90 scale-50 opacity-0')}
            aria-hidden="true"
          />
          <Moon
            className={iconClass(!isDark, 'rotate-0 scale-100 opacity-100', 'rotate-90 scale-50 opacity-0')}
            aria-hidden="true"
          />
          <span className="sr-only">
            {colorMode === 'system' ? t('settings.colorMode.system') : ''}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Both icons sit in the same grid cell; only one is visible at a time. */
function iconClass(shown: boolean, on: string, off: string): string {
  return [
    'absolute h-4 w-4 transition-all duration-300 ease-out motion-reduce:transition-none',
    shown ? on : off,
  ].join(' ');
}
