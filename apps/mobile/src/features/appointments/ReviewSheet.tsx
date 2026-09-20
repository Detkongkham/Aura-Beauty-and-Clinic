import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { RatingStars } from '../../components/ui/RatingStars';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { normalizeError } from '../../services/apiError';
import { useReviewAppointment } from './appointments.api';

export function ReviewSheet({
  appointmentId,
  open,
  onClose,
}: {
  appointmentId: string;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const review = useReviewAppointment(appointmentId);

  const submit = async (): Promise<void> => {
    try {
      await review.mutateAsync({ rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      onClose();
    } catch {
      /* surfaced below */
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('review.title')}>
      <View className="gap-3">
        <Text variant="label">{t('review.ratingLabel')}</Text>
        <RatingStars value={rating} size={32} onChange={setRating} />
        <Input
          label={t('review.commentLabel')}
          value={comment}
          onChangeText={setComment}
          placeholder={t('review.commentPlaceholder')}
          multiline
        />
        {review.isError ? (
          <Text variant="caption" className="text-destructive">
            {normalizeError(review.error).message}
          </Text>
        ) : null}
        <Button label={t('review.submit')} loading={review.isPending} onPress={submit} />
      </View>
    </Sheet>
  );
}
