import type { MyAffiliateView, MyReferralView, ReferralUsageView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Touchable } from '../../components/ui/Touchable';
import { useMyAffiliate, useMyReferral, useMyReferralUsages } from '../../features/referral/referral.api';
import {
  Card,
  DISPLAY,
  EmptyBlock,
  HeaderAction,
  HeroCard,
  HeroEyebrow,
  IconTile,
  KeyValue,
  LoadingBlock,
  Notice,
  NUM,
  Pill,
  SectionHeader,
  SMALL,
  StatTile,
  T,
} from '../../features/profile/profile-kit';
import { cn } from '../../lib/cn';
import { formatDate, formatLAK } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/** ໜ້າ ຊວນໝູ່ — 12px ຄົງທີ່; DISPLAY ໃຊ້ພຽງລະຫັດແນະນຳເທິງ hero. */

export function ReferralScreen({ navigation }: AppScreenProps<'Referral'>): React.JSX.Element {
  const { t } = useTranslation();
  const q = useMyReferral();
  const usages = useMyReferralUsages();
  const affiliate = useMyAffiliate(q.data?.isAffiliate ?? false);

  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const data = q.data;
  const shareMessage = data
    ? t('referral.shareMessage', { code: data.code, amount: formatLAK(data.discountAmount) })
    : '';

  const onCopy = async (): Promise<void> => {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(data.code);
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard ບໍ່ພ້ອມ — ບໍ່ເປັນຫຍັງ */
    }
  };

  const onShare = (): void => {
    if (!data) return;
    void Share.share({ message: shareMessage });
  };

  const pending = data ? Math.max(0, data.totalReferred - data.totalRewarded) : 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('referral.title')}
        onBack={() => navigation.goBack()}
        right={
          data ? (
            <HeaderAction icon="qr-code-outline" label={t('referral.qrCta')} onPress={() => setQrOpen(true)} />
          ) : undefined
        }
      />

      {q.isLoading ? (
        <LoadingBlock rows={2} />
      ) : q.isError || !data ? (
        <ErrorView message={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching || usages.isRefetching}
              onRefresh={() => {
                void q.refetch();
                void usages.refetch();
              }}
              tintColor={colors.primary}
            />
          }
        >
          <AnimatedEntrance index={0}>
            <CodeHero data={data} copied={copied} onCopy={onCopy} onQr={() => setQrOpen(true)} />
          </AnimatedEntrance>

          <AnimatedEntrance index={1}>
            <Button label={t('referral.shareCta')} size="md" icon="share-social-outline" onPress={onShare} />
          </AnimatedEntrance>

          {/* ສະຖິຕິ 3 ຊ່ອງ — ເຊີນ / ລໍຖ້າ / ໄດ້ລາງວັນ */}
          <AnimatedEntrance index={2}>
            <View className="flex-row gap-2.5">
              <StatTile
                icon="people-outline"
                value={String(data.totalReferred)}
                label={t('referral.statInvited')}
              />
              <StatTile
                icon="hourglass-outline"
                tone="warning"
                value={String(pending)}
                label={t('referral.statPending')}
              />
              <StatTile
                icon="gift-outline"
                tone="success"
                value={String(data.totalRewarded)}
                label={t('referral.statRewarded')}
              />
            </View>
          </AnimatedEntrance>

          {/* affiliate — ສະແດງສະເພາະບັນຊີທີ່ admin ຮັບເຂົ້າແລ້ວ */}
          {data.isAffiliate ? (
            <AnimatedEntrance index={3}>
              <AffiliateCard
                loading={affiliate.isLoading}
                data={affiliate.data ?? null}
                failed={affiliate.isError}
              />
            </AnimatedEntrance>
          ) : null}

          {/* ວິທີໃຊ້ງານ */}
          <AnimatedEntrance index={4}>
            <Card className="p-3.5">
              <SectionHeader title={t('referral.howTitle')} className="px-0" />
              <View className="mt-2.5 gap-2.5">
                {[1, 2, 3].map((n) => (
                  <View key={n} className="flex-row items-start gap-2.5">
                    <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary-subtle">
                      <T className="font-sans-semibold text-primary-strong" style={SMALL}>
                        {n}
                      </T>
                    </View>
                    <T className="flex-1 font-lao text-muted-foreground">
                      {t(`referral.how${n}`, { amount: formatLAK(data.discountAmount) })}
                    </T>
                  </View>
                ))}
              </View>
              <View className="mt-3">
                <Notice tone="muted" icon="information-circle-outline" body={t('referral.termsNote')} />
              </View>
            </Card>
          </AnimatedEntrance>

          {/* ລາຍຊື່ໝູ່ທີ່ໃຊ້ລະຫັດ */}
          <AnimatedEntrance index={5}>
            <View className="gap-2">
              <SectionHeader
                title={t('referral.activityTitle')}
                hint={usages.data ? t('referral.activityHint', { count: usages.data.total }) : null}
              />
              {usages.isLoading ? (
                <Card className="items-center py-6" flat>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('common.loading')}
                  </T>
                </Card>
              ) : (usages.data?.items.length ?? 0) === 0 ? (
                <EmptyBlock
                  icon="person-add-outline"
                  title={t('referral.activityEmpty')}
                  body={t('referral.activityEmptyBody')}
                  actionLabel={t('referral.shareCta')}
                  onAction={onShare}
                />
              ) : (
                <Card className="px-3.5" flat>
                  {usages.data!.items.map((u, i, arr) => (
                    <UsageRow key={u.id} usage={u} last={i === arr.length - 1} />
                  ))}
                </Card>
              )}
            </View>
          </AnimatedEntrance>
        </ScrollView>
      )}

      <QrSheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        code={data?.code ?? ''}
        amount={data?.discountAmount ?? 0}
      />
    </SafeAreaView>
  );
}

// ---- hero ------------------------------------------------------------------

function CodeHero({
  data,
  copied,
  onCopy,
  onQr,
}: {
  data: MyReferralView;
  copied: boolean;
  onCopy: () => void;
  onQr: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HeroCard>
      <View className="items-center px-4 py-5">
        <HeroEyebrow label={t('referral.yourCode')} />

        {/* ລະຫັດ — ແຕະເພື່ອສຳເນົາ (ຕົວລະຫັດເອງເປັນ target ໃຫຍ່ສຸດ) */}
        <Touchable
          onPress={onCopy}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityLabel={`${t('referral.copy')}: ${data.code}`}
          className="mt-2 flex-row items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5"
        >
          <T className="font-mono text-white" style={DISPLAY}>
            {data.code}
          </T>
          <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={18} color="#fff" />
        </Touchable>

        <T className="mt-1.5 font-lao text-champagne" style={SMALL}>
          {copied ? t('referral.copied') : t('referral.tapToCopy')}
        </T>

        <T className="mt-2.5 text-center font-lao text-white/75" style={SMALL}>
          {t('referral.heroNote', { amount: formatLAK(data.discountAmount) })}
        </T>

        <Touchable
          onPress={onQr}
          pressScale={0.96}
          accessibilityRole="button"
          accessibilityLabel={t('referral.qrCta')}
          className="mt-3 h-9 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5"
        >
          <Ionicons name="qr-code-outline" size={13} color="#fff" />
          <T className="font-lao-semibold text-white">{t('referral.qrCta')}</T>
        </Touchable>
      </View>
    </HeroCard>
  );
}

// ---- affiliate -------------------------------------------------------------

function AffiliateCard({
  loading,
  data,
  failed,
}: {
  loading: boolean;
  data: MyAffiliateView | null;
  failed: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (failed) {
    return <Notice tone="muted" icon="ribbon-outline" body={t('referral.affiliateNote')} />;
  }

  return (
    <Card className="p-3.5">
      <View className="flex-row items-center gap-2.5">
        <IconTile icon="ribbon" tone="accent" size={40} />
        <View className="min-w-0 flex-1">
          <T className="font-lao-semibold text-foreground">{t('referral.affiliateTitle')}</T>
          <T numberOfLines={2} className="font-lao text-muted-foreground" style={SMALL}>
            {t('referral.affiliateNote')}
          </T>
        </View>
        {data ? (
          <Pill tone="accent" label={t('referral.commissionPct', { pct: Math.round(data.commissionRate * 100) })} />
        ) : null}
      </View>

      {loading || !data ? (
        <T className="mt-3 font-lao text-muted-foreground" style={SMALL}>
          {t('common.loading')}
        </T>
      ) : (
        <>
          <View className="mt-3 flex-row gap-2.5">
            <View className="flex-1 rounded-2xl bg-muted p-3">
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('referral.totalEarnings')}
              </T>
              <T className="mt-0.5 font-sans-semibold text-foreground" style={NUM}>
                {formatLAK(data.totalEarnings)}
              </T>
            </View>
            <View className="flex-1 rounded-2xl bg-success-soft p-3">
              <T className="font-lao text-success" style={SMALL}>
                {t('referral.unpaidBalance')}
              </T>
              <T className="mt-0.5 font-sans-semibold text-success" style={NUM}>
                {formatLAK(data.unpaidBalance)}
              </T>
            </View>
          </View>

          {data.payouts.length > 0 ? (
            <View className="mt-3">
              <T className="font-lao-semibold text-foreground">{t('referral.payoutsTitle')}</T>
              <View className="mt-1.5 rounded-2xl bg-muted px-3">
                {data.payouts.slice(0, 5).map((p, i, arr) => (
                  <KeyValue
                    key={p.id}
                    label={formatDate(p.paidAt ?? p.createdAt)}
                    value={`${formatLAK(p.amount)} · ${t(`referral.payoutStatus.${p.status}`)}`}
                    divider={i < arr.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

// ---- usage row -------------------------------------------------------------

function UsageRow({ usage, last }: { usage: ReferralUsageView; last: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View
      className={cn('min-h-[52px] flex-row items-center gap-2.5 py-2.5', !last && 'border-b border-border/70')}
    >
      <Avatar name={usage.referredUserName} size={32} mode="cartoon" />
      <View className="min-w-0 flex-1">
        <T numberOfLines={1} className="font-lao-medium text-foreground">
          {usage.referredUserName}
        </T>
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {formatDate(usage.createdAt)}
        </T>
      </View>
      <Pill
        tone={usage.rewardClaimed ? 'success' : 'warning'}
        icon={usage.rewardClaimed ? 'checkmark-circle' : 'hourglass-outline'}
        label={usage.rewardClaimed ? t('referral.rewarded') : t('referral.awaitingVisit')}
      />
    </View>
  );
}

// ---- QR sheet --------------------------------------------------------------

function QrSheet({
  open,
  onClose,
  code,
  amount,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  amount: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={t('referral.qrTitle')} description={t('referral.qrSubtitle')}>
      <View className="items-center gap-3">
        <View className="rounded-3xl border border-border bg-card p-4" style={shadow.xs}>
          {code ? <QRCode value={code} size={176} /> : null}
        </View>
        <T className="font-mono text-foreground" style={NUM}>
          {code}
        </T>
        <T className="text-center font-lao text-muted-foreground" style={SMALL}>
          {t('referral.heroNote', { amount: formatLAK(amount) })}
        </T>
        <Button
          label={t('referral.shareCta')}
          icon="share-social-outline"
          variant="secondary"
          onPress={() =>
            void Share.share({ message: t('referral.shareMessage', { code, amount: formatLAK(amount) }) })
          }
        />
      </View>
    </Sheet>
  );
}
