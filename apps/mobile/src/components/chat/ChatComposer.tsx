import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, TextInput, View } from 'react-native';
import { useSendChatMedia, useSendChatMessage } from '../../features/appointments/chat.api';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { cn } from '../../lib/cn';
import { colors, shadow } from '../../theme';
import { Text } from '../ui/Text';
import { Touchable } from '../ui/Touchable';

function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

function imageMimeOf(m: string | null | undefined): (typeof ALLOWED_IMAGE_MIME)[number] {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(m ?? '')
    ? (m as (typeof ALLOWED_IMAGE_MIME)[number])
    : 'image/jpeg';
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Composer ຮ່ວມກັນທຸກໜ້າແຊັດ — ຂໍ້ຄວາມ + ຮູບ (ກ້ອງ/ຄັງຮູບ) + ອັດສຽງ. Self-contained: ຮັບແຕ່
 * `threadId`, ຈັດການ mutation ພາຍໃນ, parent screen ບໍ່ຕ້ອງຮູ້ລາຍລະອຽດ.
 */
export function ChatComposer({
  threadId,
  locked = false,
}: {
  threadId: string;
  /** ຫ້ອງຖືກປິດ (moderation/auto-lock) — ອ່ານໄດ້ ແຕ່ສົ່ງບໍ່ໄດ້, ສະແດງແຈ້ງການແທນ composer. */
  locked?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const send = useSendChatMessage(threadId);
  const sendMedia = useSendChatMedia(threadId);
  const recorder = useVoiceRecorder();

  const onSendText = (): void => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    send.mutate(body, {
      onError: (err) => {
        setDraft(body);
        Alert.alert('', normalizeError(err).message);
      },
    });
  };

  const uploadImage = async (fromCamera: boolean): Promise<void> => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('', t('chat.permissionDenied'));
        return;
      }
      const launch = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const res = await launch({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset?.base64) return;

      await sendMedia.mutateAsync({
        messageType: 'IMAGE',
        contentType: imageMimeOf(asset.mimeType),
        dataBase64: asset.base64,
      });
      haptics.select();
    } catch (err) {
      Alert.alert('', normalizeError(err).message);
    }
  };

  const onAttach = (): void => {
    Alert.alert(t('chat.attachTitle'), undefined, [
      { text: t('chat.takePhoto'), onPress: () => void uploadImage(true) },
      { text: t('chat.pickPhoto'), onPress: () => void uploadImage(false) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const onStartRecording = async (): Promise<void> => {
    const started = await recorder.start().catch(() => false);
    if (!started) Alert.alert('', t('chat.permissionDenied'));
  };

  const onStopRecording = async (): Promise<void> => {
    const result = await recorder.stop();
    if (!result) return;
    if (result.durationMs < 800) return; // too short — likely an accidental tap
    try {
      await sendMedia.mutateAsync({
        messageType: 'AUDIO',
        contentType: 'audio/m4a',
        dataBase64: result.dataBase64,
      });
      haptics.select();
    } catch (err) {
      Alert.alert('', normalizeError(err).message);
    }
  };

  if (locked) {
    return (
      <View
        className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
        style={{ backgroundColor: colors.warningSoft }}
        accessibilityRole="text"
      >
        <Ionicons name="lock-closed" size={16} color={colors.warning} />
        <View className="flex-1">
          <T className="font-lao-semibold text-foreground">{t('messaging.lockedTitle')}</T>
          <T className="font-lao text-muted-foreground" style={{ fontSize: 10, lineHeight: 14 }}>
            {t('messaging.lockedHint')}
          </T>
        </View>
      </View>
    );
  }

  if (recorder.isRecording) {
    return (
      <View className="flex-row items-center gap-3 rounded-full bg-muted px-4 py-2.5">
        <View className="h-2.5 w-2.5 rounded-full bg-destructive" />
        <T className="flex-1 font-lao text-foreground">
          {t('chat.recording')} · {formatElapsed(recorder.elapsedMs)}
        </T>
        <Touchable onPress={() => void recorder.cancel()} pressScale={0.94} className="px-1">
          <Ionicons name="close" size={20} color={colors.mutedForeground} />
        </Touchable>
        <Touchable
          onPress={() => void onStopRecording()}
          pressScale={0.94}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary"
        >
          <Ionicons name="send" size={15} color={colors.primaryForeground} />
        </Touchable>
      </View>
    );
  }

  const hasDraft = draft.trim().length > 0;
  return (
    <View className="flex-row items-end gap-2">
      <Touchable
        onPress={onAttach}
        disabled={sendMedia.isPending}
        pressScale={0.94}
        accessibilityRole="button"
        accessibilityLabel={t('chat.attachTitle')}
        className="h-10 w-10 items-center justify-center rounded-full bg-muted"
      >
        {sendMedia.isPending ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="add" size={20} color={colors.foreground} />
        )}
      </Touchable>

      <View className="min-h-10 flex-1 justify-center rounded-3xl border border-border bg-card px-3.5">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          multiline
          maxLength={2000}
          accessibilityLabel={t('chat.placeholder')}
          className="font-lao text-foreground"
          style={{ fontSize: 12, lineHeight: 17, maxHeight: 104, paddingTop: 10, paddingBottom: 10 }}
        />
      </View>

      <Touchable
        onPress={hasDraft ? onSendText : () => void onStartRecording()}
        disabled={send.isPending || sendMedia.isPending}
        pressScale={0.94}
        accessibilityRole="button"
        accessibilityLabel={hasDraft ? t('chat.send') : t('chat.recordVoice')}
        className={cn(
          'h-10 w-10 items-center justify-center rounded-full',
          hasDraft ? 'bg-primary' : 'bg-primary-subtle',
        )}
        style={hasDraft ? shadow.primary : undefined}
      >
        <Ionicons
          name={hasDraft ? 'arrow-up' : 'mic-outline'}
          size={18}
          color={hasDraft ? colors.primaryForeground : colors.primaryStrong}
        />
      </Touchable>
    </View>
  );
}
