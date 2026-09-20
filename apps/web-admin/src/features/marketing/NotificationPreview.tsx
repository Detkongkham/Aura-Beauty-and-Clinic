import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { notificationBody } from './campaigns.lib';

interface NotificationPreviewProps {
  title: string;
  body: string;
  discountCode?: string | null;
  className?: string;
}

/**
 * Lock-screen style preview of the push a customer receives — the body is built with
 * `notificationBody()` so the appended discount code matches what the backend sends.
 */
export function NotificationPreview({ title, body, discountCode, className }: NotificationPreviewProps) {
  const { t } = useTranslation();
  const hasContent = Boolean(title.trim() || body.trim());

  return (
    <div
      className={cn(
        'rounded-xl bg-gradient-to-br from-primary/15 via-accent/10 to-info/15 p-3',
        className,
      )}
    >
      <div className="rounded-lg border border-border/60 bg-card/90 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bell className="h-3 w-3" aria-hidden="true" />
          </span>
          <span className="font-medium text-foreground">{t('campaigns.preview.app')}</span>
          <span className="ml-auto">{t('campaigns.preview.now')}</span>
        </div>
        {hasContent ? (
          <>
            <p className="mt-2 line-clamp-1 text-sm font-semibold text-foreground">{title || '…'}</p>
            <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
              {notificationBody(body || '…', discountCode?.trim() || null)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs italic text-muted-foreground">{t('campaigns.preview.empty')}</p>
        )}
      </div>
    </div>
  );
}
