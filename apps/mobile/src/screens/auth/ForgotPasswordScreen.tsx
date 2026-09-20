import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { CLINIC_PHONE } from '../../config/env';
import { colors, shadow } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';
import {
  AuthBackdrop,
  AuthHero,
  AuthNavBar,
  Banner,
  PhoneField,
  PrimaryButton,
  SMALL,
  SecondaryButton,
  T,
  TextLink,
  isValidPhone,
  loadLastPhone,
  normalizePhone,
} from './auth.parts';

/**
 * ຍັງບໍ່ມີ endpoint ຣີເຊັດລະຫັດຜ່ານ (ບໍ່ມີ SMS OTP) — ການກູ້ບັນຊີຜ່ານທີມຄລີນິກ.
 * ໜ້ານີ້ອະທິບາຍຂັ້ນຕອນ ແລະ ເປີດໂທ / SMS ທີ່ແນບເບີທີ່ລົງທະບຽນໄວ້ໃຫ້.
 */
export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const clinicDial = CLINIC_PHONE.replace(/\s/g, '');

  useEffect(() => {
    let alive = true;
    void loadLastPhone().then((saved) => {
      if (alive && saved) setPhone(saved.replace(/^0/, ''));
    });
    return () => {
      alive = false;
    };
  }, []);

  const phoneOk = isValidPhone(phone);

  const sendSms = (): void => {
    if (!phoneOk) {
      setTouched(true);
      return;
    }
    const body = encodeURIComponent(t('auth.smsBody', { phone: normalizePhone(phone) }));
    const sep = Platform.OS === 'ios' ? '&' : '?';
    void Linking.openURL(`sms:${clinicDial}${sep}body=${body}`);
  };

  const steps = [
    { icon: 'call-outline', title: t('auth.forgotStep1'), body: t('auth.forgotStep1Body') },
    { icon: 'id-card-outline', title: t('auth.forgotStep2'), body: t('auth.forgotStep2Body') },
    { icon: 'key-outline', title: t('auth.forgotStep3'), body: t('auth.forgotStep3Body') },
  ] as const;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <AuthBackdrop />

      <SafeAreaView className="flex-1" edges={['top']}>
        <AuthNavBar onBack={() => navigation.goBack()} />

        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <AnimatedEntrance index={0}>
              <AuthHero icon="key-outline" title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} />
            </AnimatedEntrance>

            <AnimatedEntrance index={1} style={{ marginTop: 22 }}>
              <PhoneField
                label={t('auth.forgotPhoneLabel')}
                placeholder={t('auth.phonePlaceholder')}
                hint={t('auth.forgotPhoneHint')}
                returnKeyType="done"
                value={phone}
                onChangeText={setPhone}
                onBlur={() => setTouched(true)}
                valid={phoneOk}
                error={touched && !phoneOk ? t('auth.phoneInvalid') : undefined}
              />
            </AnimatedEntrance>

            {/* ຂັ້ນຕອນ — timeline 3 ຂັ້ນ */}
            <AnimatedEntrance index={2} style={{ marginTop: 20 }}>
              <View className="rounded-2xl bg-card" style={shadow.card}>
                <View className="gap-3 rounded-2xl border border-border p-3.5">
                  <T className="font-lao-semibold">{t('auth.forgotStepsTitle')}</T>
                  {steps.map((s, i) => (
                    <View key={s.icon} className="flex-row gap-3">
                      <View className="items-center">
                        <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-subtle">
                          <Ionicons name={s.icon} size={14} color={colors.primary} />
                        </View>
                        {i < steps.length - 1 ? <View className="mt-1 w-px flex-1 bg-aura-200" /> : null}
                      </View>
                      <View className={i < steps.length - 1 ? 'flex-1 pb-3' : 'flex-1'}>
                        <T className="font-lao-medium">
                          {i + 1}. {s.title}
                        </T>
                        <T style={SMALL} className="mt-0.5 text-muted-foreground">
                          {s.body}
                        </T>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance index={3} style={{ marginTop: 20 }}>
              <View className="gap-2.5">
                <PrimaryButton
                  label={`${t('auth.callClinic')} · ${CLINIC_PHONE}`}
                  icon="call"
                  onPress={() => void Linking.openURL(`tel:${clinicDial}`)}
                />
                <SecondaryButton label={t('auth.sendSms')} icon="chatbubble-ellipses-outline" onPress={sendSms} />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance index={4} style={{ marginTop: 16 }}>
              <Banner tone="info" icon="shield-checkmark-outline" message={t('auth.securityTip')} />
            </AnimatedEntrance>

            <View className="mt-6 flex-row items-center justify-center gap-1">
              <T className="text-muted-foreground">{t('auth.rememberedIt')}</T>
              <TextLink label={t('auth.backToLogin')} onPress={() => navigation.goBack()} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
