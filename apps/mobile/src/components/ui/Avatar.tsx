import { useEffect, useState } from 'react';
import { Image, type ImageSourcePropType, View } from 'react-native';
import { AVATAR_PACK } from '../../lib/avatarPack';
import { cn } from '../../lib/cn';

/**
 * Avatar — ຮູບໂປຣໄຟລ໌ ຊ່າງ/ຜູ້ໃຊ້.
 *
 * ຄ່າເລີ່ມຕົ້ນ: ຖ້າບໍ່ມີຮູບຈິງ → ໃຊ້ avatar ກາຕູນ 3D deterministic ຈາກຊຸດ bundled
 * (Microsoft Fluent Emoji 3D, MIT — ເບິ່ງ assets/avatars/3d/NOTICE.md). seed = ຊື່ →
 * ຄົນດຽວກັນໄດ້ໜ້າດຽວກັນທຸກຄັ້ງ. ຮູບຢູ່ໃນແອັບ → ບໍ່ຕ້ອງເນັດ, ບໍ່ fail.
 */

/** hash 32-bit ຄົງທີ່ຈາກ string (ບໍ່ random ຕໍ່ render). */
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** ຮູບ avatar 3D deterministic ຈາກຊຸດ — ໃຊ້ໄດ້ນອກ <Avatar> ຄືກັນ. */
export function avatarSource(seed: string): ImageSourcePropType {
  return AVATAR_PACK[hashOf(seed.trim() || 'Aura') % AVATAR_PACK.length]!;
}

type Tint = 'primary' | 'accent' | 'muted';
const TINT_BG: Record<Tint, string> = {
  primary: 'bg-primary-subtle',
  accent: 'bg-accent-soft',
  muted: 'bg-muted',
};

export function Avatar({
  uri,
  name,
  size = 44,
  shape = 'full',
  tint = 'primary',
  /** 'auto' = ຮູບຈິງກ່ອນ ແລ້ວຈຶ່ງກາຕູນ 3D · 'cartoon' = ໃຊ້ກາຕູນ 3D ສະເໝີ. */
  mode = 'auto',
  className,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  shape?: 'full' | 'lg';
  tint?: Tint;
  mode?: 'auto' | 'cartoon';
  className?: string;
}): React.JSX.Element {
  const wantPhoto = mode === 'auto' && !!uri;
  const [showPhoto, setShowPhoto] = useState(wantPhoto);

  useEffect(() => {
    setShowPhoto(wantPhoto);
  }, [wantPhoto, uri]);

  const radius = shape === 'full' ? 'rounded-full' : 'rounded-lg';
  const source = showPhoto && uri ? { uri } : avatarSource(name);

  return (
    <View
      className={cn('items-center justify-center overflow-hidden', radius, TINT_BG[tint], className)}
      style={{ width: size, height: size }}
    >
      <Image
        source={source}
        resizeMode="cover"
        style={{ width: '100%', height: '100%' }}
        onError={() => setShowPhoto(false)}
      />
    </View>
  );
}
