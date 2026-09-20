import { useMemo, useState } from 'react';
import { Building2, Check, Search, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useStaffList } from '@/features/staff/staff.api';
import { useDebounce } from '@/hooks/useDebounce';
import { NormalizedApiError } from '@/services/apiError';
import { cn } from '@/lib/utils';

import { useCreateStaffConversation } from './messaging.api';

/** ຈຳນວນລາຍຊື່ "ແນະນຳ" ທີ່ສະແດງກ່ອນພິມຄົ້ນຫາ — ດຶງມາແບບບໍ່ມີເງື່ອນໄຂຫຍັງ (ບໍ່ອີງໃສ່ປະຫວັດແຊັດ). */
const SUGGESTION_COUNT = 9;

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (threadId: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rawQ, setRawQ] = useState('');
  const q = useDebounce(rawQ, 300);
  const [branchId, setBranchId] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // ຊື່ຄົນທີ່ຖືກເລືອກ — ເກັບໄວ້ຕ່າງຫາກຈາກ `candidates` ເພາະ candidates ປ່ຽນຕາມການຄົ້ນຫາ, ແຕ່ chip
  // ທີ່ສະແດງໄວ້ (ຄົນທີ່ເລືອກແລ້ວ) ຕ້ອງຄົງຊື່ໄວ້ຕໍ່ໄປແມ່ນຫຼັງຈາກຄົ້ນຫາຫາຍໄປຈາກ candidates ກໍ່ຕາມ.
  const [selectedNames, setSelectedNames] = useState<Map<string, string>>(new Map());
  const searching = rawQ.trim().length >= 2;
  // ບໍ່ໄດ້ພິມ ແລະ ບໍ່ໄດ້ກັ່ນຕອງຕາມສາຂາ → ດຶງຄົນທຳອິດຈາກ directory ມາເປັນ "ແນະນຳ" ໂດຍກົງ, ບໍ່ອີງໃສ່
  // ປະຫວັດແຊັດ. ພິມ ≥2 ຕົວ ຫຼື ເລືອກສາຂາ → browse ລາຍຊື່ຈິງ (ໃຫຍ່ກວ່າ, ສູງສຸດ 50 ຄົນ).
  const browsing = searching || branchId !== 'all';
  const staff = useStaffList(
    browsing
      ? { q: searching ? q : undefined, branchId: branchId === 'all' ? undefined : branchId, page: 1, pageSize: 50 }
      : { page: 1, pageSize: SUGGESTION_COUNT },
  );
  const branches = useBranches();
  const create = useCreateStaffConversation();

  const candidates = useMemo(
    () => (staff.data?.items ?? []).filter((s) => s.userId !== user?.id),
    [staff.data, user?.id],
  );

  const toggle = (userId: string, name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setSelectedNames((prev) => {
      const next = new Map(prev);
      next.set(userId, name);
      return next;
    });
  };

  const onSubmit = () => {
    if (selected.size === 0) return;
    const names = Array.from(selected).map((id) => selectedNames.get(id) ?? '');
    create.mutate(Array.from(selected), {
      onSuccess: (conversation) => {
        onCreated(conversation.id);
        onOpenChange(false);
        setSelected(new Set());
        setSelectedNames(new Map());
        setRawQ('');
        setBranchId('all');
        toast.success(t('messaging.startedWith', { names: names.join(', ') }));
      },
      onError: (err) => {
        toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSelected(new Set());
          setSelectedNames(new Map());
          setRawQ('');
          setBranchId('all');
        }
      }}
    >
      <DialogContent className="max-w-4xl gap-0 p-0">
        <DialogHeader className="gap-3 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle>{t('messaging.newConversation')}</DialogTitle>
              <p className="text-sm text-muted-foreground">{t('messaging.newConversationSubtitle')}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4 px-6 py-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={rawQ}
              onChange={(e) => setRawQ(e.target.value)}
              placeholder={t('messaging.searchStaff')}
              className="h-11 rounded-full pl-10 pr-9 text-sm"
            />
            {rawQ ? (
              <button
                type="button"
                onClick={() => setRawQ('')}
                className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.remove')}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {branches.data && branches.data.length > 1 ? (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              <button
                type="button"
                onClick={() => setBranchId('all')}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  branchId === 'all'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {t('messaging.allBranches')}
              </button>
              {branches.data.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBranchId(b.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    branchId === b.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted',
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ) : null}

          {selected.size > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selected).map((userId) => (
                <span
                  key={userId}
                  className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-2 text-xs font-medium text-primary"
                >
                  <PersonAvatar name={selectedNames.get(userId) ?? '?'} size={20} />
                  <span className="max-w-32 truncate">{selectedNames.get(userId)}</span>
                  <button
                    type="button"
                    onClick={() => toggle(userId, selectedNames.get(userId) ?? '')}
                    className="-mr-1 rounded-full p-0.5 text-primary/70 hover:bg-primary/15 hover:text-primary"
                    aria-label={t('common.remove')}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {!browsing && candidates.length > 0 ? t('messaging.suggested') : t('messaging.staffDirectory')}
            </p>
            {candidates.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('messaging.resultCount', { count: candidates.length })}
              </p>
            ) : null}
          </div>

          <div className="grid max-h-[30rem] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {staff.isLoading ? (
              Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3.5">
                  <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))
            ) : candidates.length === 0 ? (
              <p className="col-span-full p-6 text-center text-sm text-muted-foreground">
                {t('messaging.noStaffFound')}
              </p>
            ) : (
              candidates.map((s) => {
                const checked = selected.has(s.userId);
                return (
                  <button
                    type="button"
                    key={s.userId}
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(s.userId, s.name)}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl border p-3.5 pr-8 text-left text-sm shadow-sm transition-all duration-150',
                      checked
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-inset ring-primary/25'
                        : 'border-border hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
                    )}
                  >
                    <PersonAvatar name={s.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.jobTitle}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground/80">
                        <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {s.branchName}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'absolute right-3 top-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-transparent group-hover:border-primary/40',
                      )}
                      aria-hidden="true"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="items-center gap-3 border-t border-border px-6 py-4 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {selected.size > 0 ? t('messaging.selectedCount', { count: selected.size }) : null}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onSubmit} disabled={selected.size === 0 || create.isPending}>
              {t('messaging.start')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
