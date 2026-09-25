import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clock, Lock, Monitor } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import type { LaneNodeData, StepNodeData } from './systemMap.layout';
import { LANE_STYLE } from './systemMap.styles';
import type { MapNode } from './systemMap.types';

const TONE_COLOR: Record<NonNullable<MapNode['tone']>, string> = {
  success: 'hsl(var(--success))',
  danger: 'hsl(var(--destructive))',
  warning: 'hsl(var(--warning))',
};

/** `hsl(var(--x))` → `hsl(var(--x) / a)` */
const alpha = (color: string, a: number) => color.replace(/\)\)$/, `) / ${a})`);

const HANDLE = '!h-2 !w-2 !min-h-0 !min-w-0 !border-0 !bg-transparent';

function Handles() {
  return (
    <>
      <Handle id="tl" type="target" position={Position.Left} className={HANDLE} />
      <Handle id="tr" type="target" position={Position.Right} className={HANDLE} />
      <Handle id="tt" type="target" position={Position.Top} className={HANDLE} />
      <Handle id="tb" type="target" position={Position.Bottom} className={HANDLE} />
      <Handle id="sl" type="source" position={Position.Left} className={HANDLE} />
      <Handle id="sr" type="source" position={Position.Right} className={HANDLE} />
      <Handle id="st" type="source" position={Position.Top} className={HANDLE} />
      <Handle id="sb" type="source" position={Position.Bottom} className={HANDLE} />
    </>
  );
}

export const StepNode = memo(function StepNode({ data, selected }: NodeProps) {
  const { i18n } = useTranslation();
  const { node, dim, focused, live } = data as StepNodeData;
  const lang = i18n.language.startsWith('lo') ? 'lo' : 'en';
  const s = LANE_STYLE[node.lane];
  const Icon = s.icon;
  const isStatus = node.lane === 'main' || node.lane === 'exception';
  const accent = node.tone ? TONE_COLOR[node.tone] : s.color;
  const on = selected || focused;

  return (
    <div
      style={{
        backgroundImage: `linear-gradient(135deg, ${alpha(accent, 0.09)} 0%, transparent 55%)`,
        boxShadow: on ? `0 0 0 2px ${alpha(accent, 0.55)}, 0 10px 28px -8px ${alpha(accent, 0.45)}` : undefined,
      }}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-card py-2 pl-3 pr-2.5 shadow-[0_1px_2px_hsl(var(--foreground)/0.06),0_4px_12px_-6px_hsl(var(--foreground)/0.12)] transition-[opacity,box-shadow,transform] duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_hsl(var(--foreground)/0.06),0_12px_24px_-10px_hsl(var(--foreground)/0.22)] motion-reduce:hover:translate-y-0',
        dim && 'opacity-25 saturate-50',
      )}
    >
      <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: accent }} />
      <Handles />
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md', s.chipSoft)}>
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="text-[9px] font-semibold leading-none text-muted-foreground">{s.chip}</span>
        {node.permission ? <Lock className="h-3 w-3 text-muted-foreground" aria-label={node.permission} /> : null}
        {node.job ? <Clock className="h-3 w-3 text-chart-4" aria-label={node.job} /> : null}
        {node.route ? <Monitor className="h-3 w-3 text-chart-6" aria-hidden="true" /> : null}
        {node.apis?.length ? (
          <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[9px] font-medium tabular-nums text-muted-foreground">
            {node.apis.length} API
          </span>
        ) : null}
      </div>
      <div className={cn('text-[13.5px] font-semibold leading-snug text-foreground', isStatus && 'font-mono text-[12px]')}>
        {isStatus ? node.title.en : node.title[lang]}
      </div>
      {lang === 'lo' && !isStatus ? (
        <div className="truncate text-[11px] text-muted-foreground">{node.title.en}</div>
      ) : null}
      {isStatus ? <div className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{node.desc[lang]}</div> : null}
      {live ? (
        <div className="mt-1.5 border-t border-border/70 pt-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold leading-none tabular-nums text-foreground">{live.count.toLocaleString('en-US')}</span>
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{Math.round(live.pct * 100)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(live.pct * 100, live.count ? 3 : 0)}%`, background: live.color }} />
          </div>
        </div>
      ) : null}
    </div>
  );
});

export const LaneNode = memo(function LaneNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const { lane, index } = data as LaneNodeData;
  const s = LANE_STYLE[lane];
  const Icon = s.icon;
  return (
    <div
      className={cn(
        'pointer-events-none h-full w-full border-b border-dashed border-border/70',
        index % 2 === 0 ? s.band : 'bg-muted/20',
      )}
    >
      <div className="relative flex h-full w-[132px] flex-col justify-center gap-1.5 border-r border-border/60 bg-card/60 px-3 backdrop-blur-[1px]">
        <span aria-hidden="true" className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: s.color }} />
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg', s.chipSoft)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="text-[12.5px] font-semibold leading-tight text-foreground">{t(`systemMap.lanes.${lane}`)}</span>
        <span className="text-[10px] leading-tight text-muted-foreground">{t(`systemMap.laneHints.${lane}`)}</span>
      </div>
    </div>
  );
});
