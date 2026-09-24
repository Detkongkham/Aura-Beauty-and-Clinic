import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View, type TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { CLINIC_PHONE } from '../../config/env';
import { apiForgotPassword, apiResetPassword } from '../../features/auth/auth.api';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import type { AuthScreenProps } from '../../navigation/types';
import {
  AuthBackdrop,
  AuthField,
  AuthHero,
  AuthNavBar,
  Banner,
  PasswordField,
  PasswordStrength,
  PhoneField,
  PrimaryButton,
  SecondaryButton,
  T,
  TextLink,
  isValidPhone,
  loadLastPhone,
  normalizePhone,
} from './auth.parts';

type Step = 'phone' | 'code' | 'done';
const MIN_PASSWORD = 8;

/**
 * Forgot password: 1) phone → a 6-digit code by SMS / e-mail, 2) code + new password.
 * The clinic can also issue an 8-digit code (web-admin ▸ user security) for people who get
 * neither — it's entered in the same step 2, reachable directly via "I have a code".
 */
export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
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

  const sendCode = async () => {
    setTouched(true);
    if (!phoneOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiForgotPassword(normalizePhone(phone));
      setInfo(t('auth.codeSent', { minutes: res.expiresInMinutes }));
      setTouched(false);
      setStep('code');
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const codeOk = /^\d{6,8}$/.test(code);
  const passwordOk = password.length >= MIN_PASSWORD;
  const confirmOk = confirm === password;

  const reset = async () => {
    setTouched(true);
    if (!phoneOk || !codeOk || !passwordOk || !confirmOk) return;
    setBusy(true);
    setError(null);
    try {
      await apiResetPassword({ phone: normalizePhone(phone), code, newPassword: password });
      haptics.success();
      setStep('done');
    } catch (err) {
      haptics.error();
      const e = normalizeError(err);
      const reason = (e.details as { reason?: string } | undefined)?.reason;
      setError(reason === 'CODE_INVALID' ? t('auth.codeInvalid') : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <AuthBackdrop />

      <SafeAreaView className="flex-1" edges={['top']}>
        <AuthNavBar onBack={() => (step === 'code' ? setStep('phone') : navigation.goBack())} />

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
              <AuthHero
                icon={step === 'done' ? 'checkmark-circle-outline' : 'key-outline'}
                title={step === 'done' ? t('auth.resetDone') : step === 'code' ? t('auth.resetTitle') : t('auth.forgotTitle')}
                subtitle={
                  step === 'done'
                    ? t('auth.resetDoneHint')
                    : step === 'code'
                      ? t('auth.resetSubtitle')
                      : t('auth.forgotCodeSubtitle')
                }
              />
            </AnimatedEntrance>

            {step === 'done' ? (
              <AnimatedEntrance index={1} style={{ marginTop: 22 }}>
                <PrimaryButton label={t('auth.backToLogin')} icon="arrow-forward" onPress={() => navigation.navigate('Login')} />
              </AnimatedEntrance>
            ) : (
              <AnimatedEntrance index={1} style={{ marginTop: 22 }}>
                <View className="gap-3.5">
                  <PhoneField
                    label={t('auth.forgotPhoneLabel')}
                    placeholder={t('auth.phonePlaceholder')}
                    returnKeyType={step === 'phone' ? 'send' : 'next'}
                    value={phone}
                    editable={step === 'phone'}
                    onChangeText={setPhone}
                    onSubmitEditing={() => step === 'phone' && void sendCode()}
                    valid={phoneOk}
                    error={touched && !phoneOk ? t('auth.phoneInvalid') : undefined}
                  />

                  {step === 'code' ? (
                    <>
                      {info ? <Banner tone="success" icon="chatbubble-ellipses-outline" message={info} /> : null}
                      <AuthField
                        label={t('auth.resetCode')}
                        icon="keypad-outline"
                        keyboardType="number-pad"
                        autoComplete="one-time-code"
                        textContentType="oneTimeCode"
                        maxLength={8}
                        value={code}
                        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        hint={t('auth.resetCodeHint')}
                        error={touched && !codeOk ? t('auth.codeInvalid') : undefined}
                      />
                      <PasswordField
                        ref={passwordRef}
                        label={t('auth.newPassword')}
                        textContentType="newPassword"
                        autoComplete="password-new"
                        value={password}
                        onChangeText={setPassword}
                        error={touched && !passwordOk ? t('auth.passwordMin', { count: MIN_PASSWORD }) : undefined}
                      />
                      <PasswordStrength value={password} />
                      <PasswordField
                        label={t('auth.confirmPassword')}
                        textContentType="newPassword"
                        value={confirm}
                        onChangeText={setConfirm}
                        returnKeyType="go"
                        onSubmitEditing={() => void reset()}
                        error={touched && !confirmOk ? t('auth.passwordMismatch') : undefined}
                      />
                    </>
                  ) : null}

                  {error ? <Banner tone="error" message={error} /> : null}

                  {step === 'phone' ? (
                    <>
                      <PrimaryButton label={t('auth.sendResetCode')} icon="send" loading={busy} onPress={() => void sendCode()} />
                      <SecondaryButton
                        label={t('auth.haveCode')}
                        icon="keypad-outline"
                        onPress={() => {
                          setTouched(true);
                          if (phoneOk) {
                            setInfo(null);
                            setTouched(false);
                            setStep('code');
                          }
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <PrimaryButton label={t('auth.setNewPassword')} icon="checkmark" loading={busy} onPress={() => void reset()} />
                      <View className="items-center">
                        <TextLink label={t('auth.resendCode')} onPress={() => void sendCode()} />
                      </View>
                    </>
                  )}
                </View>
              </AnimatedEntrance>
            )}

            {step !== 'done' ? (
              <AnimatedEntrance index={2} style={{ marginTop: 20 }}>
                <Banner
                  tone="info"
                  icon="call-outline"
                  message={t('auth.noCodeHelp')}
                  action={{ label: `${t('auth.callClinic')} · ${CLINIC_PHONE}`, onPress: () => void Linking.openURL(`tel:${clinicDial}`) }}
                />
              </AnimatedEntrance>
            ) : null}

            <View className="mt-6 flex-row items-center justify-center gap-1">
              <T className="text-muted-foreground">{t('auth.rememberedIt')}</T>
              <TextLink label={t('auth.backToLogin')} onPress={() => navigation.navigate('Login')} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
