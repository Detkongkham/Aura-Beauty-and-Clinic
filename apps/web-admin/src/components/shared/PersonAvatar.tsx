import { useEffect, useState } from 'react';

import { avatarImage } from '@/lib/avatarPack';
import { cn } from '@/lib/utils';

type Tint = 'primary' | 'accent' | 'muted';

const TINT_BG: Record<Tint, string> = {
  primary: 'bg-primary/10',
  accent: 'bg-accent-soft',
  muted: 'bg-muted',
};

interface PersonAvatarProps {
  /** Seed for the deterministic cartoon face — usually the person's name. */
  name: string;
  /** Real photo URL, if any. */
  src?: string | null;
  /** Pixel size of the square. */
  size?: number;
  shape?: 'full' | 'lg';
  tint?: Tint;
  /** `cartoon` (default) always uses the 3D pack; `auto` tries the real photo first. */
  mode?: 'cartoon' | 'auto';
  className?: string;
  /** Extra alt text context; defaults to the name. */
  alt?: string;
}

/**
 * Profile picture for a staff member / customer / user. Mirrors the mobile
 * `<Avatar>` — same bundled 3D cartoon pack (Fluent Emoji, MIT), same name-hash
 * seed, so the same person shows the same face across web and mobile. Default
 * `mode="cartoon"`; pass `mode="auto"` to prefer an uploaded photo.
 */
export function PersonAvatar({
  name,
  src,
  size = 36,
  shape = 'full',
  tint = 'primary',
  mode = 'cartoon',
  className,
  alt,
}: PersonAvatarProps) {
  const wantPhoto = mode === 'auto' && !!src;
  const [showPhoto, setShowPhoto] = useState(wantPhoto);

  useEffect(() => {
    setShowPhoto(wantPhoto);
  }, [wantPhoto, src]);

  const source = showPhoto && src ? src : avatarImage(name);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        shape === 'full' ? 'rounded-full' : 'rounded-lg',
        TINT_BG[tint],
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={source}
        alt={alt ?? name}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setShowPhoto(false)}
      />
    </span>
  );
}
