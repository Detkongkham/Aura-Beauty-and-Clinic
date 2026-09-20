import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { normalizeError } from '../../services/apiError';
import { useCancelAppointment } from './appointments.api';

export function CancelSheet({
  appointmentId,
  open,
  onClose,
}: {
  appointmentId: string;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const cancel = useCancelAppointment(appointmentId);

  const submit = async (): Promise<void> => {
    try {
      await cancel.mutateAsync(reason.trim() ? { reason: reason.trim() } : {});
      onClose();
    } catch {
      /* surfaced below */
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('appointments.cancelTitle')}>
      <View className="gap-3">
        <Input
          label={t('appointments.cancelReason')}
          value={reason}
          onChangeText={setReason}
          multiline
        />
        {cancel.isError ? (
          <Text variant="caption" className="text-destructive">
            {normalizeError(cancel.error).message}
          </Text>
        ) : null}
        <Button
          label={t('appointments.cancelConfirm')}
          variant="destructive"
          loading={cancel.isPending}
          onPress={submit}
        />
        <Button label={t('appointments.keep')} variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}
