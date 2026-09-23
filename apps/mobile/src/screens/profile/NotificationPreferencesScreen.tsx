import { Ionicons } from '@expo/vector-icons';
import type { ConsentChannel, ConsentChannelView } from '@abcp/shared-types';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Notice } from '../../features/booking/booking-kit';
import { useConsentPreferences, useLineLinkCode, useUpdateConsent } from '../../features/consent/consent.api';
import { Card, ListRow, LoadingBlock, SectionHeader } from '../../features/profile/profile-kit';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/**
 * Wave 10G — ການແຈ້ງເຕືອນ & ຄວາມເປັນສ່ວນຕົວ.
 * ໂປຣໂມຊັນ = opt-in ຕໍ່ຊ່ອງທາງ (push / SMS / ອີເມວ / LINE; ປິດເປັນຄ່າເລີ່ມຕົ້ນ). ນັດໝາຍ & ໃບຮັບເງິນ = transactional (ປິດບໍ່ໄດ້).
 * ອີເມວຕ້ອງມີອີເມວໃນໂປຣໄຟລ໌; LINE ຕ້ອງຜູກບັນຊີກ່ອນ (ສົ່ງລະຫັດໃຫ້ LINE OA ຂອງຮ້ານ).
 */
const CHANNELS: ReadonlyArray<{ channel: ConsentChannel; icon: 'notifications-outline' | 'chatbox-outline' | 'mail-outline' | 'chatbubbles-outline' }> = [
  { channel: 'PUSH', icon: 'notifications-outline' },
  { channel: 'SMS', icon: 'chatbox-outline' },
  { channel: 'EMAIL', icon: 'mail-outline' },
  { channel: 'LINE', icon: 'chatbubbles-outline' },
];

export function NotificationPreferencesScreen({ navigation }: AppScreenProps<'NotificationPreferences'>): React.JSX.Element {
  const { t } = useTranslation();
  const prefs = useConsentPreferences();
  const update = useUpdateConsent();
  const lineLink = useLineLinkCode();
  const contacts = prefs.data?.contacts;

  const toggle = (channel: ConsentChannel, granted: boolean): void => {
    update.mutate(
      { channel, granted },
      {
        onSuccess: () => haptics.success(),
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  const linkLine = (): void => {
    lineLink.mutate(undefined, {
      onSuccess: (r) => {
        const buttons: Parameters<typeof Alert.alert>[2] = [{ text: t('common.close'), style: 'cancel' }];
        if (r.addFriendUrl) {
          const url = r.addFriendUrl;
          buttons.push({ text: t('consent.lineOpen'), onPress: () => void Linking.openURL(url) });
        }
        Alert.alert(t('consent.lineLinkTitle'), t('consent.lineLinkBody', { code: r.code }), buttons);
      },
      onError: (err) => Alert.alert('', normalizeError(err).message),
    });
  };

  /** ຊ່ອງນີ້ເປີດໄດ້ບໍ່ (ມີຂໍ້ມູນຕິດຕໍ່) — ປິດໄດ້ສະເໝີ. */
  const reachable = (c: ConsentChannel): boolean =>
    c === 'EMAIL' ? Boolean(contacts?.email) : c === 'LINE' ? Boolean(contacts?.lineLinked) : true;

  const hint = (c: ConsentChannel, v: ConsentChannelView | undefined): string => {
    if (v?.suppressed && !v.granted) return t('consent.unsubscribed');
    if (!reachable(c)) return c === 'EMAIL' ? t('consent.emailMissing') : t('consent.lineNotLinked');
    return t(`consent.hint.${c}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title={t('consent.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <AnimatedEntrance index={0}>
          <Notice tone="primary" icon="shield-checkmark-outline" title={t('consent.noticeTitle')} body={t('consent.noticeBody')} />
        </AnimatedEntrance>

        {prefs.isLoading ? (
          <LoadingBlock rows={4} />
        ) : (
          <>
            <AnimatedEntrance index={1}>
              <View className="gap-2">
                <SectionHeader title={t('consent.promotions')} />
                <Card className="overflow-hidden">
                  {CHANNELS.map(({ channel, icon }, i) => {
                    const v = prefs.data?.channels.find((c) => c.channel === channel);
                    const granted = v?.granted ?? false;
                    const needsLink = channel === 'LINE' && !contacts?.lineLinked;
                    return (
                      <ListRow
                        key={channel}
                        icon={icon}
                        label={t(`consent.label.${channel}`)}
                        value={hint(channel, v)}
                        last={i === CHANNELS.length - 1}
                        onPress={needsLink && !lineLink.isPending ? linkLine : undefined}
                        right={
                          needsLink ? (
                            <Ionicons name="link-outline" size={18} color={colors.primary} />
                          ) : (
                            <Switch
                              value={granted}
                              disabled={update.isPending || (!granted && !reachable(channel))}
                              onValueChange={(on) => toggle(channel, on)}
                              accessibilityLabel={t(`consent.label.${channel}`)}
                              trackColor={{ true: colors.primary }}
                            />
                          )
                        }
                      />
                    );
                  })}
                </Card>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance index={2}>
              <View className="gap-2">
                <SectionHeader title={t('consent.transactional')} />
                <Card className="overflow-hidden">
                  <ListRow icon="calendar-outline" label={t('consent.appointments')} value={t('consent.alwaysOn')} right={<Lock />} />
                  <ListRow icon="receipt-outline" label={t('consent.receipts')} value={t('consent.alwaysOn')} last right={<Lock />} />
                </Card>
              </View>
            </AnimatedEntrance>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Lock(): React.JSX.Element {
  return <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />;
}
