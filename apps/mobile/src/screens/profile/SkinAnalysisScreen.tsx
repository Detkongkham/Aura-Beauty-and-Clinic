import type { SkinAnalysisKind, SkinAnalysisView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Chip } from '../../components/ui/Chip';
import { Gradient } from '../../components/ui/Gradient';
import { Segmented } from '../../components/ui/Segmented';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Touchable } from '../../components/ui/Touchable';
import { useCreateAnalysis, useMyAnalyses } from '../../features/skin-analysis/skin-analysis.api';
import {
  Card,
  EmptyBlock,
  HeaderAction,
  IconTile,
  KeyValue,
  Notice,
  Pill,
  SectionHeader,
  SMALL,
  T,
  type IconName,
  type Tone,
} from '../../features/profile/profile-kit';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/**
 * ໂມດູນ 30 — ກວດຜິວ & ຜົມ. ຜົນທີ່ໄດ້ມາຈາກ heuristic ຝັ່ງ server (ບໍ່ແມ່ນ ML ແທ້, ບໍ່ແມ່ນ
 * ການວິນິດໄສທາງການແພດ) ສະນັ້ນ disclaimer ຕ້ອງເຫັນໄດ້ຢູ່ສະເໝີກ່ອນ ແລະ ຫຼັງການກວດ.
 *
 * ໂຄງໜ້າ = ScrollView (ກ່ອນນີ້ເປັນ <View> ຄົງທີ່ ເຮັດໃຫ້ປະຫວັດຍາວລົ້ນຈໍແລ້ວເລື່ອນບໍ່ໄດ້).
 * Type scale ຄົງທີ່ 12px, ບໍ່ມີຕົວເລກ DISPLAY ໃນໜ້ານີ້.
 */

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
type Mime = (typeof ALLOWED_MIME)[number];
function mimeOf(m: string | null | undefined): Mime {
  return (ALLOWED_MIME as readonly string[]).includes(m ?? '') ? (m as Mime) : 'image/jpeg';
}

const LABEL_TONE: Record<string, Tone> = {
  BALANCED_SKIN: 'success',
  HEALTHY_HAIR: 'success',
  MILD_REDNESS: 'warning',
  DRY_TEXTURE_SKIN: 'warning',
  DRY_LOW_SHINE_HAIR: 'warning',
  OILY_SHEEN_SKIN: 'primary',
  HIGH_SHINE_HAIR: 'primary',
};

const KIND_ICON: Record<SkinAnalysisKind, IconName> = { SKIN: 'happy-outline', HAIR: 'cut-outline' };

/** ຄຳແນະນຳກ່ອນຖ່າຍ — ຜົນ heuristic ອ່ອນໄຫວກັບແສງ/ໄລຍະ ຫຼາຍກວ່າສິ່ງອື່ນ. */
const TIPS: readonly { icon: IconName; key: string }[] = [
  { icon: 'sunny-outline', key: 'skinAnalysis.tipLight' },
  { icon: 'scan-outline', key: 'skinAnalysis.tipClose' },
  { icon: 'water-outline', key: 'skinAnalysis.tipClean' },
];

export function SkinAnalysisScreen({ navigation }: AppScreenProps<'SkinAnalysis'>): React.JSX.Element {
  const { t } = useTranslation();
  const [kind, setKind] = useState<SkinAnalysisKind>('SKIN');
  const [latest, setLatest] = useState<SkinAnalysisView | null>(null);
  const [historyKind, setHistoryKind] = useState<SkinAnalysisKind | 'ALL'>('ALL');
  const [detail, setDetail] = useState<SkinAnalysisView | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const history = useMyAnalyses();
  const create = useCreateAnalysis();

  const pastChecks = useMemo(
    () =>
      (history.data ?? [])
        .filter((a) => a.id !== latest?.id)
        .filter((a) => historyKind === 'ALL' || a.kind === historyKind),
    [history.data, latest?.id, historyKind],
  );

  const runAnalysis = async (source: 'camera' | 'library'): Promise<void> => {
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('', t('skinAnalysis.permissionDenied'));
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
      };
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset?.base64) return;

      const result = await create.mutateAsync({
        kind,
        contentType: mimeOf(asset.mimeType),
        dataBase64: asset.base64,
      });
      setLatest(result);
      haptics.success();
    } catch (err) {
      haptics.error();
      Alert.alert('', normalizeError(err).message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('skinAnalysis.title')}
        onBack={() => navigation.goBack()}
        right={
          <HeaderAction
            icon="information-circle-outline"
            label={t('skinAnalysis.aboutTitle')}
            onPress={() => setInfoOpen(true)}
          />
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching}
            onRefresh={() => void history.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* ບັດຖ່າຍຮູບ — ເລືອກປະເພດ ແລ້ວເລືອກແຫຼ່ງຮູບໄດ້ໃນບ່ອນດຽວ (ບໍ່ຕ້ອງຜ່ານ Alert ອີກ) */}
        <AnimatedEntrance index={0}>
          <View className="overflow-hidden rounded-3xl border border-border bg-card" style={shadow.card}>
            <Gradient preset="wash" fill pointerEvents="none" />
            <View className="p-4">
              <View className="flex-row items-center gap-2.5">
                <IconTile icon={KIND_ICON[kind]} size={40} />
                <View className="min-w-0 flex-1">
                  <T className="font-lao-semibold text-foreground">{t('skinAnalysis.captureTitle')}</T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('skinAnalysis.captureSubtitle')}
                  </T>
                </View>
              </View>

              <Segmented
                className="mt-3"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'SKIN', label: t('skinAnalysis.kindSkin') },
                  { value: 'HAIR', label: t('skinAnalysis.kindHair') },
                ]}
              />

              {create.isPending ? (
                <View className="mt-3 items-center gap-2 rounded-2xl border border-border bg-card/80 py-6">
                  <Skeleton className="h-16 w-16 rounded-2xl" />
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('skinAnalysis.analyzing')}
                  </T>
                </View>
              ) : (
                <View className="mt-3 flex-row gap-2.5">
                  <CaptureButton
                    primary
                    icon="camera"
                    label={t('skinAnalysis.takePhoto')}
                    onPress={() => void runAnalysis('camera')}
                  />
                  <CaptureButton
                    icon="images-outline"
                    label={t('skinAnalysis.chooseLibrary')}
                    onPress={() => void runAnalysis('library')}
                  />
                </View>
              )}
            </View>
          </View>
        </AnimatedEntrance>

        {/* ຄຳແນະນຳກ່ອນຖ່າຍ */}
        <AnimatedEntrance index={1}>
          <Card className="p-3.5" flat>
            <T className="font-lao-semibold text-foreground">{t('skinAnalysis.tipsTitle')}</T>
            <View className="mt-2 gap-2">
              {TIPS.map((tip) => (
                <View key={tip.key} className="flex-row items-center gap-2.5">
                  <Ionicons name={tip.icon} size={14} color={colors.primaryStrong} />
                  <T className="flex-1 font-lao text-muted-foreground" style={SMALL}>
                    {t(tip.key)}
                  </T>
                </View>
              ))}
            </View>
          </Card>
        </AnimatedEntrance>

        {/* ຜົນລ່າສຸດ */}
        {latest ? (
          <AnimatedEntrance index={2}>
            <View className="gap-2">
              <SectionHeader title={t('skinAnalysis.resultTitle')} hint={formatDateTime(latest.createdAt)} />
              <ResultCard
                result={latest}
                onBook={() =>
                  latest.recommendedService
                    ? navigation.navigate('ServiceDetail', {
                        serviceId: latest.recommendedService.serviceId,
                      })
                    : undefined
                }
              />
            </View>
          </AnimatedEntrance>
        ) : null}

        {/* ປະຫວັດ */}
        <AnimatedEntrance index={3}>
          <View className="gap-2">
            <SectionHeader
              title={t('skinAnalysis.historyTitle')}
              hint={history.data?.length ? t('skinAnalysis.historyHint', { count: history.data.length }) : null}
            />
            <View className="flex-row gap-1.5 px-1">
              {(['ALL', 'SKIN', 'HAIR'] as const).map((k) => (
                <Chip
                  key={k}
                  size="sm"
                  label={
                    k === 'ALL'
                      ? t('skinAnalysis.filterAll')
                      : k === 'SKIN'
                        ? t('skinAnalysis.kindSkin')
                        : t('skinAnalysis.kindHair')
                  }
                  selected={historyKind === k}
                  onPress={() => setHistoryKind(k)}
                />
              ))}
            </View>

            {history.isLoading ? (
              <View className="gap-2">
                <Skeleton className="h-[68px] w-full rounded-2xl" />
                <Skeleton className="h-[68px] w-full rounded-2xl" />
              </View>
            ) : pastChecks.length === 0 ? (
              <EmptyBlock
                icon="scan-outline"
                title={t('skinAnalysis.historyEmpty')}
                body={t('skinAnalysis.emptyState')}
              />
            ) : (
              <View className="gap-2">
                {pastChecks.map((item) => (
                  <HistoryRow key={item.id} item={item} onPress={() => setDetail(item)} />
                ))}
              </View>
            )}
          </View>
        </AnimatedEntrance>

        <Notice tone="muted" icon="information-circle-outline" body={t('skinAnalysis.disclaimer')} />
      </ScrollView>

      <DetailSheet
        result={detail}
        onClose={() => setDetail(null)}
        onBook={(serviceId) => {
          setDetail(null);
          navigation.navigate('ServiceDetail', { serviceId });
        }}
      />

      <Sheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={t('skinAnalysis.aboutTitle')}
        description={t('skinAnalysis.aboutSubtitle')}
      >
        <View className="gap-3">
          <Notice tone="warning" icon="medkit-outline" body={t('skinAnalysis.disclaimer')} />
          <Notice tone="muted" icon="lock-closed-outline" body={t('skinAnalysis.privacyNote')} />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

// ---- capture button --------------------------------------------------------

function CaptureButton({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      haptic="primary"
      pressScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl',
        primary ? 'bg-primary-strong' : 'border border-border bg-card',
      )}
      style={primary ? shadow.primary : shadow.xs}
    >
      <Ionicons name={icon} size={15} color={primary ? colors.primaryForeground : colors.foreground} />
      <T numberOfLines={1} className={cn('font-lao-semibold', primary ? 'text-white' : 'text-foreground')}>
        {label}
      </T>
    </Touchable>
  );
}

// ---- result ----------------------------------------------------------------

function LabelChips({ labels }: { labels: string[] }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {labels.map((label) => (
        <Pill key={label} label={t(`skinAnalysis.label_${label}`)} tone={LABEL_TONE[label] ?? 'muted'} />
      ))}
    </View>
  );
}

function ResultCard({
  result,
  onBook,
}: {
  result: SkinAnalysisView;
  onBook: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Card className="p-3.5">
      <View className="flex-row gap-3">
        <Image source={{ uri: result.photoUrl }} className="h-20 w-20 rounded-2xl bg-muted" resizeMode="cover" />
        <View className="min-w-0 flex-1 gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name={KIND_ICON[result.kind]} size={12} color={colors.primaryStrong} />
            <T className="font-lao-medium text-muted-foreground" style={SMALL}>
              {result.kind === 'SKIN' ? t('skinAnalysis.kindSkin') : t('skinAnalysis.kindHair')} ·{' '}
              {formatDate(result.createdAt)}
            </T>
          </View>
          <LabelChips labels={result.labels} />
        </View>
      </View>

      <View className="mt-3 rounded-2xl bg-muted p-3">
        <T className="font-lao text-foreground">{result.recommendationText}</T>
      </View>

      {result.recommendedService ? (
        <Touchable
          onPress={onBook}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityLabel={t('skinAnalysis.bookRecommended', {
            service: result.recommendedService.serviceName,
          })}
          className="mt-3 min-h-[44px] flex-row items-center gap-2.5 rounded-2xl bg-primary-subtle px-3 py-2.5"
        >
          <IconTile icon="sparkles" />
          <View className="min-w-0 flex-1">
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('skinAnalysis.recommendedLabel')}
            </T>
            <T numberOfLines={1} className="font-lao-semibold text-primary-strong">
              {result.recommendedService.serviceName}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.primaryStrong} />
        </Touchable>
      ) : null}
    </Card>
  );
}

// ---- history ---------------------------------------------------------------

function HistoryRow({
  item,
  onPress,
}: {
  item: SkinAnalysisView;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${formatDate(item.createdAt)} · ${item.labels.map((l) => t(`skinAnalysis.label_${l}`)).join(', ')}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
      style={shadow.xs}
    >
      <Image source={{ uri: item.photoUrl }} className="h-14 w-14 rounded-xl bg-muted" resizeMode="cover" />
      <View className="min-w-0 flex-1 gap-1">
        <T className="font-lao-medium text-muted-foreground" style={SMALL}>
          {item.kind === 'SKIN' ? t('skinAnalysis.kindSkin') : t('skinAnalysis.kindHair')} ·{' '}
          {formatDate(item.createdAt)}
        </T>
        <LabelChips labels={item.labels} />
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
    </Touchable>
  );
}

// ---- detail sheet ----------------------------------------------------------

function DetailSheet({
  result,
  onClose,
  onBook,
}: {
  result: SkinAnalysisView | null;
  onClose: () => void;
  onBook: (serviceId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Sheet
      open={Boolean(result)}
      onClose={onClose}
      title={t('skinAnalysis.resultTitle')}
      description={result ? formatDateTime(result.createdAt) : undefined}
    >
      {result ? (
        <View className="gap-3">
          <Image source={{ uri: result.photoUrl }} className="h-44 w-full rounded-2xl bg-muted" resizeMode="cover" />
          <LabelChips labels={result.labels} />
          <View className="rounded-2xl bg-muted p-3">
            <KeyValue
              label={t('skinAnalysis.kindLabel')}
              value={result.kind === 'SKIN' ? t('skinAnalysis.kindSkin') : t('skinAnalysis.kindHair')}
            />
            <KeyValue label={t('skinAnalysis.dateLabel')} value={formatDateTime(result.createdAt)} divider={false} />
          </View>
          <T className="font-lao text-foreground">{result.recommendationText}</T>
          {result.recommendedService ? (
            <Touchable
              onPress={() => onBook(result.recommendedService!.serviceId)}
              pressScale={0.97}
              accessibilityRole="button"
              className="min-h-[44px] flex-row items-center gap-2.5 rounded-2xl bg-primary-subtle px-3 py-2.5"
            >
              <IconTile icon="sparkles" />
              <T className="flex-1 font-lao-semibold text-primary-strong" numberOfLines={1}>
                {t('skinAnalysis.bookRecommended', { service: result.recommendedService.serviceName })}
              </T>
              <Ionicons name="chevron-forward" size={15} color={colors.primaryStrong} />
            </Touchable>
          ) : null}
          <Notice tone="muted" icon="information-circle-outline" body={t('skinAnalysis.disclaimer')} />
        </View>
      ) : (
        <View />
      )}
    </Sheet>
  );
}
