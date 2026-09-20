import {
  NotoSansLao_400Regular,
  NotoSansLao_500Medium,
  NotoSansLao_600SemiBold,
  NotoSansLao_700Bold,
} from '@expo-google-fonts/noto-sans-lao';
import { NotoSerifLao_600SemiBold } from '@expo-google-fonts/noto-serif-lao';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    NotoSansLao_400Regular,
    NotoSansLao_500Medium,
    NotoSansLao_600SemiBold,
    NotoSansLao_700Bold,
    NotoSerifLao_600SemiBold,
  });
  return loaded;
}
