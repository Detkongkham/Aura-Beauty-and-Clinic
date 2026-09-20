import type { ExpoConfig } from 'expo/config';

/**
 * `app.json` → `app.config.ts` (Wave 7B.5, Module 29): Android needs the Google Maps API key
 * read from an env var / EAS secret rather than committed to source. iOS uses Apple Maps by
 * default (no key needed) — avoids provisioning a Google iOS key for a Laos-only launch.
 */
const config: ExpoConfig = {
  name: 'Aura',
  slug: 'aura-customer',
  scheme: 'aura',
  version: '0.1.0',
  orientation: 'portrait',
  // 'automatic' = ປ່ອຍໃຫ້ OS ລາຍງານໂໝດຈິງ ເພື່ອໃຫ້ຕົວເລືອກ "ຕາມລະບົບ" ໃນແອັບໃຊ້ໄດ້
  // (ຕ້ອງ rebuild native ຈຶ່ງມີຜົນ).
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    backgroundColor: '#F8FAFC',
    resizeMode: 'contain',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'la.aura.customer',
  },
  android: {
    package: 'la.aura.customer',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FAFAF9',
    },
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
      },
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-localization',
    'expo-secure-store',
    'expo-font',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Aura ໃຊ້ຕຳແໜ່ງຂອງທ່ານເພື່ອຢືນຢັນວ່າທ່ານຢູ່ໃນຮ້ານຕອນລົງເວລາເຂົ້າ-ອອກວຽກ.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Aura ໃຊ້ຮູບຂອງທ່ານເພື່ອບັນທຶກຮູບກ່ອນ/ຫຼັງ ການໃຫ້ບໍລິການ.',
        cameraPermission: 'Aura ໃຊ້ກ້ອງຖ່າຍຮູບເພື່ອບັນທຶກຮູບກ່ອນ/ຫຼັງ ການໃຫ້ບໍລິການ.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Aura ໃຊ້ກ້ອງເພື່ອສະແກນ QR check-in ເມື່ອທ່ານມາຮອດສາຂາ.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/adaptive-icon.png',
        color: '#7C3AED',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-av',
      {
        microphonePermission: 'Aura ໃຊ້ໄມໂຄຣໂຟນເພື່ອສົ່ງຂໍ້ຄວາມສຽງໃນແຊັດ.',
      },
    ],
  ],
  extra: {
    apiBaseUrl: 'http://localhost:4000/api/v1',
  },
};

export default config;
