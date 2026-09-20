import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { Branch, LaoProvinceId } from '@/types/models';

import { LAO_PROVINCES, PROVINCE_BY_ID, provinceName } from './lao-provinces';

interface LaoProvinceMapProps {
  branches: Branch[];
  countsByProvince: Record<string, number>;
  selectedProvince: LaoProvinceId | null;
  activeBranchId: string | null;
  onSelectProvince: (id: LaoProvinceId | null) => void;
  onSelectBranch: (id: string) => void;
  /** Override the choropleth fill (e.g. shade by revenue). Defaults to branch-count steps. */
  fillForProvince?: (id: LaoProvinceId, count: number, selected: boolean) => string;
  /** Override the per-province accessible label. */
  provinceAriaLabel?: (id: LaoProvinceId, name: string, count: number) => string;
  /** Replaces the default branch-count legend. */
  legend?: ReactNode;
  /** Pointer/focus hover over a province (null when leaving). */
  onHoverProvince?: (id: LaoProvinceId | null) => void;
  /** Max CSS width of the SVG. */
  maxWidthClass?: string;
}

/** 0 → empty, 1 → low, 2 → mid, ≥3 → high. Colour tokens only (light-only project). */
function fillForCount(count: number, selected: boolean): string {
  if (selected) return 'hsl(var(--primary-hover))';
  if (count <= 0) return 'hsl(var(--muted))';
  if (count === 1) return 'hsl(var(--primary) / 0.20)';
  if (count === 2) return 'hsl(var(--primary) / 0.45)';
  return 'hsl(var(--primary))';
}

/** Deterministic pin position: province centroid, fanned out when it holds several. */
function pinXY(cx: number, cy: number, indexInProvince: number, total: number): [number, number] {
  if (total <= 1) return [cx, cy - 2];
  const radius = total <= 3 ? 13 : 18;
  const angle = (indexInProvince / total) * Math.PI * 2 - Math.PI / 2;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

const ENTER_KEYS = new Set(['Enter', ' ']);

export function LaoProvinceMap({
  branches,
  countsByProvince,
  selectedProvince,
  activeBranchId,
  onSelectProvince,
  onSelectBranch,
  fillForProvince = (_id, count, selected) => fillForCount(count, selected),
  provinceAriaLabel,
  legend,
  maxWidthClass = 'max-w-[680px]',
  onHoverProvince,
}: LaoProvinceMapProps) {
  const { t, i18n } = useTranslation();

  // Group branches by province so pins in the same province can be fanned out.
  const pins = useMemo(() => {
    const byProvince = new Map<LaoProvinceId, Branch[]>();
    for (const b of branches) {
      const list = byProvince.get(b.province) ?? [];
      list.push(b);
      byProvince.set(b.province, list);
    }
    const out: { branch: Branch; x: number; y: number }[] = [];
    for (const [province, list] of byProvince) {
      const anchor = PROVINCE_BY_ID[province];
      if (!anchor) continue;
      list.forEach((branch, idx) => {
        const [x, y] = pinXY(anchor.cx, anchor.cy, idx, list.length);
        out.push({ branch, x, y });
      });
    }
    return out;
  }, [branches]);

  const onProvinceKey = (id: LaoProvinceId) => (e: KeyboardEvent) => {
    if (!ENTER_KEYS.has(e.key)) return;
    e.preventDefault();
    onSelectProvince(selectedProvince === id ? null : id);
  };
  const onPinKey = (id: string) => (e: KeyboardEvent) => {
    if (!ENTER_KEYS.has(e.key)) return;
    e.preventDefault();
    onSelectBranch(id);
  };

  return (
    <div>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 1000 1000"
          role="img"
          aria-label={t('branches.map.ariaLabel')}
          className={cn('mx-auto block h-auto w-full', maxWidthClass)}
        >
          <g>
            {LAO_PROVINCES.map((p) => {
              const count = countsByProvince[p.id] ?? 0;
              const isSelected = selectedProvince === p.id;
              const label = provinceName(p.id, i18n.language);
              return (
                <path
                  key={p.id}
                  d={p.d}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={
                    provinceAriaLabel
                      ? provinceAriaLabel(p.id, label, count)
                      : t('branches.map.provinceAria', { province: label, count })
                  }
                  onClick={() => onSelectProvince(isSelected ? null : p.id)}
                  onKeyDown={onProvinceKey(p.id)}
                  onMouseEnter={onHoverProvince ? () => onHoverProvince(p.id) : undefined}
                  onMouseLeave={onHoverProvince ? () => onHoverProvince(null) : undefined}
                  onFocus={onHoverProvince ? () => onHoverProvince(p.id) : undefined}
                  onBlur={onHoverProvince ? () => onHoverProvince(null) : undefined}
                  className={cn(
                    'cursor-pointer outline-none transition-colors duration-150 ease-out',
                    'hover:opacity-90 focus-visible:opacity-90 motion-reduce:transition-none',
                  )}
                  style={{
                    fill: fillForProvince(p.id, count, isSelected),
                    stroke: isSelected ? 'hsl(var(--ring))' : 'hsl(var(--card))',
                    strokeWidth: isSelected ? 2.5 : 1.4,
                  }}
                />
              );
            })}
          </g>

          {/* Province names — only where there is something to show, keeps the map calm. */}
          <g aria-hidden="true">
            {LAO_PROVINCES.map((p) => {
              const count = countsByProvince[p.id] ?? 0;
              if (count <= 0 && selectedProvince !== p.id) return null;
              const full = provinceName(p.id, i18n.language);
              const label =
                p.id === 'vientiane-capital' && i18n.language.startsWith('lo') ? 'ນະຄອນຫຼວງ' : full;
              return (
                <text
                  key={p.id}
                  x={p.cx}
                  y={count > 0 ? p.cy - 15 : p.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    paintOrder: 'stroke',
                    stroke: 'hsl(var(--card))',
                    strokeWidth: 3,
                    strokeLinejoin: 'round',
                    fill: 'hsl(var(--foreground))',
                  }}
                >
                  {label}
                </text>
              );
            })}
          </g>

          {/* Branch pins */}
          <g>
            {pins.map(({ branch, x, y }, idx) => {
              const isActive = branch.id === activeBranchId;
              return (
                <g
                  key={branch.id}
                  role="button"
                  tabIndex={0}
                  aria-label={branch.name}
                  onClick={() => onSelectBranch(branch.id)}
                  onKeyDown={onPinKey(branch.id)}
                  className={cn(
                    'cursor-pointer outline-none',
                    'animate-in fade-in zoom-in-50 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                  )}
                  style={{ animationDelay: `${Math.min(idx, 16) * 30}ms` }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 10 : 6.5}
                    style={{
                      fill: isActive ? 'hsl(var(--accent))' : 'hsl(var(--primary-strong))',
                      stroke: 'hsl(var(--card))',
                      strokeWidth: 2,
                      transition: 'r 150ms ease-out',
                    }}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 3.5 : 2.5}
                    style={{ fill: 'hsl(var(--card))' }}
                  />
                  {isActive ? (
                    <circle
                      cx={x}
                      cy={y}
                      r={14}
                      style={{
                        fill: 'none',
                        stroke: 'hsl(var(--accent))',
                        strokeWidth: 1.5,
                        opacity: 0.5,
                      }}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {legend === undefined ? <MapLegend /> : legend}
    </div>
  );
}

function MapLegend() {
  const { t } = useTranslation();
  const stops: { key: string; token: string }[] = [
    { key: 'legendNone', token: 'hsl(var(--muted))' },
    { key: 'legendLow', token: 'hsl(var(--primary) / 0.20)' },
    { key: 'legendMid', token: 'hsl(var(--primary) / 0.45)' },
    { key: 'legendHigh', token: 'hsl(var(--primary))' },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="font-medium">{t('branches.map.legend')}</span>
      {stops.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-full border border-border"
            style={{ backgroundColor: s.token }}
          />
          {t(`branches.map.${s.key}`)}
        </span>
      ))}
    </div>
  );
}
