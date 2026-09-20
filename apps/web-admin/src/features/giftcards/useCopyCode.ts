import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

/** Clipboard copy for gift-card codes — toast + a 1.5s "copied" tick on the trigger. */
export function useCopyCode() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(
    (code: string) => {
      if (!navigator.clipboard) return;
      navigator.clipboard
        .writeText(code)
        .then(() => {
          setCopied(code);
          toast.success(t('giftCards.copied', { code }));
          window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
        })
        .catch(() => toast.error(t('common.saveError')));
    },
    [t],
  );
  return { copied, copy };
}
