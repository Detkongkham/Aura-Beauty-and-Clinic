import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/features/auth/useAuth';
import { http } from '@/services/http';

import { useBranches } from './branches.api';

interface Closure {
  id: string;
  branchId: string | 'all';
  date: string;
  reason: string;
}

export function BranchClosuresPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('branches:manage');
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();

  const { data = [], isLoading } = useQuery({
    queryKey: ['branch-closures'],
    queryFn: async () => {
      const res = await http.get<{ data: { items: Closure[] } }>('/branch-closures');
      return res.data.data.items;
    },
  });

  const create = useMutation({
    mutationFn: (payload: { branchId: string; date: string; reason: string }) =>
      http.post('/branch-closures', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['branch-closures'] });
      toast.success(t('closures.added'));
      setForm({ branchId: 'all', date: '', reason: '' });
    },
    onError: () => toast.error(t('services.saveError')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.delete(`/branch-closures/${id}`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['branch-closures'] }),
  });

  const [form, setForm] = useState({ branchId: 'all', date: '', reason: '' });
  const branchName = (id: string) =>
    id === 'all' ? t('branch.all') : (branches.find((b) => b.id === id)?.name ?? id.slice(0, 8));

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.closures')} description={t('closures.subtitle')} />

      {canManage ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="cl-date">{t('closures.date')}</Label>
            <Input
              id="cl-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('nav.branches')}</Label>
            <Select
              className="w-44"
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              options={[
                { value: 'all', label: t('branch.all') },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="cl-reason">{t('closures.reason')}</Label>
            <Input
              id="cl-reason"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="h-9"
            />
          </div>
          <Button
            onClick={() => create.mutate(form)}
            disabled={!form.date || create.isPending}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('common.create')}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : data.length === 0 ? (
        <EmptyState title={t('closures.empty')} />
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('closures.date')}</TableHead>
                <TableHead>{t('nav.branches')}</TableHead>
                <TableHead>{t('closures.reason')}</TableHead>
                {canManage ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id} className="h-11">
                  <TableCell className="tabular-nums">
                    <DateTimeText value={c.date} />
                  </TableCell>
                  <TableCell>{branchName(c.branchId)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.reason || '–'}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => remove.mutate(c.id)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
