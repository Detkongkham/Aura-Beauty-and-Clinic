import { Check, Mail, MailOpen, RotateCcw } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { DateTimeText } from '@/components/shared/DateTimeText';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { MODULE_ICON, SEVERITY_META } from '../notificationModel';
import type { AppNotification, SingleAction } from '../notifications.api';

export function IconAction({
  label,
  onClick,
  children,
  className,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          aria-label={label}
          data-testid={testId}
          className={cn(
            'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150',
            'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface NotificationRowProps {
  n: AppNotification;
  active: boolean;
  checked: boolean;
  lang: 'lo' | 'en';
  index: number;
  onOpen: () => void;
  onToggleCheck: () => void;
  onAction: (action: SingleAction) => void;
}

/**
 * One inbox line: select box · module icon tinted by severity · title/preview/meta · hover actions.
 * The main area is a real <button> (opens the detail); checkbox and quick actions sit beside it,
 * never nested, so every control stays individually focusable.
 */
export const NotificationRow = forwardRef<HTMLButtonElement, NotificationRowProps>(
  function NotificationRow(
    { n, active, checked, lang, index, onOpen, onToggleCheck, onAction },
    ref,
  ) {
    const { t } = useTranslation();
    const sev = SEVERITY_META[n.severity];
    const ModuleIcon = MODULE_ICON[n.module];
    const unread = !n.read;

    return (
      <li
        className={cn(
          'group relative flex items-start gap-2 border-b border-border/70 px-2 py-2.5 last:border-b-0 sm:px-3',
          'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out motion-reduce:animate-none',
          'transition-colors duration-150',
          active ? 'bg-primary/[0.06]' : checked ? 'bg-muted/60' : 'hover:bg-muted/40',
        )}
        style={index > 0 && index < 16 ? { animationDelay: `${index * 18}ms` } : undefined}
        data-testid={`notification-${n.id}`}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-1.5 left-0 w-[3px] rounded-r-full transition-opacity duration-150',
            active
              ? 'bg-primary opacity-100'
              : cn(sev.bar, unread && !n.resolved ? 'opacity-100' : 'opacity-0'),
          )}
        />

        <div className="flex h-9 items-center pl-1">
          <Checkbox
            checked={checked}
            onChange={onToggleCheck}
            aria-label={t('notifications.selectOne', { title: n.title })}
            className="cursor-pointer"
          />
        </div>

        <button
          ref={ref}
          type="button"
          onClick={onOpen}
          aria-current={active ? 'true' : undefined}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <span
            className={cn(
              'relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              n.resolved ? 'bg-success-soft text-success' : sev.tile,
            )}
          >
            <ModuleIcon className="h-4 w-4" aria-hidden="true" />
            {n.resolved ? (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-card">
                <Check className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            ) : n.severity === 'critical' ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card motion-safe:animate-pulse"
                aria-hidden="true"
              />
            ) : null}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85',
                  n.resolved && 'text-muted-foreground',
                )}
                title={n.title}
              >
                {n.title}
              </span>
              <DateTimeText
                value={n.createdAt}
                mode="relative"
                locale={lang}
                className={cn(
                  'shrink-0 text-2xs tabular-nums',
                  unread ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              />
            </span>
            <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{n.body}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
              <span className={cn('inline-flex items-center gap-1 font-medium', sev.text)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', sev.dot)} aria-hidden="true" />
                {t(`notifications.severity.${n.severity}`)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{t(`notifications.module.${n.module}`)}</span>
              {n.resolved ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-success">{t('notifications.resolved')}</span>
                </>
              ) : null}
              {unread ? <span className="sr-only">{t('notifications.unread')}</span> : null}
            </span>
          </span>
        </button>

        {/* Quick actions — always visible on touch, reveal on hover/focus for pointer devices. */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 self-center transition-opacity duration-150',
            // md+: float over the timestamp on hover/focus instead of reserving a column.
            'md:absolute md:right-2 md:top-1.5 md:rounded-lg md:border md:border-border md:bg-card md:p-0.5 md:shadow-sm',
            'md:pointer-events-none md:opacity-0 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100',
          )}
        >
          <IconAction
            label={unread ? t('notifications.markRead') : t('notifications.markUnread')}
            onClick={() => onAction(unread ? 'read' : 'unread')}
            testId={`button-toggle-read-${n.id}`}
          >
            {unread ? (
              <MailOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mail className="h-4 w-4" aria-hidden="true" />
            )}
          </IconAction>
          <IconAction
            label={n.resolved ? t('notifications.reopen') : t('notifications.resolve')}
            onClick={() => onAction(n.resolved ? 'reopen' : 'resolve')}
            className={n.resolved ? undefined : 'hover:bg-success-soft hover:text-success'}
            testId={`button-toggle-resolve-${n.id}`}
          >
            {n.resolved ? (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
          </IconAction>
        </div>
      </li>
    );
  },
);
