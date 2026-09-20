export type InventoryStatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export const INVENTORY_STAT_TONE: Record<InventoryStatTone, { chip: string; bar: string; ring: string }> = {
  primary: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary', ring: 'border-primary/50 ring-primary/30' },
  success: { chip: 'bg-success-soft text-success', bar: 'bg-success', ring: 'border-success/50 ring-success/30' },
  warning: { chip: 'bg-warning-soft text-warning', bar: 'bg-warning', ring: 'border-warning/50 ring-warning/30' },
  danger: {
    chip: 'bg-destructive-soft text-destructive',
    bar: 'bg-destructive',
    ring: 'border-destructive/50 ring-destructive/30',
  },
  neutral: { chip: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40', ring: 'border-border ring-border' },
};
