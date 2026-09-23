import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

const KEYS: { keys: string[]; label: string }[] = [
  { keys: ['J', '↓'], label: 'next' },
  { keys: ['K', '↑'], label: 'prev' },
  { keys: ['A'], label: 'approve' },
  { keys: ['R'], label: 'reject' },
  { keys: ['E'], label: 'correct' },
  { keys: ['Z'], label: 'zoom' },
  { keys: ['X'], label: 'select' },
  { keys: ['/'], label: 'search' },
  { keys: ['?'], label: 'help' },
];

/** Cheat sheet for the reviewer's keyboard flow — every shortcut on the page is listed here. */
export function SlipShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('payTreasury.slips.shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('payTreasury.slips.shortcuts.body')}</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {KEYS.map((k) => (
            <div key={k.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-sm">{t(`payTreasury.slips.shortcuts.${k.label}`)}</dt>
              <dd className="flex gap-1">
                {k.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
