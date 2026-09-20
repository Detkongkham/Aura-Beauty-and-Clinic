import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Copy,
  Eye,
  Inbox,
  Mail,
  MailOpen,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DateTimeText } from '@/components/shared/DateTimeText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  CATEGORY_META,
  MODULE_ICON,
  SEVERITY_META,
  payloadEntries,
  relatedLink,
} from '../notificationModel';
import type { AppNotification, SingleAction } from '../notifications.api';
import { IconAction } from './NotificationRow';

interface NotificationDetailProps {
  n: AppNotification;
  lang: 'lo' | 'en';
  position: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onAction: (action: SingleAction) => void;
  onDelete: () => void;
  /** Hide the in-panel close button when a Sheet already renders one. */
  hideClose?: boolean;
  /** Id for the title — lets a surrounding Sheet/region reference it. */
  titleId?: string;
}

function TimelineStep({
  icon,
  tone,
  label,
  at,
  lang,
  extra,
  last,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  at: string | null;
  lang: 'lo' | 'en';
  extra?: ReactNode;
  last?: boolean;
}) {
  const pending = at == null;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last ? (
        <span
          aria-hidden="true"
          className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-border"
        />
      ) : null}
      <span
        className={cn(
          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
          pending ? 'border border-dashed border-border bg-card text-muted-foreground' : tone,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={cn('text-xs font-medium', pending && 'text-muted-foreground')}>{label}</p>
        {at ? (
          <p className="text-2xs tabular-nums text-muted-foreground">
            {formatDateTime(at)} · <DateTimeText value={at} mode="relative" locale={lang} />
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">–</p>
        )}
        {extra}
      </div>
    </li>
  );
}

/**
 * Reading pane for one notification — full body, related-record jump, a received → read →
 * resolved timeline, raw metadata (type code, payload, id) and triage actions.
 * Rendered inline on xl screens and inside a Sheet below that.
 */
export function NotificationDetail({
  n,
  lang,
  position,
  onPrev,
  onNext,
  onClose,
  onAction,
  onDelete,
  hideClose,
  titleId,
}: NotificationDetailProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const sev = SEVERITY_META[n.severity];
  const SevIcon = sev.icon;
  const ModuleIcon = MODULE_ICON[n.module];
  const CatIcon = CATEGORY_META[n.category].icon;
  const link = relatedLink(n);
  const payload = payloadEntries(n.data);

  const copyId = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(n.id).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={`notification-detail-${n.id}`}>
      {/* Pane toolbar */}
      <div
        className={cn(
          'flex items-center gap-1 border-b border-border px-3 py-2',
          hideClose && 'pr-12',
        )}
      >
        <span className="mr-auto text-2xs tabular-nums text-muted-foreground">
          {t('notifications.position', { index: position.index + 1, total: position.total })}
        </span>
        <IconAction
          label={t('notifications.prev')}
          onClick={() => onPrev?.()}
          className={!onPrev ? 'pointer-events-none opacity-40' : undefined}
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </IconAction>
        <IconAction
          label={t('notifications.next')}
          onClick={() => onNext?.()}
          className={!onNext ? 'pointer-events-none opacity-40' : undefined}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </IconAction>
        {!hideClose ? (
          <IconAction label={t('common.close')} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconAction>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {/* Heading */}
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              n.resolved ? 'bg-success-soft text-success' : sev.tile,
            )}
          >
            {n.resolved ? (
              <CircleCheck className="h-5 w-5" aria-hidden="true" />
            ) : (
              <SevIcon className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold leading-snug">
              {n.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={sev.badge}>
                <span className={cn('h-1.5 w-1.5 rounded-full', sev.dot)} aria-hidden="true" />
                {t(`notifications.severity.${n.severity}`)}
              </Badge>
              <Badge variant="neutral">
                <ModuleIcon className="h-3 w-3" aria-hidden="true" />
                {t(`notifications.module.${n.module}`)}
              </Badge>
              <Badge variant={n.resolved ? 'success' : n.read ? 'neutral' : 'primary'}>
                {n.resolved
                  ? t('notifications.resolved')
                  : n.read
                    ? t('notifications.statusRead')
                    : t('notifications.unread')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="rounded-lg border border-border bg-muted/30 p-3.5">
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
            {n.body}
          </p>
        </div>

        {link ? (
          <Button asChild variant="secondary" className="w-full justify-between">
            <Link to={link.to} data-testid="link-related">
              <span className="inline-flex items-center gap-2">
                <ModuleIcon className="h-4 w-4" aria-hidden="true" />
                {link.exact
                  ? t('notifications.openRecord')
                  : t('notifications.openModule', {
                      module: t(`notifications.module.${n.module}`),
                    })}
              </span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}

        {/* Lifecycle */}
        <section aria-labelledby="ntf-lifecycle">
          <h3 id="ntf-lifecycle" className="mb-3 text-xs font-semibold text-muted-foreground">
            {t('notifications.lifecycle')}
          </h3>
          <ol>
            <TimelineStep
              icon={<Inbox className="h-3.5 w-3.5" aria-hidden="true" />}
              tone="bg-primary/10 text-primary"
              label={t('notifications.stepReceived')}
              at={n.createdAt}
              lang={lang}
            />
            <TimelineStep
              icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              tone="bg-info-soft text-info"
              label={t('notifications.stepRead')}
              at={n.read ? (n.readAt ?? n.createdAt) : null}
              lang={lang}
            />
            <TimelineStep
              icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
              tone="bg-success-soft text-success"
              label={t('notifications.stepResolved')}
              at={n.resolvedAt}
              lang={lang}
              last
              extra={
                n.resolvedBy ? (
                  <p className="text-2xs text-muted-foreground">
                    {t('notifications.resolvedBy', { name: n.resolvedBy.name })}
                  </p>
                ) : null
              }
            />
          </ol>
        </section>

        {/* Metadata */}
        <section aria-labelledby="ntf-meta">
          <h3 id="ntf-meta" className="mb-2 text-xs font-semibold text-muted-foreground">
            {t('notifications.details')}
          </h3>
          <dl className="divide-y divide-border rounded-lg border border-border text-xs">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{t('notifications.fieldCategory')}</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium">
                <CatIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {t(`notifications.category.${n.category}`)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{t('notifications.fieldType')}</dt>
              <dd className="truncate font-mono text-2xs" title={n.type}>
                {n.type}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{t('notifications.fieldTime')}</dt>
              <dd className="font-medium tabular-nums">{formatDateTime(n.createdAt)}</dd>
            </div>
            {payload.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                <dt className="font-mono text-2xs text-muted-foreground">{k}</dt>
                <dd className="min-w-0 truncate font-mono text-2xs" title={v}>
                  {v}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <dt className="text-muted-foreground">{t('notifications.fieldId')}</dt>
              <dd className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-2xs text-muted-foreground" title={n.id}>
                  {n.id.slice(0, 8)}…
                </span>
                <IconAction
                  label={copied ? t('notifications.copied') : t('notifications.copyId')}
                  onClick={copyId}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </IconAction>
              </dd>
            </div>
          </dl>
          {payload.length === 0 ? (
            <p className="mt-2 text-2xs text-muted-foreground">{t('notifications.noPayload')}</p>
          ) : null}
        </section>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-3">
        {n.resolved ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAction('reopen')}
            data-testid="button-reopen"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('notifications.reopen')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => onAction('resolve')} data-testid="button-resolve">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {t('notifications.resolve')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction(n.read ? 'unread' : 'read')}
          data-testid="button-toggle-read"
        >
          {n.read ? (
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {n.read ? t('notifications.markUnread') : t('notifications.markRead')}
        </Button>
        <IconAction
          label={t('common.delete')}
          onClick={onDelete}
          className="ml-auto hover:bg-destructive-soft hover:text-destructive"
          testId="button-delete"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </IconAction>
      </div>
    </div>
  );
}
