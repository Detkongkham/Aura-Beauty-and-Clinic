import {
  Building2,
  CircleDot,
  Cpu,
  Globe,
  Monitor,
  Smartphone,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import type { Lane } from './systemMap.types';

export interface LaneStyle {
  icon: LucideIcon;
  /** Short English chip — code-like, so it stays Latin in both languages. */
  chip: string;
  bar: string;
  pill: string;
  dot: string;
  band: string;
  /** Raw colour for charts / SVG (Recharts accepts `hsl(var(--x))`). */
  color: string;
  /** Tinted icon chip used on lane labels and node headers. */
  chipSoft: string;
}

export const LANE_STYLE: Record<Lane, LaneStyle> = {
  customer: {
    icon: Smartphone,
    chip: 'APP',
    bar: 'border-l-chart-1',
    pill: 'bg-chart-1 text-white',
    dot: 'bg-chart-1',
    band: 'bg-chart-1/[0.035]',
    color: 'hsl(var(--chart-1))',
    chipSoft: 'bg-chart-1/10 text-chart-1',
  },
  staff: {
    icon: Building2,
    chip: 'STAFF',
    bar: 'border-l-chart-5',
    pill: 'bg-chart-5 text-white',
    dot: 'bg-chart-5',
    band: 'bg-chart-5/[0.035]',
    color: 'hsl(var(--chart-5))',
    chipSoft: 'bg-chart-5/10 text-chart-5',
  },
  admin: {
    icon: Monitor,
    chip: 'ADMIN',
    bar: 'border-l-chart-6',
    pill: 'bg-chart-6 text-white',
    dot: 'bg-chart-6',
    band: 'bg-chart-6/[0.035]',
    color: 'hsl(var(--chart-6))',
    chipSoft: 'bg-chart-6/10 text-chart-6',
  },
  system: {
    icon: Cpu,
    chip: 'SYSTEM',
    bar: 'border-l-chart-3',
    pill: 'bg-chart-3 text-white',
    dot: 'bg-chart-3',
    band: 'bg-chart-3/[0.035]',
    color: 'hsl(var(--chart-3))',
    chipSoft: 'bg-chart-3/10 text-chart-3',
  },
  external: {
    icon: Globe,
    chip: 'EXTERNAL',
    bar: 'border-l-chart-4',
    pill: 'bg-chart-4 text-white',
    dot: 'bg-chart-4',
    band: 'bg-chart-4/[0.035]',
    color: 'hsl(var(--chart-4))',
    chipSoft: 'bg-chart-4/10 text-chart-4',
  },
  main: {
    icon: CircleDot,
    chip: 'STATUS',
    bar: 'border-l-primary',
    pill: 'bg-primary text-primary-foreground',
    dot: 'bg-primary',
    band: 'bg-primary/[0.035]',
    color: 'hsl(var(--primary))',
    chipSoft: 'bg-primary/10 text-primary',
  },
  exception: {
    icon: TriangleAlert,
    chip: 'EXIT',
    bar: 'border-l-destructive',
    pill: 'bg-destructive text-destructive-foreground',
    dot: 'bg-destructive',
    band: 'bg-destructive/[0.03]',
    color: 'hsl(var(--destructive))',
    chipSoft: 'bg-destructive/10 text-destructive',
  },
};
