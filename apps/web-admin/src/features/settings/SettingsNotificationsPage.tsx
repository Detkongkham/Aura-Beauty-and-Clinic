import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Layers, MessageSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/useAuth';
import { http } from '@/services/http';

import {
  NotificationTemplateCard,
  type NotifTemplate,
} from './components/NotificationTemplateCard';
import { SettingsTabs } from './SettingsTabs';

type ChannelFilter = 'all' | 'sms' | 'push';

export function SettingsNotificationsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings:manage');
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: async () => {
      const res = await http.get<{ data: { items: NotifTemplate[] } }>('/notification-templates');
      return res.data.data.items;
    },
  });

  const save = useMutation({
    mutationFn: ({ key, ...patch }: Partial<NotifTemplate> & { key: string }) =>
      http.put(`/notification-templates/${key}`, patch).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success(t('settings.saved'));
    },
    onError: () => toast.error(t('services.saveError')),
    onSettled: () => setSavingKey(null),
  });

  const stats = useMemo(() => {
    const forChannel = (channel: 'sms' | 'push') => {
      const items = data.filter((x) => x.channel === channel);
      return { total: items.length, active: items.filter((x) => x.enabled).length };
    };
    return {
      all: { total: data.length, active: data.filter((x) => x.enabled).length },
      sms: forChannel('sms'),
      push: forChannel('push'),
    };
  }, [data]);

  const filtered = filter === 'all' ? data : data.filter((x) => x.channel === filter);

  const tiles: {
    key: ChannelFilter;
    label: string;
    icon: typeof Layers;
    total: number;
    active: number;
    tint: string;
  }[] = [
    { key: 'all', label: t('notifTpl.stats.total'), icon: Layers, ...stats.all, tint: 'text-foreground' },
    { key: 'sms', label: 'SMS', icon: MessageSquare, ...stats.sms, tint: 'text-info' },
    { key: 'push', label: 'Push', icon: Bell, ...stats.push, tint: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.settingsNotifications')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('notifTpl.subtitle')}</p>
        </div>
        <SettingsTabs active="notifications" />
      </StickyPageHeader>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {tiles.map((tile) => {
              const isActive = filter === tile.key;
              const Icon = tile.icon;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setFilter(tile.key)}
                  aria-pressed={isActive}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left shadow-sm transition-all duration-150',
                    'hover:shadow-md',
                    isActive ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted',
                      tile.tint,
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-semibold leading-none text-foreground">
                        {tile.total}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{tile.label}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('notifTpl.stats.activeOf', { active: tile.active, total: tile.total })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BellOff className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">{t('notifTpl.empty')}</p>
              <Button size="sm" variant="secondary" onClick={() => setFilter('all')}>
                {t('notifTpl.filter.all')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((tpl, i) => (
                <NotificationTemplateCard
                  key={tpl.key}
                  tpl={tpl}
                  index={i}
                  canManage={canManage}
                  saving={save.isPending && savingKey === tpl.key}
                  onToggle={(enabled) => {
                    setSavingKey(tpl.key);
                    save.mutate({ key: tpl.key, enabled });
                  }}
                  onSave={(body) => {
                    setSavingKey(tpl.key);
                    save.mutate({ key: tpl.key, body });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
