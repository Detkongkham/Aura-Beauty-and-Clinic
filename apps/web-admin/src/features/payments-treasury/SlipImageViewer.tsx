import { ExternalLink, Maximize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

const MIN = 1;
const MAX = 4;
const STEP = 0.5;

/**
 * Slip image with the tools a reviewer actually needs to read a phone screenshot: zoom (buttons,
 * ctrl/⌘ + wheel, double-click), rotate for sideways photos, drag to pan while zoomed, and "open
 * full size". Resets when the slip changes. `zoomSignal` lets the page's `Z` shortcut drive it.
 */
export function SlipImageViewer({
  src,
  slipId,
  zoomSignal,
}: {
  src: string;
  slipId: string;
  zoomSignal: number;
}) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  // ctrl/⌘ + wheel zooms. Native listener: React's wheel handler is passive and can't preventDefault.
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(MAX, Math.max(MIN, z + (e.deltaY < 0 ? STEP : -STEP))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    setZoom(1);
    setRot(0);
    setPan({ x: 0, y: 0 });
    setLoaded(false);
    setFailed(false);
  }, [slipId]);

  useEffect(() => {
    if (zoomSignal > 0) setZoom((z) => (z >= MAX ? 1 : Math.min(MAX, z + 1)));
  }, [zoomSignal]);

  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  const bump = (d: number) => setZoom((z) => Math.min(MAX, Math.max(MIN, z + d)));

  return (
    <div className="space-y-2">
      <div
        ref={frame}
        className={cn(
          'group relative h-[380px] overflow-hidden rounded-xl border border-border bg-[repeating-conic-gradient(hsl(var(--muted))_0_25%,transparent_0_50%)] bg-[length:16px_16px] xl:h-[460px]',
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        )}
        onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({
            x: drag.current.px + (e.clientX - drag.current.x),
            y: drag.current.py + (e.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {!loaded && !failed ? (
          <div className="absolute inset-3 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
        ) : null}
        {failed ? (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {t('payTreasury.slips.imageFailed')}
          </p>
        ) : (
          <img
            src={src}
            alt={t('payTreasury.slips.imageAlt')}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'absolute inset-0 h-full w-full select-none object-contain p-2',
              'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
            }}
          />
        )}

        <div
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card/90 p-0.5 shadow-md backdrop-blur"
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ToolButton
            label={t('payTreasury.slips.viewer.zoomOut')}
            onClick={() => bump(-STEP)}
            disabled={zoom <= MIN}
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
          <span className="w-10 text-center text-2xs font-medium tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <ToolButton
            label={t('payTreasury.slips.viewer.zoomIn')}
            onClick={() => bump(STEP)}
            disabled={zoom >= MAX}
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          <ToolButton
            label={t('payTreasury.slips.viewer.rotate')}
            onClick={() => setRot((r) => (r + 90) % 360)}
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label={t('payTreasury.slips.viewer.fit')}
            onClick={() => {
              setZoom(1);
              setRot(0);
            }}
            disabled={zoom === 1 && rot === 0}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('payTreasury.slips.openImage')}
            title={t('payTreasury.slips.openImage')}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        {t('payTreasury.slips.viewer.hint')}
      </p>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
