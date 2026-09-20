import '../global.css';
import './i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingScreen } from './components/shared/StateViews';
import { useAppFonts } from './hooks/useAppFonts';
import { queryClient } from './lib/queryClient';
import { RootNavigator } from './navigation/RootNavigator';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';

export function App(): React.JSX.Element {
  const fontsLoaded = useAppFonts();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ThemedStatusBar />
            {fontsLoaded ? <RootNavigator /> : <LoadingScreen />}
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** ໄອຄອນແຖບສະຖານະ ຕ້ອງກັບຫົວກັບສີພື້ນ — ມືດ→ຕົວໜັງສືຂາວ, ສະຫວ່າງ→ຕົວໜັງສືດຳ. */
function ThemedStatusBar(): React.JSX.Element {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
