import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View, type TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { CLINIC_PHONE } from '../../config/env';
import { useAuth } from '../../features/auth/useAuth';
import { colors } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';
import {
  AuthBackdrop,
  AuthHero,
  AuthNavBar,
  Banner,
  Checkbox,
  Divider,
  PasswordField,
  PhoneField,
  PrimaryButton,
  SecondaryButton,
  SMALL,
  T,
  TextLink,
  isValidPhone,
  loadLastPhone,
  normalizePhone,
  rememberPhone,
} from './auth.parts';

const loginFormSchema = z.object({
  phone: z.string().refine(isValidPhone, 'phone'),
  password: z.string().min(1, 'password'),
});
type FormValues = z.infer<typeof loginFormSchema>;

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { login, loginPending, loginError } = useAuth();
  const [remember, setRemember] = useState(true);
  const passwordRef = useRef<TextInput>(null);

  const { control, handleSubmit, setValue } = useForm<FormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { phone: '', password: '' },
    mode: 'onTouched',
  });

  // ຕື່ມເບີທີ່ເຄີຍເຂົ້າສູ່ລະບົບໄວ້ ເພື່ອໃຫ້ພິມແຕ່ລະຫັດຜ່ານ.
  useEffect(() => {
    let alive = true;
    void loadLastPhone().then((saved) => {
      if (!alive || !saved) return;
      setValue('phone', saved.replace(/^0/, ''));
    });
    return () => {
      alive = false;
    };
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const normalized = normalizePhone(values.phone);
    try {
      await login({ phone: normalized, password: values.password });
      rememberPhone(remember ? normalized : null);
    } catch {
      /* ສະແດງຜ່ານ loginError */
    }
  });

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <AuthBackdrop />

      <SafeAreaView className="flex-1" edges={['top']}>
        <AuthNavBar onBack={() => navigation.goBack()} />

        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <AnimatedEntrance index={0}>
              <AuthHero title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} />
            </AnimatedEntrance>

            <AnimatedEntrance index={1} style={{ marginTop: 24 }}>
              <View className="gap-3.5">
                <Controller
                  control={control}
                  name="phone"
                  render={({ field, fieldState }) => (
                    <PhoneField
                      label={t('auth.phone')}
                      placeholder={t('auth.phonePlaceholder')}
                      returnKeyType="next"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      blurOnSubmit={false}
                      valid={isValidPhone(field.value)}
                      error={fieldState.error ? t('auth.phoneInvalid') : undefined}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <PasswordField
                      ref={passwordRef}
                      label={t('auth.password')}
                      placeholder={t('auth.passwordEnter')}
                      textContentType="password"
                      autoComplete="password"
                      returnKeyType="go"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      onSubmitEditing={() => void onSubmit()}
                      error={fieldState.error ? t('auth.passwordRequired') : undefined}
                    />
                  )}
                />

                <View className="flex-row items-center justify-between gap-3">
                  <Checkbox checked={remember} onToggle={() => setRemember((v) => !v)}>
                    <T numberOfLines={1} className="text-muted-foreground">{t('auth.rememberPhone')}</T>
                  </Checkbox>
                  <TextLink label={t('auth.forgotPassword')} onPress={() => navigation.navigate('ForgotPassword')} />
                </View>
              </View>
            </AnimatedEntrance>

            {loginError ? (
              <View className="mt-3">
                <Banner
                  tone="error"
                  message={loginError}
                  action={{ label: t('auth.forgotPassword'), onPress: () => navigation.navigate('ForgotPassword') }}
                />
              </View>
            ) : null}

            <AnimatedEntrance index={2} style={{ marginTop: 20 }}>
              <PrimaryButton
                label={t('auth.login')}
                icon="arrow-forward"
                loading={loginPending}
                onPress={() => void onSubmit()}
              />
            </AnimatedEntrance>

            <AnimatedEntrance index={3} style={{ marginTop: 24 }}>
              <View className="gap-3">
                <Divider label={t('auth.newToAura')} />
                <SecondaryButton
                  label={t('auth.createAccount')}
                  icon="person-add-outline"
                  onPress={() => navigation.replace('Register')}
                />
              </View>
            </AnimatedEntrance>

            <View className="flex-1" />

            <View className="mt-8 items-center gap-2">
              <View className="flex-row items-center gap-1">
                <T className="text-muted-foreground">{t('auth.needHelp')}</T>
                <TextLink
                  label={t('auth.callClinic')}
                  onPress={() => void Linking.openURL(`tel:${CLINIC_PHONE.replace(/\s/g, '')}`)}
                />
              </View>
              <View className="flex-row items-center gap-1">
                <Ionicons name="shield-checkmark" size={11} color={colors.success} />
                <T style={SMALL} className="text-muted-foreground">{t('auth.securityNote')}</T>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
