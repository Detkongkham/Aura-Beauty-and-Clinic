/**
 * Design tokens — mirror ຂອງ apps/web-admin/src/index.css (docs/design.md §1).
 *
 * ເວັບເກັບ token ເປັນ HSL channel ໃນ CSS var ແລ້ວປ່ຽນ tone ດ້ວຍ [data-theme] / ໂໝດມືດດ້ວຍ `.dark`.
 * RN ບໍ່ມີ CSS cascade ແບບນັ້ນ ຈຶ່ງ resolve HSL ດຽວກັນນັ້ນເປັນ hex ໄວ້ລ່ວງໜ້າ ແລ້ວປ້ອນເຂົ້າ NativeWind
 * ດ້ວຍ `vars()` ຢູ່ ThemeProvider (ເບິ່ງ theme/ThemeProvider.tsx).
 *
 * ໂຄງສ້າງດຽວກັນກັບເວັບ:
 *   surface/neutral/status  → ປ່ຽນຕາມ light|dark ເທົ່ານັ້ນ
 *   primary* / ring / chart1 / brand ramp → ປ່ຽນຕາມ "tone" (azure · teal · indigo · cobalt · amethyst)
 * ຫ້າມ hardcode hex ໃນ component — ໃຊ້ token class (bg-primary, text-muted-foreground …)
 * ຫຼື `colors.x` ຈາກ theme/index.ts.
 */

/** ໂທນແບຣນ — ຊຸດດຽວກັນກັບ web-admin (azure ເປັນຄ່າເລີ່ມຕົ້ນ = ສີໂລໂກ້ Aura) + amethyst ຂອງເກົ່າ. */
export type ThemeTone = 'azure' | 'teal' | 'indigo' | 'cobalt' | 'amethyst';
export const THEME_TONES: readonly ThemeTone[] = ['azure', 'teal', 'indigo', 'cobalt', 'amethyst'];
export const DEFAULT_TONE: ThemeTone = 'azure';

/** ຄ່າທີ່ຜູ້ໃຊ້ເລືອກ; 'system' = ຕາມ OS. */
export type ColorMode = 'light' | 'dark' | 'system';
export const COLOR_MODES: readonly ColorMode[] = ['light', 'dark', 'system'];
/** ຄ່າທີ່ resolve ແລ້ວ — ມີແຕ່ສອງອັນ. */
export type ColorScheme = 'light' | 'dark';

/** ບັນໄດ 9 ຂັ້ນຂອງສີແບຣນ — ໃຊ້ໂດຍກົງສຳລັບ tint/badge/gradient stop (class `bg-aura-100` …). */
type Ramp = readonly [string, string, string, string, string, string, string, string, string];
const RAMP_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 900] as const;

type ToneSet = {
  subtle: string;
  primary: string;
  hover: string;
  strong: string;
  /** ສີໜັງສືເທິງ primary — ໃນໂໝດມືດ primary ເປັນ fill ສະຫວ່າງ ຈຶ່ງກາຍເປັນໝຶກເຂັ້ມ. */
  foreground: string;
  ring: string;
  chart1: string;
  ramp: Ramp;
};

/** ພື້ນຜິວ · neutral · status — ບໍ່ຂຶ້ນກັບ tone (ດຽວກັນກັບ `:root` / `.dark` ຂອງເວັບ). */
const SURFACE = {
  light: {
    background: '#F8FAFC',
    foreground: '#1B242C',
    card: '#FFFFFF',
    cardForeground: '#1B242C',
    popover: '#FFFFFF',
    popoverForeground: '#1B242C',
    accent: '#D4AF35',
    accentSoft: '#E2C798',
    accentForeground: '#382A00',
    muted: '#ECF2F9',
    mutedForeground: '#505F6D',
    border: '#DBE6F0',
    input: '#C8D7E5',
    success: '#157E3C',
    successSoft: '#DFFBE9',
    successForeground: '#FFFFFF',
    warning: '#B35609',
    warningSoft: '#FEF3C8',
    warningForeground: '#FFFFFF',
    destructive: '#BA1C1C',
    destructiveSoft: '#FEE1E1',
    destructiveForeground: '#FFFFFF',
    info: '#088EAF',
    infoSoft: '#DBF5FB',
    infoForeground: '#FFFFFF',
    chart2: '#D4AF35',
    chart3: '#7C3BED',
    chart4: '#0D968B',
    chart5: '#E82185',
    chart6: '#B35609',
    /** ຄຳຊຳແປນ — ໃຊ້ເທິງບັດ hero ເຂັ້ມ ຈຶ່ງຄົງຄວາມສະຫວ່າງໄວ້ທັງສອງໂໝດ. */
    champagne: '#E2C798',
  },
  dark: {
    background: '#191C24',
    foreground: '#D3D9DE',
    card: '#20242C',
    cardForeground: '#D3D9DE',
    popover: '#20242C',
    popoverForeground: '#D3D9DE',
    accent: '#CBAE4D',
    accentSoft: '#554730',
    accentForeground: '#F3E6C2',
    muted: '#2A2E37',
    mutedForeground: '#95A1AC',
    border: '#363B45',
    input: '#3F4550',
    success: '#358D55',
    successSoft: '#1E3828',
    successForeground: '#FFFFFF',
    warning: '#B16425',
    warningSoft: '#3D2F1F',
    warningForeground: '#FFFFFF',
    destructive: '#B63535',
    destructiveSoft: '#3F2222',
    destructiveForeground: '#FFFFFF',
    info: '#27849B',
    infoSoft: '#20363C',
    infoForeground: '#FFFFFF',
    chart2: '#CBAE4D',
    chart3: '#9069D3',
    chart4: '#389F96',
    chart5: '#C7578F',
    chart6: '#C27A29',
    champagne: '#D8BC8A',
  },
} as const;

/**
 * ໂທນແບຣນ — ຄ່າ light ມາຈາກ `[data-theme]` ຂອງເວັບ, ຄ່າ dark ມາຈາກ `.dark[data-theme]`.
 * ບັນໄດ (ramp) ໂໝດມືດຖືກປັບໃຫ້ຈືດ/ເຂັ້ມລົງ ເພື່ອບໍ່ໃຫ້ tint ສະຫວ່າງຈ້າເທິງພື້ນມືດ.
 */
const TONE: Record<ThemeTone, Record<ColorScheme, ToneSet>> = {
  azure: {
    light: {
      subtle: '#E1F3FE',
      primary: '#0369A0',
      hover: '#0284C5',
      strong: '#075783',
      foreground: '#FFFFFF',
      ring: '#0DA2E7',
      chart1: '#0284C5',
      ramp: ['#F0F9FF', '#E0F2FE', '#BAE6FD', '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1', '#082F49'],
    },
    dark: {
      subtle: '#213845',
      primary: '#29A6E0',
      hover: '#3EB3EA',
      strong: '#1F7BAD',
      foreground: '#15181E',
      ring: '#29A6E0',
      chart1: '#29A6E0',
      ramp: ['#152228', '#1D2D35', '#283D48', '#3D5F71', '#419BC8', '#4EABDA', '#65B8E2', '#2D87B4', '#0C1A21'],
    },
  },
  teal: {
    light: {
      subtle: '#CBFBF0',
      primary: '#0F756D',
      hover: '#0D968B',
      strong: '#115F5A',
      foreground: '#FFFFFF',
      ring: '#14B8A5',
      chart1: '#0D968B',
      ramp: ['#F0FDFA', '#CCFBF1', '#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E', '#042F2E'],
    },
    dark: {
      subtle: '#203C38',
      primary: '#2E9E91',
      hover: '#31B9A9',
      strong: '#26736C',
      foreground: '#15181E',
      ring: '#32AEA0',
      chart1: '#2E9E91',
      ramp: ['#152826', '#1D3533', '#284845', '#3D716C', '#41C8BA', '#4EDACC', '#65E2D5', '#2DB4A6', '#0C201F'],
    },
  },
  indigo: {
    light: {
      subtle: '#E0E8FF',
      primary: '#463ACB',
      hover: '#5048E5',
      strong: '#372FA2',
      foreground: '#FFFFFF',
      ring: '#6467F2',
      chart1: '#5048E5',
      ramp: ['#EEF2FF', '#E0E7FF', '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4F46E5', '#4338CA', '#1E1B4B'],
    },
    dark: {
      subtle: '#2B2848',
      primary: '#6163D1',
      hover: '#7772DA',
      strong: '#4B43B1',
      foreground: '#15181E',
      ring: '#6163D1',
      chart1: '#6163D1',
      ramp: ['#161528', '#1E1D35', '#2A2848', '#3F3D71', '#4841C8', '#554EDA', '#6B65E2', '#342DB4', '#0F0F1F'],
    },
  },
  cobalt: {
    light: {
      subtle: '#DCEBFE',
      primary: '#1D4FD7',
      hover: '#2463EB',
      strong: '#1E3FAE',
      foreground: '#FFFFFF',
      ring: '#3C83F6',
      chart1: '#2463EB',
      ramp: ['#EFF6FF', '#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#172554'],
    },
    dark: {
      subtle: '#242D42',
      primary: '#4383D0',
      hover: '#5184D6',
      strong: '#3B5AB0',
      foreground: '#15181E',
      ring: '#4179D2',
      chart1: '#4383D0',
      ramp: ['#151B28', '#1D2435', '#283248', '#3D4D71', '#416CC8', '#4E7ADA', '#658CE2', '#2D58B4', '#0E1420'],
    },
  },
  amethyst: {
    light: {
      subtle: '#F3EDFD',
      primary: '#7C3AED',
      hover: '#6D28D9',
      strong: '#5B21B6',
      foreground: '#FFFFFF',
      ring: '#7C3AED',
      chart1: '#7C3AED',
      ramp: ['#FAF8FF', '#F2EDFE', '#E4DAFD', '#CEBCFC', '#A78BFA', '#7C3AED', '#6D28D9', '#5B21B6', '#1E1438'],
    },
    dark: {
      subtle: '#342848',
      primary: '#9B76DB',
      hover: '#A987E3',
      strong: '#7142BD',
      foreground: '#15181E',
      ring: '#9B76DB',
      chart1: '#9B76DB',
      ramp: ['#1C1528', '#261D35', '#342848', '#503D71', '#7341C8', '#814EDA', '#9365E2', '#5E2DB4', '#140F22'],
    },
  },
};

export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;

  primarySubtle: string;
  primary: string;
  primaryHover: string;
  primaryStrong: string;
  primaryForeground: string;

  accent: string;
  accentSoft: string;
  accentForeground: string;

  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;

  success: string;
  successSoft: string;
  successForeground: string;
  warning: string;
  warningSoft: string;
  warningForeground: string;
  destructive: string;
  destructiveSoft: string;
  destructiveForeground: string;
  info: string;
  infoSoft: string;
  infoForeground: string;

  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chart6: string;

  /** ບັນໄດແບຣນ (class `bg-aura-500` …) — ປ່ຽນຕາມ tone. */
  aura50: string;
  aura100: string;
  aura200: string;
  aura300: string;
  aura400: string;
  aura500: string;
  aura600: string;
  aura700: string;
  aura900: string;
  champagne: string;

  /** meta — ໃຫ້ layer ອື່ນ (StatusBar, shadow, gradient) ຮູ້ວ່າກຳລັງຢູ່ໂໝດໃດ / ໂທນໃດ. */
  scheme: ColorScheme;
  tone: ThemeTone;
};

/** ປະກອບ palette ສຳເລັດຮູບຈາກ tone + ໂໝດ. */
export function buildPalette(tone: ThemeTone, scheme: ColorScheme): Palette {
  const s = SURFACE[scheme];
  const t = TONE[tone][scheme];
  return {
    ...s,
    primarySubtle: t.subtle,
    primary: t.primary,
    primaryHover: t.hover,
    primaryStrong: t.strong,
    primaryForeground: t.foreground,
    ring: t.ring,
    chart1: t.chart1,
    aura50: t.ramp[0],
    aura100: t.ramp[1],
    aura200: t.ramp[2],
    aura300: t.ramp[3],
    aura400: t.ramp[4],
    aura500: t.ramp[5],
    aura600: t.ramp[6],
    aura700: t.ramp[7],
    aura900: t.ramp[8],
    scheme,
    tone,
  };
}

/** ສີຕົວຢ່າງຂອງແຕ່ລະໂທນ ສຳລັບປຸ່ມເລືອກໃນໜ້າຕັ້ງຄ່າ. */
export function toneSwatch(tone: ThemeTone, scheme: ColorScheme): { primary: string; soft: string } {
  const t = TONE[tone][scheme];
  return { primary: t.primary, soft: t.subtle };
}

/** '#0284C7' → '2 132 199' (ຮູບແບບ channel ທີ່ `rgb(var(--x) / <alpha-value>)` ຕ້ອງການ). */
function channels(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  return `${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255}`;
}

/** camelCase → kebab-case ພ້ອມແຍກຕົວເລກ: `cardForeground` → `card-foreground`, `chart1` → `chart-1`. */
function varName(key: string): string {
  return `--color-${key
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d+)/g, '$1-$2')
    .toLowerCase()}`;
}

/**
 * palette → CSS custom properties ສຳລັບ `vars()` ຂອງ NativeWind.
 * ຊື່ຕົວປ່ຽນຕ້ອງກົງກັບ tailwind.config.js (`rgb(var(--color-…) / <alpha-value>)`).
 */
export function paletteVars(palette: Palette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value !== 'string' || !value.startsWith('#')) continue;
    out[varName(key)] = channels(value);
  }
  return out;
}

/** ໃຊ້ໂດຍ script ທີ່ຂຽນຄ່າເລີ່ມຕົ້ນລົງ global.css — export ໄວ້ເພື່ອໃຫ້ test ກວດ parity ໄດ້. */
export const RAMP_STEPS = RAMP_KEYS;
