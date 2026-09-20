import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { GlassView } from '../../components/ui/GlassView';
import { colors, shadow } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';
import brandLogo from '../../../assets/brand-logo.png';
import heroImage from '../../../assets/welcome-hero.png';
import { LanguageToggle, PrimaryButton, SMALL, SecondaryButton, T, TITLE } from './auth.parts';

export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // welcomeTitle ລົງທ້າຍດ້ວຍ wordmark ທຸກພາສາ — ແຍກເພື່ອໃຫ້ "Aura" ເປັນ serif (ຈຸດເນັ້ນດຽວ).
  const titlePrefix = t('auth.welcomeTitle').split('Aura')[0];

  const highlights = [
    { icon: 'calendar-outline', label: t('auth.featureBooking') },
    { icon: 'sparkles-outline', label: t('auth.featurePerks') },
    { icon: 'chatbubbles-outline', label: t('auth.featureChat') },
  ] as const;

  const trust = [
    { icon: 'ribbon-outline', label: t('auth.trustStandard') },
    { icon: 'medkit-outline', label: t('auth.trustExpert') },
    { icon: 'shield-checkmark-outline', label: t('auth.trustGuarantee') },
  ] as const;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />

      <Image
        source={heroImage}
        resizeMode="cover"
        accessible={false}
        accessibilityIgnoresInvertColors
        className="absolute inset-0 h-full w-full"
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.05)', 'rgba(250,249,252,0.35)', 'rgba(250,249,252,0.86)', '#FAF9FC']}
        locations={[0, 0.35, 0.62, 0.8]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <AnimatedEntrance index={0}>
          <View className="flex-row items-center justify-between px-5 pt-1">
            <View className="h-8 flex-row items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3">
              <View className="h-1.5 w-1.5 rounded-full bg-success" />
              <T style={SMALL} className="font-lao-medium text-aura-900/80">
                {t('auth.locationTag')}
              </T>
            </View>
            <LanguageToggle glass />
          </View>
        </AnimatedEntrance>

        <View className="flex-1 justify-end px-5 pb-4">
          <AnimatedEntrance index={1}>
            <View className="mb-3 h-12 w-12 rounded-2xl bg-card" style={shadow.card}>
              <View className="h-full w-full overflow-hidden rounded-2xl">
                <Image
                  source={brandLogo}
                  resizeMode="contain"
                  accessibilityLabel={t('common.appName')}
                  className="h-full w-full"
                />
              </View>
            </View>

            <View className="flex-row items-center gap-2">
              <View className="h-px w-4 bg-accent-foreground/50" />
              <T style={SMALL} className="font-sans-semibold text-accent-foreground">
                {t('auth.brandEyebrow')}
              </T>
            </View>

            <T accessibilityRole="header" style={[TITLE, { marginTop: 6 }]} className="font-lao-semibold text-aura-900">
              {titlePrefix}
              <T style={{ fontSize: 22, lineHeight: 28 }} className="font-lao-serif text-accent-foreground">
                Aura
              </T>
            </T>
            <T className="mt-1 max-w-[300px] text-aura-900/70">{t('auth.welcomeSubtitle')}</T>
          </AnimatedEntrance>

          {/* ສິ່ງທີ່ເຮັດໄດ້ໃນແອັບ — 3 ແຖວສັ້ນ */}
          <AnimatedEntrance index={2} style={{ marginTop: 14 }}>
            <View className="gap-2">
              {highlights.map((h) => (
                <View key={h.icon} className="flex-row items-center gap-2.5">
                  <View className="h-7 w-7 items-center justify-center rounded-lg border border-white/90 bg-white/80">
                    <Ionicons name={h.icon} size={14} color={colors.primary} />
                  </View>
                  <T className="flex-1 text-aura-900/85">{h.label}</T>
                </View>
              ))}
            </View>
          </AnimatedEntrance>

          {/* ຄວາມໜ້າເຊື່ອຖື — grid 3 ຊ່ອງ (ບໍ່ scroll ແນວນອນ ເພື່ອບໍ່ໃຫ້ມີເນື້ອຫາເຊື່ອງ) */}
          <AnimatedEntrance index={3} style={{ marginTop: 14 }}>
            <View className="flex-row gap-2 border-t border-aura-900/10 pt-3">
              {trust.map((b) => (
                <View
                  key={b.icon}
                  className="flex-1 items-center gap-1 rounded-xl border border-white/90 bg-white/70 px-1.5 py-2"
                >
                  <Ionicons name={b.icon} size={14} color={colors.accentForeground} />
                  <T style={SMALL} numberOfLines={2} className="text-center text-aura-900/75">
                    {b.label}
                  </T>
                </View>
              ))}
            </View>
          </AnimatedEntrance>
        </View>

        <AnimatedEntrance index={4}>
          <View className="rounded-t-[24px]" style={shadow.lg}>
            <GlassView
              intensity={50}
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: 'hidden',
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.7)',
              }}
            >
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.94)', 'rgba(250,248,245,0.98)']}
                style={StyleSheet.absoluteFill}
              />
              <View className="gap-2.5 px-5 pt-5" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
                <PrimaryButton
                  label={t('auth.login')}
                  icon="arrow-forward"
                  onPress={() => navigation.navigate('Login')}
                />
                <SecondaryButton
                  glass
                  label={t('auth.createAccount')}
                  icon="person-add-outline"
                  onPress={() => navigation.navigate('Register')}
                />
                <View className="mt-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-accent-soft/50 px-3 py-1.5">
                  <Ionicons name="gift-outline" size={12} color={colors.accentForeground} />
                  <T style={SMALL} className="text-accent-foreground">
                    {t('auth.welcomePerk')}
                  </T>
                </View>
                <T style={SMALL} className="mt-0.5 self-center text-center text-muted-foreground/80">
                  {t('auth.terms')}
                </T>
              </View>
            </GlassView>
          </View>
        </AnimatedEntrance>
      </SafeAreaView>
    </View>
  );
}
