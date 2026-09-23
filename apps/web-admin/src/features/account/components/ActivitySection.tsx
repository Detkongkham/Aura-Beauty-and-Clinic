import {
  Activity,
  Boxes,
  Building2,
  CalendarDays,
  CreditCard,
  Gift,
  History,
  KeyRound,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Scissors,
  Settings,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';

import { useAccountActivity } from '../account.api';
import { groupByDay, humanizeVerb, splitAction } from '../accountModel';

const HEAD_ICON: Record<string, LucideIcon> = {
  auth: KeyRound,
  appointment: CalendarDays,
  service: Scissors,
  staff: UsersRound,
  customer: Users,
  users: UserCog,
  settings: Settings,
  branch: Building2,
  queue: ListChecks,
  payment: CreditCard,
  giftcard: Gift,
  marketing: Megaphone,
  product: Boxes,
  stock: Boxes,
  supplier: Boxes,
  purchase_order: Boxes,
  conversation: MessagesSquare,
};

interface ActivitySectionProps {
  index: number;
}

/** The signed-in user's own audit trail — "what did I do, and from where". */
export function ActivitySection({ index }: ActivitySectionProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAccountActivity();
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86_400_000));
  const dayLabel = (d: string) =>
    d === today
      ? t('account.activity.today')
      : d === yesterday
        ? t('account.activity.yesterday')
        : d;

  const label = (head: string, verb: string) => {
    if (head === 'auth')
      return t(`account.activity.auth.${verb}`, { defaultValue: humanizeVerb(verb) });
    const entity = t(`account.activity.entity.${head}`, {
      defaultValue: t(`audit.category.${head}`, { defaultValue: humanizeVerb(head) }),
    });
    return t('account.activity.generic', {
      entity,
      verb: t(`account.activity.verb.${verb}`, { defaultValue: humanizeVerb(verb) }),
    });
  };

  return (
    <SettingsSection
      id="acc-activity"
      icon={History}
      index={index}
      title={t('account.activity.title')}
      desc={t('account.activity.desc')}
    >
      {isLoading ? (
        <div className="space-y-2 py-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 py-4 text-sm">
          <span className="text-muted-foreground">{t('account.loadError')}</span>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-2">
          <EmptyState
            icon={Activity}
            title={t('account.activity.empty')}
            description={t('account.activity.emptyHint')}
          />
        </div>
      ) : (
        <div className="py-3">
          {groupByDay(items, (iso) => formatDate(iso)).map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)} className="mb-3 last:mb-0">
              <h3 className="mb-1.5 text-2xs font-semibold text-muted-foreground">
                {dayLabel(g.day)}
              </h3>
              <ol className="relative ml-4 space-y-0.5 border-l border-border pl-5">
                {g.items.map((it) => {
                  const { head, verb } = splitAction(it.action, it.entityName);
                  const Icon = HEAD_ICON[head] ?? Activity;
                  const security = head === 'auth';
                  return (
                    <li
                      key={it.id}
                      className="relative flex items-center gap-3 rounded-lg py-1.5 pr-1"
                    >
                      <span
                        className={
                          'absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-card ' +
                          (security
                            ? 'bg-accent-soft text-accent-foreground'
                            : 'bg-primary-subtle text-primary')
                        }
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-foreground">{label(head, verb)}</p>
                        {it.ipAddress ? (
                          <p className="truncate text-2xs tabular-nums text-muted-foreground">
                            IP {it.ipAddress}
                          </p>
                        ) : null}
                      </div>
                      <time
                        dateTime={it.createdAt}
                        title={formatDateTime(it.createdAt)}
                        className="shrink-0 text-xs tabular-nums text-muted-foreground"
                      >
                        {formatTime(it.createdAt)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {hasNextPage ? (
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? t('common.loading') : t('account.activity.loadMore')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}
