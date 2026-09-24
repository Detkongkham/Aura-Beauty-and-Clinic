import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type NavigationState,
  type Theme,
} from '@react-navigation/native';
import { useMemo, useRef } from 'react';
import { useAuthBootstrap } from '../features/auth/useAuthBootstrap';
import { usePreferenceSync } from '../features/auth/preferences';
import { useAuthStore } from '../store/auth.store';
import { fonts } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { LoadingScreen } from '../components/shared/StateViews';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { StaffNavigator } from './StaffNavigator';

export function RootNavigator(): React.JSX.Element {
  useAuthBootstrap();
  usePreferenceSync();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);
  const { palette, isDark } = useTheme();

  const navTheme: Theme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      dark: isDark,
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        background: palette.background,
        card: palette.card,
        text: palette.foreground,
        border: palette.border,
        primary: palette.primary,
        notification: palette.destructive,
      },
      fonts: {
        regular: { fontFamily: fonts.sans, fontWeight: '400' },
        medium: { fontFamily: fonts.sansMedium, fontWeight: '500' },
        bold: { fontFamily: fonts.sansBold, fontWeight: '700' },
        heavy: { fontFamily: fonts.sansBold, fontWeight: '800' },
      },
    }),
    [palette, isDark],
  );

  /**
   * ປ່ຽນໂທນ/ໂໝດ → remount ຕົ້ນໄມ້ navigation ໜຶ່ງເທື່ອ ເພື່ອໃຫ້ໜ້າຈໍທີ່ memo ໄວ້
   * ອ່ານຄ່າ `colors.x` ດິບ (icon tint, shadow) ຊຸດໃໝ່ນຳ. ສະຖານະ navigation ຖືກເກັບ
   * ແລ້ວປ້ອນຄືນ ຈຶ່ງບໍ່ເດັ້ງຜູ້ໃຊ້ອອກຈາກໜ້າທີ່ກຳລັງເບິ່ງຢູ່.
   */
  const stateRef = useRef<NavigationState | undefined>(undefined);
  const themeKey = `${palette.tone}-${palette.scheme}`;

  return (
    <NavigationContainer
      key={themeKey}
      theme={navTheme}
      initialState={stateRef.current}
      onStateChange={(state) => {
        stateRef.current = state;
      }}
    >
      {status === 'hydrating' ? (
        <LoadingScreen />
      ) : status !== 'authed' ? (
        <AuthNavigator />
      ) : role === 'STAFF' ? (
        <StaffNavigator />
      ) : (
        <AppNavigator />
      )}
    </NavigationContainer>
  );
}
