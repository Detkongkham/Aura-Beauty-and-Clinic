import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export function LoadingScreen(): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function IconBubble({ icon }: { icon: keyof typeof Ionicons.glyphMap }): React.JSX.Element {
  return (
    <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
      <Ionicons name={icon} size={28} color={colors.mutedForeground} />
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-10">
      <IconBubble icon="cloud-offline-outline" />
      <Text variant="body" className="text-center text-muted-foreground">
        {message}
      </Text>
      {onRetry ? (
        <Button label={t('common.retry')} variant="outline" fullWidth={false} onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View className="items-center justify-center gap-4 px-10 py-16">
      <IconBubble icon={icon} />
      <Text variant="body" className="text-center text-muted-foreground">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} fullWidth={false} onPress={onAction} />
      ) : null}
    </View>
  );
}
