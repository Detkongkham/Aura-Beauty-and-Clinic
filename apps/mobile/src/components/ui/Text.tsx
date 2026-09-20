import type { TextProps } from 'react-native';
import { Text as RNText } from 'react-native';
import { cn } from '../../lib/cn';

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subtitle'
  | 'body'
  | 'label'
  | 'caption';

/**
 * iOS type ramp (Noto Sans Lao). Leading is set per-step — headings tight, body relaxed.
 * ບໍ່ໃຊ້ letter-spacing / uppercase ກັບ Lao (lao-typography-no-tracking).
 */
const VARIANT: Record<Variant, string> = {
  display: 'font-lao-bold text-[34px] leading-[40px] text-foreground',
  title: 'font-lao-bold text-2xl leading-8 text-foreground',
  heading: 'font-lao-semibold text-lg leading-6 text-foreground',
  subtitle: 'font-lao text-base leading-6 text-muted-foreground',
  body: 'font-lao text-base leading-[24px] text-foreground',
  label: 'font-lao-medium text-[15px] leading-5 text-foreground',
  caption: 'font-lao text-[13px] leading-[18px] text-muted-foreground',
};

export type AppTextProps = TextProps & {
  variant?: Variant;
  className?: string;
};

/** Text ພື້ນຖານ — ຝັງ font Lao + token ສີ. ໃຊ້ແທນ RN <Text> ທົ່ວແອັບ. */
export function Text({ variant = 'body', className, ...rest }: AppTextProps): React.JSX.Element {
  return <RNText className={cn(VARIANT[variant], className)} {...rest} />;
}
