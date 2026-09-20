import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Offline banner chip — renders only while the browser reports no connection,
 * so it costs nothing visually on a normal day but explains the console's
 * behaviour on a bad one (stale figures, failing saves) before the operator
 * starts blaming the data.
 */
export function ConnectionStatus() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 text-xs font-semibold text-warning"
        >
          <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('system.offline')}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem]">
        {t('system.offlineHint')}
      </TooltipContent>
    </Tooltip>
  );
}
