import type { AuthResponse, TwoFactorSetup } from '@abcp/shared-types';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { apiMfaActivate, apiMfaSetup, apiMfaVerify } from '../../features/auth/auth.api';
import { useAuth } from '../../features/auth/useAuth';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { shadow } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';
import {
  AuthBackdrop,
  AuthField,
  AuthHero,
  AuthNavBar,
  Banner,
  PrimaryButton,
  SMALL,
  SecondaryButton,
  T,
  TextLink,
} from './auth.parts';

const isCode = (v: string, allowRecovery: boolean) =>
  /^\d{6}$/.test(v) || (allowRecovery && /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(v));

/**
 * Second sign-in step for staff with two-step verification (mode `verify`), or the enrolment the
 * clinic's policy forces on first sign-in (mode `setup`): open the authenticator via the otpauth://
 * link (or scan the QR from another screen), confirm a code, then keep the recovery codes.
 */
export function TwoFactorScreen({ navigation, route }: AuthScreenProps<'TwoFactor'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { completeLogin } = useAuth();
  const { mfaToken, mode } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recovery, setRecovery] = useState<{ auth: AuthResponse; codes: string[] } | null>(null);

  const fail = (err: unknown) => {
    haptics.error();
    const e = normalizeError(err);
    if (e.code === 'TOKEN_EXPIRED') {
      navigation.goBack();
      return;
    }
    setError(e.code === 'MFA_INVALID' ? t('twoFactor.wrongCode') : e.message);
  };

  useEffect(() => {
    if (mode !== 'setup') return;
    apiMfaSetup(mfaToken).then(setSetup).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfaToken, mode]);

  const finish = (auth: AuthResponse) => {
    try {
      completeLogin(auth);
    } catch (err) {
      fail(err);
    }
  };

  const submit = async () => {
    const value = code.trim().toUpperCase();
    if (!isCode(value, mode === 'verify')) {
      setError(t('twoFactor.enterCode'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'verify') {
        finish(await apiMfaVerify(mfaToken, value));
      } else {
        const res = await apiMfaActivate(mfaToken, value);
        haptics.success();
        setRecovery({ auth: res, codes: res.recoveryCodes });
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <AuthBackdrop />
      <SafeAreaView className="flex-1" edges={['top']}>
        <AuthNavBar onBack={() => navigation.goBack()} />
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AnimatedEntrance index={0}>
              <AuthHero
                icon="shield-checkmark-outline"
                title={recovery ? t('twoFactor.recoveryTitle') : t('twoFactor.title')}
                subtitle={
                  recovery
                    ? t('twoFactor.recoveryDesc')
                    : mode === 'verify'
                      ? t('twoFactor.verifySubtitle')
                      : t('twoFactor.setupRequiredSubtitle')
                }
              />
            </AnimatedEntrance>

            {recovery ? (
              <AnimatedEntrance index={1} style={{ marginTop: 20 }}>
                <View className="gap-3">
                  <Banner tone="info" icon="warning-outline" message={t('twoFactor.recoveryWarn')} />
                  <View className="flex-row flex-wrap rounded-2xl border border-border bg-card p-3" style={shadow.card}>
                    {recovery.codes.map((c) => (
                      <T key={c} className="w-1/2 py-1 text-center font-mono">
                        {c}
                      </T>
                    ))}
                  </View>
                  <SecondaryButton
                    label={t('twoFactor.copyAll')}
                    icon="copy-outline"
                    onPress={() => {
                      void Clipboard.setStringAsync(recovery.codes.join('\n'));
                      haptics.success();
                    }}
                  />
                  <PrimaryButton label={t('twoFactor.savedContinue')} icon="arrow-forward" onPress={() => finish(recovery.auth)} />
                </View>
              </AnimatedEntrance>
            ) : (
              <AnimatedEntrance index={1} style={{ marginTop: 20 }}>
                <View className="gap-3.5">
                  {mode === 'setup' ? (
                    <View className="items-center gap-3 rounded-2xl border border-border bg-card p-4" style={shadow.card}>
                      {setup ? (
                        <>
                          <View className="rounded-xl bg-white p-2">
                            <QRCode value={setup.otpauthUrl} size={150} />
                          </View>
                          <T style={SMALL} className="text-center text-muted-foreground">
                            {t('twoFactor.setupHint')}
                          </T>
                          <SecondaryButton
                            label={t('twoFactor.openApp')}
                            icon="open-outline"
                            onPress={() => void Linking.openURL(setup.otpauthUrl).catch(() => setError(t('twoFactor.noApp')))}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('twoFactor.copyKey')}
                            onPress={() => {
                              void Clipboard.setStringAsync(setup.secret);
                              haptics.success();
                            }}
                          >
                            <T style={SMALL} className="text-center text-muted-foreground">
                              {t('twoFactor.manualKey')}
                            </T>
                            <T className="text-center font-mono">{setup.secret.match(/.{1,4}/g)?.join(' ')}</T>
                          </Pressable>
                        </>
                      ) : (
                        <T className="text-muted-foreground">{t('common.loading')}</T>
                      )}
                    </View>
                  ) : null}

                  <AuthField
                    label={mode === 'verify' ? t('twoFactor.codeOrRecovery') : t('twoFactor.code')}
                    icon="keypad-outline"
                    value={code}
                    onChangeText={(v) => {
                      setCode(mode === 'verify' ? v.toUpperCase().replace(/[^A-Z0-9-]/g, '') : v.replace(/\D/g, '').slice(0, 6));
                      setError(null);
                    }}
                    keyboardType={mode === 'verify' ? 'default' : 'number-pad'}
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={mode === 'verify' ? 9 : 6}
                    placeholder="123456"
                    returnKeyType="go"
                    onSubmitEditing={() => void submit()}
                    hint={mode === 'verify' ? t('twoFactor.recoveryHint') : undefined}
                  />
                  {error ? <Banner tone="error" message={error} /> : null}
                  <PrimaryButton
                    label={mode === 'verify' ? t('twoFactor.verify') : t('twoFactor.activate')}
                    icon="arrow-forward"
                    loading={busy}
                    disabled={mode === 'setup' && !setup}
                    onPress={() => void submit()}
                  />
                  <View className="items-center">
                    <TextLink label={t('auth.backToLogin')} onPress={() => navigation.goBack()} />
                  </View>
                </View>
              </AnimatedEntrance>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
