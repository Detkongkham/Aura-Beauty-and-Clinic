import { CalendarClock, CalendarPlus, ReceiptText, Scissors, Search, Ticket, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useNavGroups } from '@/components/layout/useNavGroups';
import { useAuth } from '@/features/auth/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { useGlobalSearch } from './useGlobalSearch';

interface Item {
  id: string;
  label: string;
  sub?: string;
  to: string;
  icon: typeof Search;
  group: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 200);
  const { data } = useGlobalSearch(debounced);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const { hasPermission } = useAuth();
  const groups = useNavGroups(hasPermission);

  /** Every module the user can open (same list as the sidebar / portal), searchable by name, blurb or group. */
  const modules = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items
          .flatMap((it) => (it.children?.length ? it.children : [it]))
          .map((it) => ({
            id: `m-${it.to}`,
            label: t(`nav.${it.labelKey}`),
            sub: t(`nav.${g.labelKey}`),
            haystack: [
              t(`nav.${it.labelKey}`),
              t(`portal.desc.${it.labelKey}`, { defaultValue: '' }),
              t(`nav.${g.labelKey}`),
              it.to,
            ]
              .join(' ')
              .toLowerCase(),
            to: it.to,
            icon: it.icon,
            group: t('search.navigate'),
          })),
      ),
    [groups, t],
  );

  /** "Do something" shortcuts that open a create form directly (deep links honoured by each page). */
  const actions = useMemo(() => {
    const allowed = new Set(modules.map((m) => m.to));
    return [
      { id: 'x-book', label: t('portal.quick.book'), to: `${ROUTES.appointments}?new=1`, icon: CalendarPlus, route: ROUTES.appointments, perm: hasPermission('appointments:manage') },
      { id: 'x-walkin', label: t('portal.quick.walkin'), to: `${ROUTES.queue}?walkin=1`, icon: Ticket, route: ROUTES.queue, perm: true },
      { id: 'x-expense', label: t('portal.quick.expense'), to: `${ROUTES.paymentsExpenses}?new=1`, icon: ReceiptText, route: ROUTES.paymentsExpenses, perm: hasPermission('expenses:manage') },
    ]
      .filter((a) => a.perm && allowed.has(a.route))
      .map(({ route: _r, perm: _p, ...a }) => ({ ...a, group: t('search.actions'), haystack: a.label.toLowerCase() }));
  }, [modules, hasPermission, t]);

  const navItems: Item[] = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return [...actions, ...modules.slice(0, 8)];
    return [...actions, ...modules].filter((m) => m.haystack.includes(q)).slice(0, 12);
  }, [actions, modules, debounced]);

  const items: Item[] = useMemo(() => {
    const nav = navItems;
    const customers: Item[] =
      data?.customers.map((c) => ({
        id: `c-${c.id}`,
        label: c.label,
        sub: c.sub,
        to: ROUTES.customerDetail(c.id),
        icon: UserRound,
        group: t('nav.customers'),
      })) ?? [];
    const appts: Item[] =
      data?.appointments.map((a) => ({
        id: `a-${a.id}`,
        label: a.label,
        sub: a.sub,
        to: ROUTES.appointmentDetail(a.id),
        icon: CalendarClock,
        group: t('nav.appointments'),
      })) ?? [];
    const services: Item[] =
      data?.services.map((s) => ({
        id: `s-${s.id}`,
        label: s.label,
        sub: s.sub,
        to: ROUTES.services,
        icon: Scissors,
        group: t('nav.services'),
      })) ?? [];
    return [...nav, ...customers, ...appts, ...services];
  }, [navItems, data, t]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onOpenChange(false);
    navigate(item.to);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((it) => map.set(it.group, [...(map.get(it.group) ?? []), it]));
    return [...map.entries()];
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder={t('search.placeholder')}
            className="h-12 border-0 px-0 focus-visible:ring-0"
            aria-label={t('search.title')}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {debounced.trim().length >= 2 ? t('search.noResults') : t('search.hint')}
            </p>
          ) : (
            grouped.map(([group, groupItems]) => (
              <div key={group} className="mb-2">
                <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                {groupItems.map((it) => {
                  const idx = items.indexOf(it);
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(it)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                        idx === active ? 'bg-muted' : 'hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.sub ? (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{it.sub}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
