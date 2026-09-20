import { cn } from '@/lib/utils';
import type { LaoProvinceId } from '@/types/models';

import { PROVINCE_BY_ID, provincePathBBox } from './lao-provinces';

interface BranchLocatorMapProps {
  provinceId: LaoProvinceId;
  /** Optional pin position; falls back to the province centroid. */
  point?: { lat: number; lng: number } | null;
  className?: string;
}

/**
 * Single Lao province outline cropped to its bounding box, with a pin marker.
 * Used both in the branch detail panel and as a live preview in the branch form.
 * Presentation only — the pin sits at the province centroid, not a real
 * projection of coordinates.
 */
export function BranchLocatorMap({ provinceId, className }: BranchLocatorMapProps) {
  const province = PROVINCE_BY_ID[provinceId];
  if (!province) return null;

  const bb = provincePathBBox(province.d);
  const pad = Math.max(bb.w, bb.h) * 0.16;
  const dim = Math.max(bb.w, bb.h);

  return (
    <svg
      viewBox={`${bb.x - pad} ${bb.y - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}`}
      className={cn('mx-auto block h-24 w-full', className)}
      role="img"
      aria-hidden="true"
    >
      <path
        d={province.d}
        style={{
          fill: 'hsl(var(--primary) / 0.14)',
          stroke: 'hsl(var(--primary) / 0.55)',
          strokeWidth: dim / 90,
          strokeLinejoin: 'round',
        }}
      />
      <circle
        cx={province.cx}
        cy={province.cy}
        r={dim / 22}
        style={{ fill: 'hsl(var(--accent))', stroke: 'hsl(var(--card))', strokeWidth: dim / 70 }}
      />
      <circle cx={province.cx} cy={province.cy} r={dim / 55} style={{ fill: 'hsl(var(--card))' }} />
    </svg>
  );
}
