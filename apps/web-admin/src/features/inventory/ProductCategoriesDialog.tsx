import { useState, type FormEvent } from 'react';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { NormalizedApiError } from '@/services/apiError';

import {
  useDeleteProductCategory,
  useProductCategories,
  useSaveProductCategory,
} from './inventory.api';

/**
 * M3 (inventory 9C) — ໝວດສິນຄ້າ (ຊ້ອນ 1 ຊັ້ນ). SUPER_ADMIN ສ້າງໝວດໃຊ້ຮ່ວມ (ບໍ່ຜູກສາຂາ) ຫຼື ຂອງສາຂາ;
 * BRANCH_ADMIN ສ້າງ/ແກ້ໄດ້ສະເພາະໝວດຂອງສາຂາຕົນ.
 */
export function ProductCategoriesDialog({
  open,
  onClose,
  isSuperAdmin,
  branchId,
}: {
  open: boolean;
  onClose: () => void;
  isSuperAdmin: boolean;
  branchId?: string;
}) {
  const { t } = useTranslation();
  const { data: cats, isLoading } = useProductCategories(branchId, true);
  const save = useSaveProductCategory();
  const del = useDeleteProductCategory();
  const [name, setName] = useState('');
  const [nameLo, setNameLo] = useState('');
  const [parentId, setParentId] = useState('');
  const [shared, setShared] = useState(true);

  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
  const roots = (cats ?? []).filter((c) => !c.parentId);
  const ordered = roots.flatMap((r) => [r, ...(cats ?? []).filter((c) => c.parentId === r.id)]);
  const canEdit = (c: { branchId: string | null }) => isSuperAdmin || Boolean(c.branchId);

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    save.mutate(
      {
        input: {
          name: name.trim(),
          nameLo: nameLo.trim() || null,
          parentId: parentId || null,
          ...(isSuperAdmin ? { branchId: shared ? null : (branchId ?? null) } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          setName('');
          setNameLo('');
        },
        onError,
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="flex-row items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <FolderTree className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{t('inventory.category.title')}</DialogTitle>
            <DialogDescription>{t('inventory.category.subtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={add} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('inventory.category.name')}
              aria-label={t('inventory.category.name')}
            />
            <Input
              value={nameLo}
              onChange={(e) => setNameLo(e.target.value)}
              placeholder={t('inventory.category.nameLo')}
              aria-label={t('inventory.category.nameLo')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="h-9 min-w-[180px]"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              options={[
                { value: '', label: t('inventory.category.topLevel') },
                ...roots.map((r) => ({ value: r.id, label: r.name })),
              ]}
              aria-label={t('inventory.category.parent')}
            />
            {isSuperAdmin && branchId ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={shared}
                  onCheckedChange={setShared}
                  aria-label={t('inventory.category.shared')}
                />
                {t('inventory.category.shared')}
              </label>
            ) : null}
            <Button
              type="submit"
              size="sm"
              className="ml-auto h-9 gap-1"
              disabled={save.isPending || !name.trim()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('inventory.category.add')}
            </Button>
          </div>
        </form>

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : ordered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t('inventory.category.empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {ordered.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className={c.parentId ? 'min-w-0 pl-5' : 'min-w-0'}>
                    <p className="text-sm font-medium">
                      {c.parentId ? <span className="mr-1 text-muted-foreground">↳</span> : null}
                      {c.name}
                      {c.nameLo ? (
                        <span className="text-muted-foreground"> · {c.nameLo}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.branchName ?? t('inventory.category.sharedTag')} ·{' '}
                      {t('inventory.uom.products', { count: c.productCount })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.isActive}
                      disabled={!canEdit(c) || save.isPending}
                      onCheckedChange={(v) =>
                        save.mutate({ id: c.id, input: { isActive: v } }, { onError })
                      }
                      aria-label={t('inventory.uom.active')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      disabled={!canEdit(c) || del.isPending || c.productCount > 0}
                      onClick={() =>
                        del.mutate(c.id, {
                          onSuccess: () => toast.success(t('common.saved')),
                          onError,
                        })
                      }
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
