import { zodResolver } from '@hookform/resolvers/zod';
import type { RegisterInput } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { useAuth } from '../../features/auth/useAuth';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';
import {
  AuthBackdrop,
  AuthField,
  AuthHero,
  AuthNavBar,
  Banner,
  Checkbox,
  PasswordField,
  PasswordStrength,
  PhoneField,
  PrimaryButton,
  SMALL,
  SectionLabel,
  T,
  TextLink,
  isValidPhone,
  normalizePhone,
  rememberPhone,
} from './auth.parts';

const registerFormSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().refine(isValidPhone),
    email: z.union([z.literal(''), z.string().trim().email()]),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(1),
    acceptTerms: z.boolean().refine((v) => v),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'] });
type FormValues = z.infer<typeof registerFormSchema>;

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // mutation ແຍກ ເພື່ອອ່ານ status 409 (ເບີຊ້ຳ) ແລ້ວສະເໜີ "ເຂົ້າສູ່ລະບົບແທນ".
  const submit = useMutation({ mutationFn: (payload: RegisterInput) => register(payload) });
  const apiError = submit.error ? normalizeError(submit.error) : null;

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', phone: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
    mode: 'onTouched',
  });
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  const onSubmit = handleSubmit((values) => {
    const phone = normalizePhone(values.phone);
    const email = values.email.trim();
    submit.mutate(
      { name: values.name.trim(), phone, password: values.password, ...(email ? { email } : {}) },
      { onSuccess: () => rememberPhone(phone) },
    );
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
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <AnimatedEntrance index={0}>
              <AuthHero title={t('auth.createAccount')} subtitle={t('auth.registerSubtitle')} />
            </AnimatedEntrance>

            {/* ສິດທິສະມາຊິກໃໝ່ — ເຫດຜົນທີ່ຄວນສະໝັກ. */}
            <AnimatedEntrance index={1} style={{ marginTop: 16 }}>
              <View className="flex-row items-center gap-2.5 rounded-xl border border-accent-soft bg-accent-soft/50 px-3 py-2.5">
                <View className="h-8 w-8 items-center justify-center rounded-lg bg-card">
                  <Ionicons name="gift-outline" size={15} color={colors.accentForeground} />
                </View>
                <View className="flex-1">
                  <T className="font-lao-semibold text-accent-foreground">{t('auth.perkTitle')}</T>
                  <T style={SMALL} className="text-accent-foreground/80">{t('auth.perkBody')}</T>
                </View>
              </View>
            </AnimatedEntrance>

            {/* ຂໍ້ມູນສ່ວນຕົວ */}
            <AnimatedEntrance index={2} style={{ marginTop: 22 }}>
              <View className="gap-3.5">
                <SectionLabel icon="person-circle-outline" label={t('auth.sectionProfile')} />
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <AuthField
                      label={t('auth.name')}
                      icon="person-outline"
                      placeholder={t('auth.namePlaceholder')}
                      autoCapitalize="words"
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => phoneRef.current?.focus()}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error ? t('auth.nameRequired') : undefined}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="phone"
                  render={({ field, fieldState }) => (
                    <PhoneField
                      ref={phoneRef}
                      label={t('auth.phone')}
                      placeholder={t('auth.phonePlaceholder')}
                      hint={t('auth.phoneHint')}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => emailRef.current?.focus()}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      valid={isValidPhone(field.value)}
                      error={fieldState.error ? t('auth.phoneInvalid') : undefined}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <AuthField
                      ref={emailRef}
                      label={t('auth.email')}
                      optionalLabel={t('common.optional')}
                      icon="mail-outline"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      placeholder={t('auth.emailPlaceholder')}
                      hint={t('auth.emailHint')}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error ? t('auth.emailInvalid') : undefined}
                    />
                  )}
                />
              </View>
            </AnimatedEntrance>

            {/* ຄວາມປອດໄພ */}
            <AnimatedEntrance index={3} style={{ marginTop: 22 }}>
              <View className="gap-3.5">
                <SectionLabel icon="shield-checkmark-outline" label={t('auth.sectionSecurity')} />
                <Controller
                  control={control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <View className="gap-2">
                      <PasswordField
                        ref={passwordRef}
                        label={t('auth.password')}
                        placeholder={t('auth.passwordPlaceholder')}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => confirmRef.current?.focus()}
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error ? t('auth.passwordTooShort') : undefined}
                      />
                      <PasswordStrength value={field.value} />
                    </View>
                  )}
                />
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field, fieldState }) => (
                    <PasswordField
                      ref={confirmRef}
                      label={t('auth.confirmPassword')}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      textContentType="newPassword"
                      autoComplete="new-password"
                      returnKeyType="done"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      valid={!!confirmPassword && confirmPassword === password}
                      hint={confirmPassword && confirmPassword === password ? t('auth.passwordsMatch') : undefined}
                      error={fieldState.error ? t('auth.passwordMismatch') : undefined}
                    />
                  )}
                />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance index={4} style={{ marginTop: 18 }}>
              <Controller
                control={control}
                name="acceptTerms"
                render={({ field, fieldState }) => (
                  <View className="gap-1">
                    <Checkbox
                      checked={field.value}
                      error={!!fieldState.error}
                      onToggle={() => field.onChange(!field.value)}
                    >
                      <T className="text-muted-foreground">
                        {t('auth.acceptPrefix')}{' '}
                        <T className="font-lao-semibold text-primary-strong">{t('auth.termsOfService')}</T>{' '}
                        {t('auth.termsConnector')}{' '}
                        <T className="font-lao-semibold text-primary-strong">{t('auth.privacyPolicy')}</T>
                      </T>
                    </Checkbox>
                    {fieldState.error ? (
                      <T style={SMALL} className="pl-[26px] text-destructive">{t('auth.termsRequired')}</T>
                    ) : null}
                  </View>
                )}
              />
            </AnimatedEntrance>

            {apiError ? (
              <View className="mt-3">
                <Banner
                  tone="error"
                  message={apiError.message}
                  action={
                    apiError.status === 409
                      ? { label: t('auth.signInInstead'), onPress: () => navigation.replace('Login') }
                      : undefined
                  }
                />
              </View>
            ) : null}

            <AnimatedEntrance index={5} style={{ marginTop: 20 }}>
              <PrimaryButton
                label={t('auth.register')}
                icon="arrow-forward"
                loading={submit.isPending}
                onPress={() => void onSubmit()}
              />
            </AnimatedEntrance>

            <View className="mt-6 flex-row items-center justify-center gap-1">
              <T className="text-muted-foreground">{t('auth.haveAccount')}</T>
              <TextLink label={t('auth.login')} onPress={() => navigation.replace('Login')} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
