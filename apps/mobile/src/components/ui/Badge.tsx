import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './Text';

type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'destructive' | 'info';

const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: 'bg-muted', fg: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  primary: { bg: 'bg-primary-subtle', fg: 'text-primary-strong', dot: 'bg-primary' },
  accent: { bg: 'bg-accent-soft', fg: 'text-accent-foreground', dot: 'bg-accent' },
  success: { bg: 'bg-success-soft', fg: 'text-success', dot: 'bg-success' },
  warning: { bg: 'bg-warning-soft', fg: 'text-warning', dot: 'bg-warning' },
  destructive: { bg: 'bg-destructive-soft', fg: 'text-destructive', dot: 'bg-destructive' },
  info: { bg: 'bg-info-soft', fg: 'text-info', dot: 'bg-info' },
};

export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  className,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}): React.JSX.Element {
  const t = TONE[tone];
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1',
        t.bg,
        className,
      )}
    >
      {dot ? <View className={cn('h-1.5 w-1.5 rounded-full', t.dot)} /> : null}
      <Text
        variant="caption"
        style={{ fontSize: 10, lineHeight: 14 }}
        className={cn('font-lao-medium', t.fg)}
      >
        {label}
      </Text>
    </View>
  );
}
