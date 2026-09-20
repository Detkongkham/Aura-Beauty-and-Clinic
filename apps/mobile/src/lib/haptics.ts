import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback — iOS-first premium touch signal. No-op on web; Android gets a
 * lighter equivalent from expo-haptics. Every call is fire-and-forget (never awaited).
 */
export const haptics = {
  /** ແຕະປຸ່ມ / ເລືອກ chip — ເບົາ. */
  select(): void {
    if (Platform.OS === 'web') return;
    void Haptics.selectionAsync();
  },
  /** ກົດປຸ່ມຫຼັກ (ຈອງ, ຢືນຢັນ). */
  tapPrimary(): void {
    if (Platform.OS === 'web') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  /** ສຳເລັດ (ຈອງສຳເລັດ). */
  success(): void {
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  /** ຜິດພາດ / ຄິວຊ້ອນ. */
  error(): void {
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
} as const;
