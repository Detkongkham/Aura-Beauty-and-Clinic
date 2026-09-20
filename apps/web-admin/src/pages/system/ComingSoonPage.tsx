import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';

/** Feature-flagged route group not in Phase 2 scope (Finance/Inventory/Marketing → later phases). */
export function ComingSoonPage({ titleKey, phase }: { titleKey: string; phase: string }) {
  const { t } = useTranslation();
  const title = t(titleKey);
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <EmptyState
        icon={Sparkles}
        title={t('comingSoon.title')}
        description={t('comingSoon.description', { phase })}
      />
    </div>
  );
}
