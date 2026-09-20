import { cn } from '../../lib/cn';
import { formatLAK } from '../../lib/format';
import { Text } from './Text';

export function PriceText({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}): React.JSX.Element {
  return (
    <Text variant="label" className={cn('font-lao-bold text-primary-strong', className)}>
      {formatLAK(amount)}
    </Text>
  );
}
