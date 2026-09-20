import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppLanguage } from '../i18n';
import { setLanguage } from '../i18n';
import { DEFAULT_TONE, type ColorMode, type ThemeTone } from '../theme/palette';

type UiState = {
  language: AppLanguage | null;
  setLanguagePref: (lang: AppLanguage) => void;
  /** ໂທນສີແບຣນ (ຕໍ່ເຄື່ອງ) — ຊຸດດຽວກັນກັບ web-admin Settings ▸ Appearance. */
  themeTone: ThemeTone;
  setThemeTone: (tone: ThemeTone) => void;
  /** ສະຫວ່າງ / ມືດ / ຕາມລະບົບ (ຕໍ່ເຄື່ອງ). */
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  /** ລັອກແອັບດ້ວຍ Face ID / ລາຍນິ້ວມື — ຄ່າຄວາມຕັ້ງໃຈຂອງຜູ້ໃຊ້ (ຍັງບໍ່ທັນຜູກ LocalAuthentication). */
  biometricLock: boolean;
  setBiometricLock: (on: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: null,
      setLanguagePref: (language) => {
        setLanguage(language);
        set({ language });
      },
      themeTone: DEFAULT_TONE,
      setThemeTone: (themeTone) => set({ themeTone }),
      colorMode: 'system',
      setColorMode: (colorMode) => set({ colorMode }),
      biometricLock: false,
      setBiometricLock: (biometricLock) => set({ biometricLock }),
    }),
    {
      name: 'aura.ui',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.language) setLanguage(state.language);
      },
    },
  ),
);
