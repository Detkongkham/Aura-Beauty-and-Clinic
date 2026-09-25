import { packAvatarToken, parsePackAvatar } from '@abcp/shared-types';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AVATAR_PACK } from '@/lib/avatarPack';
import { cn } from '@/lib/utils';

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current `avatarUrl` — pre-selects the face when it is a `pack:NN` token. */
  current: string | null | undefined;
  pending?: boolean;
  /** Called with the chosen `pack:NN` token. */
  onPick: (token: string) => void;
}

/**
 * Grid of the 47 bundled 3D cartoon faces — the user picks their own avatar
 * instead of the name-hash default. Stored as a `pack:NN` token, which the
 * mobile `<Avatar>` resolves to the same face.
 */
export function AvatarPickerDialog({
  open,
  onOpenChange,
  current,
  pending,
  onPick,
}: AvatarPickerDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(parsePackAvatar(current));

  useEffect(() => {
    if (open) setSelected(parsePackAvatar(current));
  }, [open, current]);

  const unchanged = selected === null || selected === parsePackAvatar(current);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('account.profile.avatarPickerTitle')}</DialogTitle>
          <DialogDescription>{t('account.profile.avatarPickerDesc')}</DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label={t('account.profile.avatarPickerTitle')}
          className="grid max-h-[55vh] grid-cols-5 gap-2 overflow-y-auto p-1 sm:grid-cols-6"
        >
          {AVATAR_PACK.map((url, i) => {
            const index = i + 1;
            const active = selected === index;
            return (
              <button
                key={url}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t('account.profile.avatarOption', { n: index })}
                onClick={() => setSelected(index)}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-full bg-primary/10 transition',
                  'hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100',
                  active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )}
              >
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {active ? (
                  <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={unchanged || pending}
            onClick={() => selected !== null && onPick(packAvatarToken(selected))}
          >
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
