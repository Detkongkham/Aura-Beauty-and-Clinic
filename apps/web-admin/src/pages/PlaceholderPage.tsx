import { Hammer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Temporary content for a real route whose feature module is built in step 4.
 * Keeps the shell, navigation, and guards testable now.
 */
export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  const title = t(titleKey);
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={t('scaffold.body')} />
      <EmptyState
        icon={Hammer}
        title={t('placeholder.title', { page: title })}
        description={t('placeholder.description')}
      />
    </div>
  );
}
