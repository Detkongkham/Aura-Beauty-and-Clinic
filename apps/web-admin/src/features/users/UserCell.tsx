import type { AdminUser } from '@abcp/shared-types';
import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { toast } from '@/components/ui/sonner';
import { fileToAvatarDataUrl } from '@/lib/image';
import { cn } from '@/lib/utils';

const MAX_FILE_BYTES = 3 * 1024 * 1024;

interface UserCellProps {
  user: Pick<AdminUser, 'name' | 'phone' | 'avatarUrl'>;
  /** Omit to render a read-only cell (no click-to-change photo). */
  onAvatarChange?: (dataUrl: string) => void;
  /** 'sm' for tight spaces like the Permissions page's role-member list. Defaults to 'md'. */
  size?: 'sm' | 'md';
}

const SIZE_CLASSES = {
  sm: { gap: 'gap-2', avatar: 24, name: 'text-[12px]', phone: 'text-[10px]' },
  md: { gap: 'gap-3', avatar: 32, name: '', phone: 'text-[11px]' },
} as const;

/** Avatar + name + phone cell shared by the Users and Quick Login tables. */
export function UserCell({ user, onAvatarChange, size = 'md' }: UserCellProps) {
  const sizeClasses = SIZE_CLASSES[size];
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file || !onAvatarChange) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.logo.invalidType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t('settings.logo.tooLarge'));
      return;
    }
    setBusy(true);
    try {
      onAvatarChange(await fileToAvatarDataUrl(file));
    } catch {
      toast.error(t('settings.logo.invalidType'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex items-center', sizeClasses.gap)}>
      <div
        className={onAvatarChange ? 'group relative shrink-0 cursor-pointer' : 'relative shrink-0'}
        onClick={() => onAvatarChange && !busy && inputRef.current?.click()}
        title={onAvatarChange ? t('users.changePhoto') : undefined}
      >
        <PersonAvatar
          name={user.name}
          src={user.avatarUrl}
          mode="auto"
          size={sizeClasses.avatar}
          className="border border-border"
        />
        {onAvatarChange ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-3.5 w-3.5 text-white" aria-hidden="true" />
          </div>
        ) : null}
        {onAvatarChange ? (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className={cn('truncate font-medium text-foreground', sizeClasses.name)}>{user.name}</div>
        <div className={cn('text-muted-foreground', sizeClasses.phone)}>{user.phone}</div>
      </div>
    </div>
  );
}
