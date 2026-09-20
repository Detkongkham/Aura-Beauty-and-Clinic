import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import type { AppScreenProps } from '../../navigation/types';

const STEP_ROUTE = {
  1: 'WizardService',
  2: 'WizardDateTime',
  3: 'WizardConfirm',
} as const;

type WizardNav = AppScreenProps<'WizardService' | 'WizardDateTime' | 'WizardConfirm'>['navigation'];

/** ຕົວຊ່ວຍ nav ຮ່ວມຂອງ 3 ຂັ້ນຕອນ: ແຕະ step ຍ້ອນກັບ + ຢືນຢັນອອກຈາກ flow. */
export function useWizardNav(navigation: WizardNav): {
  goToStep: (step: 1 | 2 | 3) => void;
  confirmExit: () => void;
} {
  const { t } = useTranslation();

  const goToStep = useCallback(
    (step: 1 | 2 | 3) => navigation.navigate(STEP_ROUTE[step]),
    [navigation],
  );

  const confirmExit = useCallback(() => {
    Alert.alert(t('wizard.exitTitle'), t('wizard.exitBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('wizard.exitConfirm'),
        style: 'destructive',
        onPress: () => navigation.popToTop(),
      },
    ]);
  }, [navigation, t]);

  return { goToStep, confirmExit };
}
