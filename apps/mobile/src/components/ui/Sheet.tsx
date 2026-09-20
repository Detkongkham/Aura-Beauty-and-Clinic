import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, shadow } from '../../theme';
import { Text } from './Text';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
};

/** iOS-style bottom sheet — grabber, rounded-3xl top, fading scrim, safe-area inset. */
export function Sheet({ open, onClose, title, description, children }: SheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scrim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(scrim, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : 200,
      useNativeDriver: true,
    }).start();
  }, [open, reduced, scrim]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Animated.View style={{ opacity: scrim }} className="absolute inset-0 bg-black/45">
          <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="close" />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            className="rounded-t-3xl bg-card px-5 pt-3"
            style={[shadow.lg, { paddingBottom: insets.bottom + 20 }]}
          >
            <View className="mb-3 items-center">
              <View className="h-1.5 w-10 rounded-full bg-border" />
            </View>

            {title ? (
              <View className="mb-3 flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="heading">{title}</Text>
                  {description ? <Text variant="caption">{description}</Text> : null}
                </View>
                <Pressable
                  hitSlop={12}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="close"
                  className="h-8 w-8 items-center justify-center rounded-full bg-muted"
                >
                  <Ionicons name="close" size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ) : null}

            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
