import { Platform } from 'react-native';
import { authHttp, http } from '../services/http';

/**
 * Expo push registration (Module 23).
 * ໂຫລດ native module ແບບ lazy (require ພາຍໃນ function) — ບໍ່ import top-level
 * ເພື່ອບໍ່ໃຫ້ startup / style runtime ພັງ ຖ້າ module ຫາຍ. ທຸກ path ຫໍ່ d້ວຍ try/catch.
 */

let cachedToken: string | null = null;

/** ຮຽກຫຼັງ login ສຳເລັດ. */
export async function registerPushToken(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default;
    if (!Notifications || !Device) return;

    if (!Device.isDevice) return;

    const settings = await Notifications.getPermissionsAsync();
    let granted =
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL;
    if (!granted && settings.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
      });
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token || token === cachedToken) return;
    cachedToken = token;

    await http.post('/notifications/devices', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      deviceName: Device.deviceName ?? undefined,
    });
  } catch {
    // permission denied / offline / no native module — retry on next login
  }
}

/**
 * ຮຽກຕອນ logout — ຖອນ token ອອກຈາກ backend. ຮັບ access token ມາເອງ ເພາະ session ໃນ store ຖືກລ້າງ
 * ທັນທີ (interceptor ຈະບໍ່ມີ token ແນບໃຫ້ແລ້ວ).
 */
export async function unregisterPushToken(accessToken?: string | null): Promise<void> {
  if (!cachedToken) return;
  const token = cachedToken;
  cachedToken = null;
  try {
    await authHttp.delete('/notifications/devices', {
      data: { token },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  } catch {
    // ignore
  }
}
