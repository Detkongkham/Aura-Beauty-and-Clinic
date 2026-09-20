/**
 * NativeWind (Tailwind v3) — Aura mobile design tokens.
 * Mirror ຂອງ apps/web-admin/tailwind.config.ts: ທຸກສີອ້າງ CSS var ເປັນ channel
 * (`rgb(var(--color-x) / <alpha-value>)`) ເພື່ອໃຫ້ alpha modifier (bg-primary/40) ຍັງໃຊ້ໄດ້.
 * ຄ່າເລີ່ມຕົ້ນຢູ່ global.css, ຄ່າຈິງຖືກປ້ອນ runtime ໂດຍ src/theme/ThemeProvider.tsx
 * (ໂທນ azure|teal|indigo|cobalt|amethyst × light|dark).
 * ຫ້າມ hardcode hex ໃນ component — ໃຊ້ token class (bg-primary, text-muted-foreground …).
 */
const c = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: c('background'),
        foreground: c('foreground'),
        card: {
          DEFAULT: c('card'),
          foreground: c('card-foreground'),
        },
        popover: {
          DEFAULT: c('popover'),
          foreground: c('popover-foreground'),
        },

        primary: {
          subtle: c('primary-subtle'),
          DEFAULT: c('primary'),
          hover: c('primary-hover'),
          strong: c('primary-strong'),
          foreground: c('primary-foreground'),
        },
        accent: {
          DEFAULT: c('accent'),
          soft: c('accent-soft'),
          foreground: c('accent-foreground'),
        },

        muted: {
          DEFAULT: c('muted'),
          foreground: c('muted-foreground'),
        },
        border: c('border'),
        input: c('input'),
        ring: c('ring'),

        success: { DEFAULT: c('success'), soft: c('success-soft'), foreground: c('success-foreground') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft'), foreground: c('warning-foreground') },
        destructive: {
          DEFAULT: c('destructive'),
          soft: c('destructive-soft'),
          foreground: c('destructive-foreground'),
        },
        info: { DEFAULT: c('info'), soft: c('info-soft'), foreground: c('info-foreground') },

        /** ບັນໄດແບຣນ — ໃຊ້ໄດ້ໂດຍກົງສຳລັບ tint/badge/gradient stop; ປ່ຽນຕາມໂທນທີ່ເລືອກ. */
        aura: {
          50: c('aura-50'),
          100: c('aura-100'),
          200: c('aura-200'),
          300: c('aura-300'),
          400: c('aura-400'),
          500: c('aura-500'),
          600: c('aura-600'),
          700: c('aura-700'),
          900: c('aura-900'),
        },
        champagne: c('champagne'),

        chart: {
          1: c('chart-1'),
          2: c('chart-2'),
          3: c('chart-3'),
          4: c('chart-4'),
          5: c('chart-5'),
          6: c('chart-6'),
        },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
      },
      fontFamily: {
        display: ['PlusJakartaSans_700Bold'],
        'display-bold': ['PlusJakartaSans_800ExtraBold'],
        sans: ['PlusJakartaSans_400Regular'],
        'sans-medium': ['PlusJakartaSans_500Medium'],
        'sans-semibold': ['PlusJakartaSans_600SemiBold'],
        'sans-bold': ['PlusJakartaSans_700Bold'],
        lao: ['NotoSansLao_400Regular'],
        'lao-medium': ['NotoSansLao_500Medium'],
        'lao-semibold': ['NotoSansLao_600SemiBold'],
        'lao-bold': ['NotoSansLao_700Bold'],
        'lao-serif': ['NotoSerifLao_600SemiBold'],
      },
    },
  },
  plugins: [],
};
