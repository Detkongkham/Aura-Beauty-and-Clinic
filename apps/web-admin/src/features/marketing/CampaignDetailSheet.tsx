import { useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Play, Search, Send, Target, Ticket, TrendingUp, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CampaignView } from '@abcp/shared-types';

import { DateTimeText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import { TYPE_META, audienceRule, conversionRate, formatRate } from './campaigns.lib';
import { useCampaignRecipients } from './marketing.api';
import { NotificationPreview } from './NotificationPreview';

type RecipientFilter = 'all' | 'converted' | 'pending';

interface CampaignDetailSheetProps {
  campaign: CampaignView | null;
  canManage: boolean;
  onClose: () => void;
  onRun: (c: CampaignView) => void;
  onEdit: (c: CampaignView) => void;
}

/** Campaign drill-down: performance tiles, audience rule, message preview and the recipient log. */
export function CampaignDetailSheet({ campaign, canManage, onClose, onRun, onEdit }: CampaignDetailSheetProps) {
  const { t } = useTranslation();
  const { data: recipients = [], isLoading } = useCampaignRecipients(campaign?.id ?? null);
  const [filter, setFilter] = useState<RecipientFilter>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const converted = recipients.filter((r) => r.convertedAt).length;
    return { all: recipients.length, converted, pending: recipients.length - converted };
  }, [recipients]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recipients.filter((r) => {
      if (filter === 'converted' && !r.convertedAt) return false;
      if (filter === 'pending' && r.convertedAt) return false;
      return !needle || r.userName.toLowerCase().includes(needle);
    });
  }, [recipients, filter, q]);

  const meta = campaign ? TYPE_META[campaign.type] : null;
  const Icon = meta?.icon;
  const rate = campaign ? conversionRate(campaign.recipientCount, campaign.convertedCount) : null;
  const rule = campaign ? audienceRule(campaign) : null;

  return (
    <Sheet
      open={Boolean(campaign)}
      onOpenChange={(o) => {
        if (!o) {
          setFilter('all');
          setQ('');
          onClose();
        }
      }}
    >
      <SheetContent className="gap-0 p-0">
        {campaign && meta && Icon && rule ? (
          <>
            <SheetHeader className="pr-10">
              <div className="flex items-start gap-3">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', meta.chip)}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{campaign.name}</SheetTitle>
                  <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span>{t(`campaigns.type.${campaign.type}`)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{campaign.branchName}</span>
                    <StatusDot active={campaign.isActive} />
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <SheetBody className="space-y-5 py-4">
              <div className="grid grid-cols-3 gap-2">
                <MiniTile icon={Send} tone="info" label={t('campaigns.stat.reached')} value={campaign.recipientCount.toLocaleString()} />
                <MiniTile icon={CheckCircle2} tone="success" label={t('campaigns.stat.converted')} value={campaign.convertedCount.toLocaleString()} />
                <MiniTile icon={TrendingUp} tone="accent" label={t('campaigns.stat.rate')} value={formatRate(rate)} />
              </div>

              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t('campaigns.detail.setup')}</h3>
                <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                  <DetailRow icon={Target} label={t('campaigns.col.audience')}>
                    {t(rule.key, rule.params)}
                  </DetailRow>
                  <DetailRow icon={Ticket} label={t('campaigns.discountCode')}>
                    {campaign.discountCode ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                        {campaign.discountCode}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">{t('campaigns.detail.noCode')}</span>
                    )}
                  </DetailRow>
                  <DetailRow label={t('campaigns.detail.created')}>
                    <DateTimeText value={campaign.createdAt} className="text-xs" />
                  </DetailRow>
                  <DetailRow label={t('campaigns.col.updated')}>
                    <DateTimeText value={campaign.updatedAt} className="text-xs" />
                  </DetailRow>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t('campaigns.detail.message')}</h3>
                {campaign.message ? (
                  <NotificationPreview
                    title={campaign.message.title}
                    body={campaign.message.body}
                    discountCode={campaign.discountCode}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('campaigns.detail.noMessage')}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t('campaigns.recipients')}{' '}
                    <span className="tabular-nums">({counts.all.toLocaleString()})</span>
                  </h3>
                  {counts.all >= 500 ? (
                    <span className="text-2xs text-muted-foreground">{t('campaigns.detail.cap')}</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div role="tablist" aria-label={t('campaigns.recipients')} className="inline-flex rounded-md bg-muted p-0.5">
                    {(['all', 'converted', 'pending'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={filter === key}
                        onClick={() => setFilter(key)}
                        className={cn(
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                          filter === key
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t(`campaigns.detail.filter.${key}`)}{' '}
                        <span className="tabular-nums text-muted-foreground">{counts[key]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="relative min-w-[140px] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t('campaigns.detail.searchRecipients')}
                      aria-label={t('campaigns.detail.searchRecipients')}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : visible.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {counts.all === 0 ? t('campaigns.noRecipients') : t('campaigns.detail.noMatch')}
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {visible.map((r) => (
                      <li key={r.id} className="flex items-center gap-2.5 px-3 py-2">
                        <PersonAvatar name={r.userName} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.userName}</p>
                          <p className="text-2xs text-muted-foreground">
                            {t('campaigns.detail.sentAt')} <DateTimeText value={r.sentAt} />
                          </p>
                        </div>
                        {r.convertedAt ? (
                          <div className="text-right">
                            <Badge variant="success" className="text-2xs">
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              {t('campaigns.converted')}
                            </Badge>
                            <p className="mt-0.5 text-2xs text-muted-foreground">
                              <DateTimeText value={r.convertedAt} />
                            </p>
                          </div>
                        ) : (
                          <Badge variant="neutral" className="text-2xs">
                            {r.status === 'SENT' ? t('campaigns.detail.status.SENT') : r.status}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </SheetBody>

            <SheetFooter>
              {canManage ? (
                <>
                  <Button variant="secondary" onClick={() => onEdit(campaign)}>
                    <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                  <Button onClick={() => onRun(campaign)}>
                    <Play className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('campaigns.run')}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={onClose}>
                  {t('common.close')}
                </Button>
              )}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function StatusDot({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium',
        active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-success motion-safe:animate-pulse' : 'bg-muted-foreground/60')}
        aria-hidden="true"
      />
      {active ? t('campaigns.status.active') : t('campaigns.inactiveTag')}
    </span>
  );
}

const MINI_TONE = {
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  accent: 'bg-accent-soft text-accent-foreground',
} as const;

function MiniTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: keyof typeof MINI_TONE;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded', MINI_TONE[tone])}>
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="truncate text-2xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">{value}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-sm">{children}</dd>
    </div>
  );
}
