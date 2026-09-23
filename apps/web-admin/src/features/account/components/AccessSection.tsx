import type { AccountOverview } from '@abcp/shared-types';
import { ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { GROUP_KEYS, groupColor, groupIcon } from '@/features/users/permissionGroups';

import { groupPermissions } from '../accountModel';

/** Order actions the same way the permission matrix columns read. */
const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'special', 'manage'];
const actionRank = (a: string) => {
  const i = ACTION_ORDER.indexOf(a);
  return i === -1 ? ACTION_ORDER.length : i; // review / approve / refund … after the matrix columns
};

interface AccessSectionProps {
  data: AccountOverview;
  index: number;
}

/**
 * Read-only "what can I do here" — the effective permission set (role + per-user
 * overrides, already merged server-side) grouped per module, plus the modules the
 * role doesn't reach so a user knows whom to ask rather than hunting for a page.
 */
export function AccessSection({ data, index }: AccessSectionProps) {
  const { t } = useTranslation();
  const grouped = useMemo(() => groupPermissions(data.user.permissions), [data.user.permissions]);
  const granted = GROUP_KEYS.filter((g) => grouped.has(g));
  const missing = GROUP_KEYS.filter((g) => !grouped.has(g));
  const actionLabel = (a: string) => t(`users.permissionAction.${a}`, { defaultValue: a });

  return (
    <SettingsSection
      id="acc-access"
      icon={ShieldCheck}
      index={index}
      title={t('account.access.title')}
      desc={t('account.access.desc', {
        count: data.user.permissions.length,
        groups: granted.length,
      })}
    >
      {granted.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t('account.access.none')}</p>
      ) : (
        <ul className="grid gap-2 py-3 sm:grid-cols-2 xl:grid-cols-3">
          {granted.map((g) => {
            const Icon = groupIcon(g);
            const color = groupColor(g);
            const actions = [...(grouped.get(g) ?? [])].sort(
              (a, b) => actionRank(a) - actionRank(b),
            );
            return (
              <li
                key={g}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-2.5"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${color}1a`, color }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {t(`users.permissionGroup.${g}`, { defaultValue: g })}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {actions.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground"
                      >
                        {actionLabel(a)}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 ? (
        <div className="py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t('account.access.noAccess')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missing.map((g) => (
              <span
                key={g}
                className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {t(`users.permissionGroup.${g}`, { defaultValue: g })}
              </span>
            ))}
          </div>
          <p className="mt-2 text-2xs text-muted-foreground">{t('account.access.askAdmin')}</p>
        </div>
      ) : null}
    </SettingsSection>
  );
}
