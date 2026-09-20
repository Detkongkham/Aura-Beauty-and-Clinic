/**
 * JS mirror ຂອງ token NativeWind — ໃຊ້ບ່ອນທີ່ style prop ຕ້ອງຄ່າດິບ
 * (navigation theme, StatusBar, icon color, shadow). Class-based styling ໃຫ້ໃຊ້ NativeWind.
 *
 * `colors` / `shadow` ເປັນ "live view" ຂອງ palette ທີ່ກຳລັງໃຊ້ຢູ່ (tone + light/dark):
 * ThemeProvider ເອີ້ນ `setActivePalette()` ທຸກຄັ້ງທີ່ຜູ້ໃຊ້ປ່ຽນໂທນ/ໂໝດ ແລ້ວ remount tree
 * ໜຶ່ງເທື່ອ ຈຶ່ງບໍ່ຕ້ອງແກ້ call site ໃດໆ (`colors.primary` ຍັງໃຊ້ໄດ້ຄືເກົ່າ).
 */
import { buildPalette, DEFAULT_TONE, type Palette } from './palette';

export {
  buildPalette,
  paletteVars,
  toneSwatch,
  THEME_TONES,
  COLOR_MODES,
  DEFAULT_TONE,
  type Palette,
  type ThemeTone,
  type ColorMode,
  type ColorScheme,
} from './palette';

// ---- palette ທີ່ກຳລັງໃຊ້ຢູ່ -------------------------------------------------

let active: Palette = buildPalette(DEFAULT_TONE, 'light');

export function getActivePalette(): Palette {
  return active;
}

/** ຕັ້ງ palette ປັດຈຸບັນ — ເອີ້ນຈາກ ThemeProvider ກ່ອນ render ລູກ. */
export function setActivePalette(next: Palette): void {
  active = next;
  shadowCache = buildShadows(next);
}

/**
 * `colors.x` = ຄ່າຂອງ palette ປັດຈຸບັນ (getter, ບໍ່ແມ່ນ snapshot) ຈຶ່ງອ່ານໄດ້ທັງໃນ component
 * ແລະ ໃນ helper ນອກ React tree.
 */
export const colors: Palette = Object.defineProperties(
  {} as Palette,
  Object.fromEntries(
    Object.keys(active).map((key) => [
      key,
      { enumerable: true, get: () => active[key as keyof Palette] },
    ]),
  ),
) as Palette;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  '2xl': 28,
  full: 999,
} as const;

export const fonts = {
  display: 'PlusJakartaSans_700Bold',
  displayBold: 'PlusJakartaSans_800ExtraBold',
  sans: 'PlusJakartaSans_400Regular',
  sansMedium: 'PlusJakartaSans_500Medium',
  sansSemibold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
  lao: 'NotoSansLao_400Regular',
  laoMedium: 'NotoSansLao_500Medium',
  laoSemibold: 'NotoSansLao_600SemiBold',
  laoBold: 'NotoSansLao_700Bold',
  laoSerif: 'NotoSerifLao_600SemiBold',
} as const;

// ---- elevation -------------------------------------------------------------

export type ShadowSpec = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

/**
 * iOS-tuned elevation — Soft UI Evolution (design.md §1.4): tight, low-opacity,
 * ໃຊ້ໝຶກເຂັ້ມສຸດຂອງໂທນເປັນສີເງົາ. ໂໝດມືດເພີ່ມ opacity ຂຶ້ນ ເພາະເງົາດຳເທິງພື້ນມືດເກືອບບໍ່ເຫັນ.
 */
function buildShadows(p: Palette): {
  xs: ShadowSpec;
  card: ShadowSpec;
  lg: ShadowSpec;
  primary: ShadowSpec;
  sm: ShadowSpec;
  md: ShadowSpec;
} {
  const ink = p.scheme === 'dark' ? '#000000' : p.aura900;
  const k = p.scheme === 'dark' ? 2.2 : 1;
  const xs: ShadowSpec = {
    shadowColor: ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05 * k,
    shadowRadius: 2,
    elevation: 1,
  };
  const card: ShadowSpec = {
    shadowColor: ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07 * k,
    shadowRadius: 12,
    elevation: 2,
  };
  const lg: ShadowSpec = {
    shadowColor: ink,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1 * k,
    shadowRadius: 24,
    elevation: 12,
  };
  const primary: ShadowSpec = {
    shadowColor: p.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: p.scheme === 'dark' ? 0.34 : 0.28,
    shadowRadius: 14,
    elevation: 6,
  };
  /** ຊື່ເກົ່າ — keep so existing imports (`shadow.sm` / `shadow.md`) don't break. */
  return { xs, card, lg, primary, sm: card, md: lg };
}

let shadowCache = buildShadows(active);

export const shadow = Object.defineProperties(
  {} as ReturnType<typeof buildShadows>,
  Object.fromEntries(
    (['xs', 'card', 'lg', 'primary', 'sm', 'md'] as const).map((key) => [
      key,
      { enumerable: true, get: () => shadowCache[key] },
    ]),
  ),
) as ReturnType<typeof buildShadows>;

/**
 * Motion tokens — micro-interactions 150–300ms, ease-out on enter / ease-in on exit
 * (app-interface.csv: Animation · Duration & Easing). Consumed by Touchable + screen transitions.
 */
export const motion = {
  pressIn: 90,
  pressOut: 160,
  enter: 240,
  exit: 180,
  pressScale: 0.97,
} as const;
