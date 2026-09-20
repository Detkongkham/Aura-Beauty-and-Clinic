import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { colors } from '../../theme';
import { normalizeError } from '../../services/apiError';
import { useGenerateTelegramLinkCode } from './chatbot.api';

export function TelegramLinkSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const generate = useGenerateTelegramLinkCode();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) generate.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onCopy = async (): Promise<void> => {
    if (!generate.data) return;
    try {
      await Clipboard.setStringAsync(generate.data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard ບໍ່ພ້ອມ — ບໍ່ເປັນຫຍັງ */
    }
  };

  const onOpenTelegram = (): void => {
    if (generate.data?.botDeepLink) void Linking.openURL(generate.data.botDeepLink);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('telegram.title')}>
      <View className="gap-3">
        <Text variant="body" className="font-lao text-muted-foreground">
          {t('telegram.instructions')}
        </Text>

        {generate.isPending ? (
          <View className="items-center py-6">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : generate.isError ? (
          <Text variant="caption" className="text-destructive">
            {normalizeError(generate.error).message}
          </Text>
        ) : generate.data ? (
          <View className="items-center gap-3 rounded-2xl border border-border bg-muted py-5">
            <Text
              className="font-sans-semibold text-foreground"
              style={{ fontSize: 26, letterSpacing: 4 }}
            >
              {generate.data.code}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              icon={copied ? 'checkmark-circle' : 'copy-outline'}
              label={copied ? t('referral.copied') : t('telegram.copyCode')}
              onPress={onCopy}
            />
          </View>
        ) : null}

        {generate.data?.botDeepLink ? (
          <Button
            label={t('telegram.openBot')}
            icon="paper-plane-outline"
            onPress={onOpenTelegram}
          />
        ) : (
          <View className="flex-row items-start gap-2 rounded-xl border border-info-soft bg-info-soft px-3.5 py-3">
            <Ionicons name="information-circle-outline" size={16} color={colors.info} />
            <Text variant="caption" className="flex-1 font-lao text-info">
              {t('telegram.noBotYet')}
            </Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}
