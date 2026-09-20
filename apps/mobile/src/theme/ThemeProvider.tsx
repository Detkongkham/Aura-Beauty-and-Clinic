import { colorScheme as nativewindColorScheme, vars } from 'nativewind';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { useColorScheme, View } from 'react-native';
import { useUiStore } from '../store/ui.store';
import { buildPalette, paletteVars, setActivePalette, type ColorScheme, type Palette } from './index';

type ThemeContextValue = {
  palette: Palette;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * ຮາກຂອງລະບົບສີ — ອ່ານ tone + ໂໝດ ຈາກ ui.store, resolve 'system' ຕາມ OS,
 * ແລ້ວ:
 *   1. ປ້ອນ token ທັງໝົດເປັນ CSS var ໃຫ້ NativeWind ຜ່ານ `vars()` (class ທຸກໂຕປ່ຽນຕາມ),
 *   2. ຕັ້ງ palette ດິບໃຫ້ theme/index.ts (`colors.x`, `shadow.x`, gradient presets),
 *   3. ບອກ NativeWind ວ່າຢູ່ໂໝດໃດ ເພື່ອໃຫ້ variant `dark:` ໃຊ້ໄດ້.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const tone = useUiStore((s) => s.themeTone);
  const mode = useUiStore((s) => s.colorMode);
  const systemScheme = useColorScheme();

  const scheme: ColorScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const palette = useMemo(() => buildPalette(tone, scheme), [tone, scheme]);

  // ຕ້ອງຕັ້ງກ່ອນ render ລູກ ເພື່ອໃຫ້ `colors.x` ທີ່ອ່ານຕອນ render ໄດ້ຄ່າໃໝ່ແລ້ວ.
  setActivePalette(palette);

  // ບອກ NativeWind ຫຼັງ render (side effect) ເພື່ອບໍ່ໃຫ້ຕັ້ງ state ລະຫວ່າງ render.
  useEffect(() => {
    nativewindColorScheme.set(scheme);
  }, [scheme]);

  const style = useMemo(() => [{ flex: 1 }, vars(paletteVars(palette))], [palette]);
  const value = useMemo(() => ({ palette, isDark: scheme === 'dark' }), [palette, scheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={style}>{children}</View>
    </ThemeContext.Provider>
  );
}

/** palette ປັດຈຸບັນ + ໂໝດ — ໃຊ້ໃນ component ທີ່ຕ້ອງ re-render ເມື່ອປ່ຽນທີມ. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme ຕ້ອງຢູ່ພາຍໃນ <ThemeProvider>');
  return ctx;
}
