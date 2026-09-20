import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createCampaignSchema,
  type CampaignType,
  type CampaignView,
  type CreateCampaignInput,
} from '@abcp/shared-types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/features/branches/branches.api';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { CAMPAIGN_TYPES, DEFAULT_DAYS_BEFORE, DEFAULT_INACTIVE_DAYS, TYPE_META } from './campaigns.lib';
import { useCreateCampaign, useUpdateCampaign } from './marketing.api';
import { NotificationPreview } from './NotificationPreview';

const TYPES: CampaignType[] = CAMPAIGN_TYPES;

interface Props {
  open: boolean;
  editing: CampaignView | null;
  defaultBranchId: string;
  onClose: () => void;
}

export function CampaignFormDialog({ open, editing, defaultBranchId, onClose }: Props) {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const create = useCreateCampaign();
  const update = useUpdateCampaign();

  const form = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      branchId: defaultBranchId === 'all' ? '' : defaultBranchId,
      name: '',
      type: 'BIRTHDAY',
      discountCode: '',
      message: { title: '', body: '' },
      triggerRule: {},
      isActive: true,
    },
  });
  const type = form.watch('type');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        branchId: editing.branchId,
        name: editing.name,
        type: editing.type,
        discountCode: editing.discountCode ?? '',
        message: editing.message ?? { title: '', body: '' },
        triggerRule: editing.triggerRule ?? {},
        isActive: editing.isActive,
      });
    } else {
      form.reset({
        branchId: defaultBranchId === 'all' ? (branches[0]?.id ?? '') : defaultBranchId,
        name: '',
        type: 'BIRTHDAY',
        discountCode: '',
        message: { title: '', body: '' },
        triggerRule: {},
        isActive: true,
      });
    }
  }, [open, editing, defaultBranchId, branches, form]);

  function submit(values: CreateCampaignInput) {
    const onOk = () => {
      toast.success(editing ? t('campaigns.updated') : t('campaigns.created'));
      onClose();
    };
    const onErr = (err: unknown) =>
      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

    if (editing) {
      const { branchId: _b, ...rest } = values;
      update.mutate({ id: editing.id, input: rest }, { onSuccess: onOk, onError: onErr });
    } else {
      create.mutate(values, { onSuccess: onOk, onError: onErr });
    }
  }

  const pending = create.isPending || update.isPending;

  const title = form.watch('message.title') ?? '';
  const body = form.watch('message.body') ?? '';
  const discountCode = form.watch('discountCode') ?? '';
  const branchName = branches.find((b) => b.id === form.watch('branchId'))?.name;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('campaigns.editTitle') : t('campaigns.newTitle')}</DialogTitle>
          <DialogDescription>{t('campaigns.formSubtitle')}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
          <div className="grid gap-5 md:grid-cols-[1fr_260px]">
            <div className="space-y-5">
              <Section index={1} title={t('campaigns.form.basics')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('campaigns.name')} error={form.formState.errors.name?.message}>
                    <Input {...form.register('name')} placeholder={t('campaigns.form.namePlaceholder')} />
                  </Field>
                  <Field
                    label={t('campaigns.branch')}
                    error={form.formState.errors.branchId?.message}
                    hint={editing ? t('campaigns.form.branchLocked') : undefined}
                  >
                    <Select
                      disabled={Boolean(editing)}
                      value={form.watch('branchId')}
                      onChange={(e) => form.setValue('branchId', e.target.value, { shouldValidate: true })}
                      options={branches.map((b) => ({ value: b.id, label: b.name }))}
                      placeholder={t('campaigns.selectBranch')}
                    />
                  </Field>
                </div>
              </Section>

              <Section index={2} title={t('campaigns.form.audience')}>
                <div role="radiogroup" aria-label={t('campaigns.typeLabel')} className="grid grid-cols-2 gap-2">
                  {TYPES.map((x) => {
                    const meta = TYPE_META[x];
                    const Icon = meta.icon;
                    const selected = type === x;
                    return (
                      <button
                        key={x}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => form.setValue('type', x)}
                        className={cn(
                          'flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors duration-150',
                          selected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border hover:border-primary/40 hover:bg-muted/40',
                        )}
                      >
                        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', meta.chip)}>
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{t(`campaigns.type.${x}`)}</span>
                          <span className="block text-2xs leading-snug text-muted-foreground">
                            {t(`campaigns.typeHint.${x}`)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {type === 'WIN_BACK' ? (
                  <Field label={t('campaigns.inactiveDays')} hint={t('campaigns.form.inactiveDaysHint')}>
                    <Input
                      type="number"
                      min={1}
                      {...form.register('triggerRule.inactiveDays', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                      placeholder={String(DEFAULT_INACTIVE_DAYS)}
                    />
                  </Field>
                ) : null}
                {type === 'BIRTHDAY' ? (
                  <Field label={t('campaigns.daysBefore')} hint={t('campaigns.form.daysBeforeHint')}>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      {...form.register('triggerRule.daysBefore', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                      placeholder={String(DEFAULT_DAYS_BEFORE)}
                    />
                  </Field>
                ) : null}
                {type === 'FESTIVAL_PROMO' || type === 'CUSTOM' ? (
                  <p className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">
                    {t('campaigns.form.broadcastHint', { branch: branchName ?? t('campaigns.branch') })}
                  </p>
                ) : null}
              </Section>

              <Section index={3} title={t('campaigns.form.message')}>
                <Field
                  label={t('campaigns.msgTitle')}
                  error={form.formState.errors.message?.title?.message}
                  counter={`${title.length}/120`}
                >
                  <Input {...form.register('message.title')} maxLength={120} />
                </Field>
                <Field
                  label={t('campaigns.msgBody')}
                  error={form.formState.errors.message?.body?.message}
                  counter={`${body.length}/500`}
                >
                  <Textarea rows={4} {...form.register('message.body')} maxLength={500} />
                </Field>
                <Field label={t('campaigns.discountCode')} hint={t('campaigns.form.codeHint')}>
                  <Input
                    {...form.register('discountCode', {
                      setValueAs: (v: string) => (typeof v === 'string' ? v.toUpperCase() : v),
                    })}
                    maxLength={32}
                    placeholder="BDAY20"
                    className="font-mono uppercase"
                  />
                </Field>
              </Section>
            </div>

            <aside className="space-y-3 md:sticky md:top-0 md:self-start">
              <p className="text-xs font-medium text-muted-foreground">{t('campaigns.preview.title')}</p>
              <NotificationPreview title={title} body={body} discountCode={discountCode} />
              <p className="text-2xs leading-relaxed text-muted-foreground">{t('campaigns.preview.hint')}</p>

              <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
                <Switch
                  checked={form.watch('isActive')}
                  onCheckedChange={(v) => form.setValue('isActive', v)}
                />
                <span>
                  <span className="block font-medium">{t('campaigns.active')}</span>
                  <span className="block text-2xs text-muted-foreground">{t('campaigns.form.activeHint')}</span>
                </span>
              </label>
            </aside>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary">
          {index}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  hint,
  counter,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {counter ? <span className="text-2xs tabular-nums text-muted-foreground">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-2xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
