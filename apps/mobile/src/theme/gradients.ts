import type { LinearGradientPoint } from 'expo-linear-gradient';
import { getActivePalette, type Palette } from './index';

export type GradientSpec = {
  colors: readonly [string, string, ...string[]];
  start?: LinearGradientPoint;
  end?: LinearGradientPoint;
  locations?: readonly [number, number, ...number[]];
};

/** '#0284C7' + 0.5 → 'rgba(2,132,199,0.5)'. */
function alpha(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/**
 * Gradient presets — ຜູກກັບ palette ປັດຈຸບັນ (ໂທນ + light/dark) ແທນການ hardcode hex,
 * ຈຶ່ງປ່ຽນຕາມການຕັ້ງຄ່າໃນ ໂປຣໄຟລ໌ ▸ ຮູບລັກສະນະ. ໃຊ້ຜ່ານ <Gradient preset="..." />.
 */
export function buildGradients(p: Palette): Record<GradientPreset, GradientSpec> {
  const diagonal = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;
  const scrimInk = p.aura900;
  return {
    /** ປຸ່ມຫຼັກ / chip active — ບັນໄດແບຣນ. */
    brand: { colors: [p.aura400, p.primary, p.primaryStrong], ...diagonal },
    /** hero / promo card — ໝຶກແບຣນເຂັ້ມ ໄລ່ຫາຂັ້ນກາງ (ເຂັ້ມທັງສອງໂໝດ). */
    hero: { colors: [p.aura900, p.primaryStrong], ...diagonal },
    /** ພື້ນຫຼັງ section ອ່ອນໆ — tint ອ່ອນສຸດ → ສີພື້ນ. */
    wash: {
      colors: [p.aura50, p.background],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
    /** ແຖບເນັ້ນເທິງບັດ (luxe) — ແບຣນ → ຄຳຊຳແປນ, ຂວາງ. */
    luxe: {
      colors: [p.primary, p.aura400, p.accentSoft],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    },
    /** ໂຕນຊຳແປນ — badge / accent. */
    gold: { colors: [p.champagne, p.accent], ...diagonal },
    /** ribbon "ຍອດນິຍົມ" ຂວາງມຸມບັດ featured. */
    ribbon: {
      colors: [p.warning, p.chart5],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    },
    /** scrim ເທິງຮູບ — ໃສ → ໝຶກແບຣນເຂັ້ມລຸ່ມ. */
    imageScrim: {
      colors: [alpha(scrimInk, 0), alpha(scrimInk, 0.08), alpha(scrimInk, 0.82)],
      locations: [0, 0.45, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
    /** ຮູບ backdrop → ພື້ນຫຼັງ: ໃສທາງເທິງ ຄ່ອຍໆ ຈືດລົງເປັນສີພື້ນທາງລຸ່ມ. */
    fadeDown: {
      colors: [alpha(p.background, 0), alpha(p.background, 0.65), p.background],
      locations: [0, 0.55, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
    /** success ring. */
    success: { colors: [p.successSoft, p.success], ...diagonal },
    /** skeleton shimmer sweep (horizontal). */
    shimmer: {
      colors: [alpha(p.card, 0), alpha(p.card, 0.6), alpha(p.card, 0)],
      start: { x: 0, y: 0.5 },
      end: { x: 1, y: 0.5 },
    },
  };
}

export type GradientPreset =
  | 'brand'
  | 'hero'
  | 'wash'
  | 'luxe'
  | 'gold'
  | 'ribbon'
  | 'imageScrim'
  | 'fadeDown'
  | 'success'
  | 'shimmer';

const PRESETS: readonly GradientPreset[] = [
  'brand',
  'hero',
  'wash',
  'luxe',
  'gold',
  'ribbon',
  'imageScrim',
  'fadeDown',
  'success',
  'shimmer',
];

/** live view — ອ່ານຄ່າຈາກ palette ປັດຈຸບັນທຸກຄັ້ງທີ່ເຂົ້າເຖິງ. */
export const gradients = Object.defineProperties(
  {} as Record<GradientPreset, GradientSpec>,
  Object.fromEntries(
    PRESETS.map((preset) => [
      preset,
      { enumerable: true, get: () => cached()[preset] },
    ]),
  ),
) as Record<GradientPreset, GradientSpec>;

let cache: { palette: Palette; specs: Record<GradientPreset, GradientSpec> } | null = null;
function cached(): Record<GradientPreset, GradientSpec> {
  const palette = getActivePalette();
  if (!cache || cache.palette !== palette) cache = { palette, specs: buildGradients(palette) };
  return cache.specs;
}
