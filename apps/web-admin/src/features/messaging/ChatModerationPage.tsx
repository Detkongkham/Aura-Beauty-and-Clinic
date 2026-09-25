import { useState } from 'react';
import { Ban, Flag, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { EmptyState } from '@/components/shared/EmptyState';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import { NormalizedApiError } from '@/services/apiError';

import { useChatBlocks, useChatReports, useReviewChatReport } from './messaging.api';

type StatusFilter = 'PENDING' | 'REVIEWED' | 'ACTIONED' | undefined | 'BLOCKS';

const STATUS_VARIANT: Record<
  'PENDING' | 'REVIEWED' | 'ACTIONED',
  NonNullable<BadgeProps['variant']>
> = {
  PENDING: 'warning',
  REVIEWED: 'info',
  ACTIONED: 'danger',
};

/** /settings/chat-moderation — Module 38 Wave 8D. Admin queue for DIRECT chat reports:
 * REVIEWED = looked at, no action; ACTIONED = also locks the reported conversation. */
export function ChatModerationPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const reports = useChatReports(status === 'BLOCKS' ? undefined : status);
  const blocks = useChatBlocks(status === 'BLOCKS');
  const review = useReviewChatReport();

  const onReview = (id: string, next: 'REVIEWED' | 'ACTIONED') => {
    review.mutate(
      { id, status: next },
      {
        onError: (err) => {
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.chatModeration')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('chatModeration.subtitle')}</p>
        </div>
        <SettingsTabs active="chatModeration" />
      </StickyPageHeader>

      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
        {(['PENDING', 'REVIEWED', 'ACTIONED', undefined, 'BLOCKS'] as StatusFilter[]).map((s) => (
          <button
            key={s ?? 'ALL'}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={
              status === s
                ? 'rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground'
                : 'rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted'
            }
          >
            {s === 'BLOCKS'
              ? t('chatModeration.blocks')
              : s
                ? t(`chatModeration.status.${s}`)
                : t('chatModeration.status.ALL')}
          </button>
        ))}
      </div>

      {status === 'BLOCKS' ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {blocks.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !blocks.data || blocks.data.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={t('chatModeration.noBlocks')}
              className="border-0"
            />
          ) : (
            <ul className="divide-y divide-border">
              {blocks.data.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm text-foreground">
                      <Ban className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                      {t('chatModeration.blockLine', {
                        blocker: b.blockerName,
                        blocked: b.blockedName,
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <DateTimeText value={b.createdAt} mode="relative" />
                    </p>
                  </div>
                  {b.blockedCount > 1 ? (
                    <Badge variant={b.blockedCount >= 3 ? 'danger' : 'warning'}>
                      {t('chatModeration.blockedBy', { count: b.blockedCount })}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {reports.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !reports.data || reports.data.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={t('chatModeration.empty')}
              description={t('chatModeration.emptyHint')}
              className="border-0"
            />
          ) : (
            <ul className="divide-y divide-border">
              {reports.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-destructive" aria-hidden="true" />
                      <span className="text-sm font-semibold text-foreground">
                        {r.reportedByName}
                      </span>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {t(`chatModeration.status.${r.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">{r.reason}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <DateTimeText value={r.createdAt} mode="relative" />
                    </p>
                  </div>
                  {r.status === 'PENDING' ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onReview(r.id, 'REVIEWED')}
                        disabled={review.isPending}
                      >
                        {t('chatModeration.markReviewed')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onReview(r.id, 'ACTIONED')}
                        disabled={review.isPending}
                      >
                        {t('chatModeration.lockConversation')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
