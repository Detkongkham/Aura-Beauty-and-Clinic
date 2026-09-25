/**
 * 3D cartoon avatar pack — Microsoft Fluent Emoji 3D, MIT (© Microsoft).
 * See `public/avatars/3d/NOTICE.md`. Served as static files from `public/`, so
 * only the faces actually rendered are ever fetched.
 *
 * Same pack + same `hashOf` seed as `apps/mobile/src/lib/avatarPack.ts` +
 * `components/ui/Avatar.tsx`, so a given person gets the *same* face on web and
 * mobile. Keep the two in sync if PNGs are added/removed.
 */

/** 47 cartoon faces at `/avatars/3d/av-01.png` … `/avatars/3d/av-47.png`. */
export const AVATAR_PACK: readonly string[] = Array.from(
  { length: 47 },
  (_, i) => `/avatars/3d/av-${String(i + 1).padStart(2, '0')}.png`,
);

/** Stable 32-bit hash — identical to the mobile Avatar seed hash. */
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic cartoon face URL for a seed (usually the person's name). */
export function avatarImage(seed: string): string {
  return AVATAR_PACK[hashOf((seed ?? '').trim() || 'Aura') % AVATAR_PACK.length]!;
}

/** Face URL for a 1-based pack index (from a user-picked `pack:NN` token). */
export function avatarImageAt(index: number): string {
  return AVATAR_PACK[(index - 1 + AVATAR_PACK.length) % AVATAR_PACK.length]!;
}
