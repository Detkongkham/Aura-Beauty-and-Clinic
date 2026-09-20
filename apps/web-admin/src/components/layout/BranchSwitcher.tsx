import { Building2, Check, ChevronsUpDown, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

/**
 * Branch scope selector (design.md §8 topbar). SUPER_ADMIN can pick "all" or any
 * branch; a BRANCH_ADMIN is pinned to their own branch.
 *
 * Styled as a bordered *scope chip* rather than a bare ghost button: this control
 * silently re-filters every number on every page, so it has to read as a
 * persistent state indicator, not as one more icon in the utility row.
 */
export function BranchSwitcher() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { data: branches = [] } = useBranches();
  const activeBranchId = useUiStore((s) => s.activeBranchId);
  const setActiveBranch = useUiStore((s) => s.setActiveBranch);

  const isSuper = role === 'SUPER_ADMIN';
  const visibleBranches = isSuper ? branches : branches.filter((b) => b.id === user?.branchId);

  const options: { id: string | 'all'; label: string }[] = [
    ...(isSuper ? [{ id: 'all' as const, label: t('branch.all') }] : []),
    ...visibleBranches.map((b) => ({ id: b.id, label: b.name })),
  ];

  const current = options.find((o) => o.id === activeBranchId) ?? options[0];
  const isAll = current?.id === 'all';
  const Icon = isAll ? Globe2 : Building2;

  // Single-branch user: the scope is a fact, not a choice — show it, don't fake a menu.
  if (options.length <= 1) {
    return (
      <span className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[140px] truncate">{current?.label ?? '—'}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${t('nav.branches')}: ${current?.label ?? ''}`}
              className={cn(
                'h-8 shrink-0 gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                'data-[state=open]:border-primary/40 data-[state=open]:bg-primary-subtle/60',
                isAll
                  ? 'border-border/80 bg-muted/50 text-muted-foreground hover:bg-muted'
                  : 'border-primary/25 bg-primary-subtle/60 text-primary hover:bg-primary-subtle',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[100px] truncate xl:max-w-[160px]">{current?.label}</span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('branch.scopeHint')}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>{t('branch.scopeHint')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => {
          const active = o.id === activeBranchId;
          const OptIcon = o.id === 'all' ? Globe2 : Building2;
          return (
            <DropdownMenuItem
              key={o.id}
              onSelect={() => setActiveBranch(o.id)}
              className={cn('gap-2', active && 'bg-primary-subtle/50 font-semibold text-primary')}
            >
              <OptIcon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              <span className="flex-1 truncate">{o.label}</span>
              <Check className={cn('h-4 w-4 shrink-0', active ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
