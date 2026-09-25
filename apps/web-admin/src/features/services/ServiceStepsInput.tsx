import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type ServiceStepValue = { title: string; body: string };

const MAX_STEPS = 12;

/**
 * Wave 11 — ordered "what happens during the visit" steps, shown on the service detail
 * screen of the customer app. Previously seed-only.
 */
export function ServiceStepsInput({ value, onChange }: { value: ServiceStepValue[]; onChange: (v: ServiceStepValue[]) => void }) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<ServiceStepValue>) => onChange(value.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="flex gap-2 rounded-lg border border-border p-2">
          <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input
              aria-label={t('services.steps.title', { n: i + 1 })}
              placeholder={t('services.steps.titlePh')}
              maxLength={80}
              value={s.title}
              onChange={(e) => set(i, { title: e.target.value })}
            />
            <Textarea
              aria-label={t('services.steps.body', { n: i + 1 })}
              placeholder={t('services.steps.bodyPh')}
              rows={2}
              maxLength={400}
              value={s.body}
              onChange={(e) => set(i, { body: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} aria-label={t('services.steps.up')} onClick={() => move(i, -1)}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === value.length - 1} aria-label={t('services.steps.down')} onClick={() => move(i, 1)}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t('services.steps.remove')} onClick={() => onChange(value.filter((_, k) => k !== i))}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" disabled={value.length >= MAX_STEPS} onClick={() => onChange([...value, { title: '', body: '' }])}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        {t('services.steps.add')}
      </Button>
    </div>
  );
}
