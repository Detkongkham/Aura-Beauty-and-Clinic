import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StickySaveBarProps {
  visible: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

/** Bleeds under the page like StickyPageHeader, but pinned to the bottom of `<main>`. */
export function StickySaveBar({ visible, saving, onDiscard, onSave }: StickySaveBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 -mb-6 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-6 sm:px-6',
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <SaveBarContent saving={saving} onDiscard={onDiscard} onSave={onSave} />
    </div>
  );
}

function SaveBarContent({
  saving,
  onDiscard,
  onSave,
}: {
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <span className="flex items-center gap-2 text-sm text-foreground">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        {t('settings.unsaved')}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          {t('common.discard')}
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </>
  );
}
