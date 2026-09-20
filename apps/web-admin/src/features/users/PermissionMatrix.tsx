import { PERMISSIONS, type Permission } from '@abcp/shared-types';
import {
  Check,
  CirclePlus,
  Eye,
  Pencil,
  ShieldCheck,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { groupColor, groupIcon, GROUP_KEYS } from './permissionGroups';

const ALL_PERMISSIONS = new Set<string>(PERMISSIONS);

const ACTIONS: Array<{ key: string; icon: LucideIcon; colorClass: string }> = [
  { key: 'view', icon: Eye, colorClass: 'text-indigo-600' },
  { key: 'create', icon: CirclePlus, colorClass: 'text-emerald-600' },
  { key: 'edit', icon: Pencil, colorClass: 'text-amber-600' },
  { key: 'delete', icon: Trash2, colorClass: 'text-red-600' },
  { key: 'special', icon: Zap, colorClass: 'text-violet-600' },
  { key: 'manage', icon: ShieldCheck, colorClass: 'text-sky-600' },
];

interface MiniCheckboxProps {
  checked: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  color: string;
  ring?: 'granted' | 'revoked' | null;
  'aria-label': string;
}

/** 17px square checkbox button — matches the dense permission-matrix look. */
function MiniCheckbox({ checked, onClick, color, ring, ...rest }: MiniCheckboxProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-2 transition-all',
        checked ? 'text-white' : 'border-input bg-card hover:border-primary',
        ring === 'granted' && 'ring-2 ring-success ring-offset-1',
        ring === 'revoked' && 'ring-2 ring-destructive ring-offset-1',
      )}
      style={checked ? { background: color, borderColor: color } : undefined}
      {...rest}
    >
      {checked ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden="true" /> : null}
    </button>
  );
}

function Placeholder() {
  return (
    <div className="flex justify-center">
      <div className="h-px w-2.5 bg-border" />
    </div>
  );
}

interface PermissionMatrixProps {
  isChecked: (p: Permission) => boolean;
  onToggle: (p: Permission) => void;
  /** Per-user override editor only — rings a cell that diverges from the role default. */
  isOverridden?: (p: Permission) => boolean;
}

/**
 * Dense View/Create/Edit/Delete/Special/Manage permission matrix — one row per
 * resource, disabled placeholders where that resource has no such action yet.
 * Shared by the per-user override editor and the role create/edit dialog.
 */
export function PermissionMatrix({ isChecked, onToggle, isOverridden }: PermissionMatrixProps) {
  const { t } = useTranslation();

  const rowKeys = (group: string) =>
    ACTIONS.map((a) => `${group}:${a.key}`).filter((k) => ALL_PERMISSIONS.has(k)) as Permission[];

  const toggleRow = (group: string) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const keys = rowKeys(group);
    const allChecked = keys.every((k) => isChecked(k));
    for (const k of keys) {
      if (isChecked(k) === allChecked) onToggle(k);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="sticky top-0 z-20 pb-2">
        <div className="hidden grid-cols-[1fr_repeat(6,44px)_36px] gap-0.5 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-sm sm:grid">
          <span className="self-center text-[9px] font-semibold text-muted-foreground">{t('users.menuPage')}</span>
          {ACTIONS.map((a) => (
            <div key={a.key} className="flex flex-col items-center gap-0.5">
              <a.icon className={cn('h-3 w-3', a.colorClass)} aria-hidden="true" />
              <span className="text-[8px] text-muted-foreground">{t(`users.permissionAction.${a.key}`)}</span>
            </div>
          ))}
          <span className="self-center text-center text-[8px] font-semibold text-muted-foreground">
            {t('users.filterAll')}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border shadow-sm">
        {GROUP_KEYS.map((group, i) => {
          const color = groupColor(group);
          const Icon = groupIcon(group);
          const keys = rowKeys(group);
          const rowAllChecked = keys.length > 0 && keys.every((k) => isChecked(k));

          return (
            <div
              key={group}
              className={cn(
                'grid grid-cols-[1fr_repeat(6,44px)_36px] items-center gap-0.5 px-3 py-2 transition-colors hover:bg-muted/60',
                i > 0 && 'border-t border-border',
                i % 2 === 1 && 'bg-muted/30',
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-3.5 w-0.5 shrink-0 rounded-full" style={{ background: `${color}66` }} />
                <Icon className="h-3 w-3 shrink-0" style={{ color }} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-foreground">
                    {t(`users.permissionGroup.${group}`, { defaultValue: group })}
                  </p>
                  <p className="truncate text-[9px] text-muted-foreground">/{group}</p>
                </div>
              </div>

              {ACTIONS.map((a) => {
                const key = `${group}:${a.key}`;
                if (!ALL_PERMISSIONS.has(key)) return <Placeholder key={a.key} />;
                const p = key as Permission;
                const checked = isChecked(p);
                const overridden = isOverridden?.(p) ?? false;
                return (
                  <div key={a.key} className="flex justify-center">
                    <MiniCheckbox
                      checked={checked}
                      onClick={() => onToggle(p)}
                      color={color}
                      ring={overridden ? (checked ? 'granted' : 'revoked') : null}
                      aria-label={key}
                    />
                  </div>
                );
              })}

              <div className="flex justify-center">
                {keys.length > 0 ? (
                  <MiniCheckbox
                    checked={rowAllChecked}
                    onClick={toggleRow(group)}
                    color={color}
                    aria-label={t('users.filterAll')}
                  />
                ) : (
                  <Placeholder />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
