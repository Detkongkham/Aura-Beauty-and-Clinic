import {
  GIFT_CARD_MAX_AMOUNT,
  GIFT_CARD_MIN_AMOUNT,
  purchaseGiftCardSchema,
  type GiftCardView,
  type PurchaseGiftCardInput,
} from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Gradient } from '../../components/ui/Gradient';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { DEFAULT_BRANCH_ID } from '../../config/env';
import {
  useGiftCardDetail,
  useMyGiftCards,
  usePurchaseGiftCard,
} from '../../features/giftcards/giftcards.api';
import {
  Card,
  CopyPill,
  DISPLAY,
  EmptyBlock,
  HeaderAction,
  HeroCard,
  HeroEyebrow,
  KeyValue,
  LoadingBlock,
  Notice,
  NUM,
  Pill,
  ProgressRail,
  SMALL,
  StatCell,
  T,
  type Tone,
} from '../../features/profile/profile-kit';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime, formatLAK, vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/** ໜ້າ ບັດຂອງຂວັນ — 12px ຄົງທີ່; DISPLAY ໃຊ້ພຽງຍອດລວມເທິງ hero. */

const PRESET_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000] as const;
const MESSAGE_MAX = 500;

type Scope = 'ALL' | 'ACTIVE' | 'PENDING' | 'USED';

/** ສະຖານະທີ່ສະແດງໃນ UI — ຫຍໍ້ຈາກ status + isExpired/isRedeemed ໃຫ້ເປັນຄ່າດຽວ. */
type CardState = 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'DEPLETED' | 'VOID';

function cardState(c: GiftCardView): CardState {
  if (c.status === 'PENDING_PAYMENT') return 'PENDING';
  if (c.status === 'VOID') return 'VOID';
  if (c.isExpired || c.status === 'EXPIRED') return 'EXPIRED';
  if (c.isRedeemed || c.status === 'DEPLETED' || c.currentBalance <= 0) return 'DEPLETED';
  return 'ACTIVE';
}

const STATE_TONE: Record<CardState, Tone> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  EXPIRED: 'destructive',
  DEPLETED: 'muted',
  VOID: 'muted',
};
const STATE_KEY: Record<CardState, string> = {
  ACTIVE: 'giftCards.status.active',
  PENDING: 'giftCards.status.pendingPayment',
  EXPIRED: 'giftCards.status.expired',
  DEPLETED: 'giftCards.status.depleted',
  VOID: 'giftCards.status.void',
};

function matchesScope(c: GiftCardView, scope: Scope): boolean {
  const s = cardState(c);
  if (scope === 'ALL') return true;
  if (scope === 'ACTIVE') return s === 'ACTIVE';
  if (scope === 'PENDING') return s === 'PENDING';
  return s === 'DEPLETED' || s === 'EXPIRED' || s === 'VOID';
}

/** ຈຳນວນມື້ກ່ອນໝົດອາຍຸ (ນັບຕາມເວລາວຽງຈັນ). */
function daysLeft(iso: string): number {
  return vientiane(iso).startOf('day').diff(vientiane().startOf('day'), 'day');
}

export function GiftCardsScreen({ navigation }: AppScreenProps<'GiftCards'>): React.JSX.Element {
  const { t } = useTranslation();
  const cards = useMyGiftCards();

  const [scope, setScope] = useState<Scope>('ALL');
  const [issueOpen, setIssueOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [detailCode, setDetailCode] = useState<string | null>(null);

  const all = useMemo(() => cards.data ?? [], [cards.data]);
  const visible = useMemo(() => all.filter((c) => matchesScope(c, scope)), [all, scope]);

  const totals = useMemo(() => {
    const active = all.filter((c) => cardState(c) === 'ACTIVE');
    return {
      balance: active.reduce((sum, c) => sum + c.currentBalance, 0),
      activeCount: active.length,
      pendingCount: all.filter((c) => cardState(c) === 'PENDING').length,
      soonest: active
        .map((c) => daysLeft(c.expireDate))
        .filter((d) => d >= 0)
        .sort((x, y) => x - y)[0],
    };
  }, [all]);

  const openCheckout = (card: GiftCardView): void => {
    if (!card.purchasePaymentId) return;
    navigation.navigate('GiftCardCheckout', {
      paymentId: card.purchasePaymentId,
      amount: card.initialBalance,
      code: card.code,
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title={t('giftCards.title')}
        onBack={() => navigation.goBack()}
        right={<HeaderAction icon="add" label={t('giftCards.issue')} onPress={() => setIssueOpen(true)} />}
      />

      {cards.isLoading ? (
        <LoadingBlock rows={3} />
      ) : cards.isError ? (
        <ErrorView message={t('common.loadError')} onRetry={() => void cards.refetch()} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={cards.isRefetching}
              onRefresh={() => void cards.refetch()}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View className="mb-1 gap-3.5">
              <AnimatedEntrance index={0}>
                <WalletHero
                  balance={totals.balance}
                  activeCount={totals.activeCount}
                  pendingCount={totals.pendingCount}
                  soonest={totals.soonest}
                  onBuy={() => setIssueOpen(true)}
                  onLookup={() => setLookupOpen(true)}
                />
              </AnimatedEntrance>

              <View className="flex-row flex-wrap gap-1.5 px-1">
                {(['ALL', 'ACTIVE', 'PENDING', 'USED'] as const).map((s) => {
                  const count = all.filter((c) => matchesScope(c, s)).length;
                  return (
                    <Chip
                      key={s}
                      size="sm"
                      label={`${t(`giftCards.scope.${s}`)} ${count}`}
                      selected={scope === s}
                      onPress={() => setScope(s)}
                    />
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyBlock
              icon="gift-outline"
              title={all.length === 0 ? t('giftCards.empty') : t('giftCards.emptyFiltered')}
              body={all.length === 0 ? t('giftCards.emptyBody') : undefined}
              actionLabel={all.length === 0 ? t('giftCards.issue') : undefined}
              onAction={all.length === 0 ? () => setIssueOpen(true) : undefined}
            />
          }
          renderItem={({ item, index }) => (
            <AnimatedEntrance index={index + 1}>
              <GiftCardTile
                card={item}
                onPress={() => setDetailCode(item.code)}
                onPay={() => openCheckout(item)}
              />
            </AnimatedEntrance>
          )}
        />
      )}

      <IssueSheet
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onPurchased={(card) => (card.purchasePaymentId ? openCheckout(card) : undefined)}
      />
      <LookupSheet open={lookupOpen} onClose={() => setLookupOpen(false)} />
      <CardDetailSheet code={detailCode} onClose={() => setDetailCode(null)} onPay={openCheckout} />
    </SafeAreaView>
  );
}

// ---- hero ------------------------------------------------------------------

function HeroAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  primary?: boolean;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl',
        primary ? 'bg-white' : 'border border-white/15 bg-white/10',
      )}
    >
      <Ionicons name={icon} size={14} color={primary ? colors.aura900 : '#FFFFFF'} />
      <T numberOfLines={1} className={cn('font-lao-semibold', primary ? 'text-aura-900' : 'text-white')}>
        {label}
      </T>
    </Touchable>
  );
}

function WalletHero({
  balance,
  activeCount,
  pendingCount,
  soonest,
  onBuy,
  onLookup,
}: {
  balance: number;
  activeCount: number;
  pendingCount: number;
  soonest?: number;
  onBuy: () => void;
  onLookup: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HeroCard>
      <View className="p-4">
        <HeroEyebrow label={t('giftCards.walletLabel')} />
        <T className="mt-2 font-sans-semibold text-white" style={DISPLAY}>
          {formatLAK(balance)}
        </T>
        <T className="mt-0.5 font-lao text-white/70" style={SMALL}>
          {t('giftCards.walletHint', { count: activeCount })}
        </T>

        <View className="mt-3.5 flex-row rounded-2xl border border-white/15 bg-white/10 py-2.5">
          <StatCell dark value={String(activeCount)} label={t('giftCards.scope.ACTIVE')} />
          <StatCell dark border value={String(pendingCount)} label={t('giftCards.scope.PENDING')} />
          <StatCell
            dark
            value={soonest == null ? '—' : t('giftCards.daysShort', { count: Math.max(0, soonest) })}
            label={t('giftCards.soonestExpiry')}
          />
        </View>

        <View className="mt-3 flex-row gap-2">
          <HeroAction primary icon="add" label={t('giftCards.issue')} onPress={onBuy} />
          <HeroAction icon="search-outline" label={t('giftCards.lookupCta')} onPress={onLookup} />
        </View>
      </View>
    </HeroCard>
  );
}

// ---- card tile -------------------------------------------------------------

function GiftCardTile({
  card,
  onPress,
  onPay,
}: {
  card: GiftCardView;
  onPress: () => void;
  onPay: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const state = cardState(card);
  const live = state === 'ACTIVE';
  const pending = state === 'PENDING';
  const left = daysLeft(card.expireDate);
  const used = card.initialBalance > 0 ? 1 - card.currentBalance / card.initialBalance : 0;

  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(card.code);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = (): void => {
    void Share.share({
      message: t('giftCards.shareMessage', {
        code: card.code,
        amount: formatLAK(card.currentBalance),
        date: formatDate(card.expireDate),
      }),
    });
  };

  return (
    <Touchable
      onPress={onPress}
      pressScale={0.985}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={`${t('giftCards.cardLabel')} ${card.code}, ${formatLAK(card.currentBalance)}`}
      className={cn('overflow-hidden rounded-3xl border', live ? 'border-transparent' : 'border-border bg-card')}
      style={shadow.card}
    >
      {live ? <Gradient preset="hero" fill pointerEvents="none" /> : null}
      {live ? (
        <View pointerEvents="none" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-champagne/10" />
      ) : null}

      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="gift" size={13} color={live ? colors.champagne : colors.mutedForeground} />
            <T className={cn('font-lao-medium', live ? 'text-white/75' : 'text-muted-foreground')}>
              {t('giftCards.cardLabel')}
            </T>
          </View>
          {live ? (
            <View className="flex-row items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
              <View className="h-1.5 w-1.5 rounded-full bg-success" />
              <T className="font-lao-semibold text-white" style={SMALL}>
                {t(STATE_KEY[state])}
              </T>
            </View>
          ) : (
            <Pill label={t(STATE_KEY[state])} tone={STATE_TONE[state]} />
          )}
        </View>

        <View className="mt-2.5 flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1">
            <T className={cn('font-sans-semibold', live ? 'text-white' : 'text-foreground')} style={{ fontSize: 22, lineHeight: 28 }}>
              {formatLAK(card.currentBalance)}
            </T>
            <T className={cn('font-lao', live ? 'text-white/60' : 'text-muted-foreground')} style={SMALL}>
              {t('giftCards.of', { amount: formatLAK(card.initialBalance) })} · {card.branchName}
            </T>
          </View>
          <CopyPill dark={live} value={card.code} label={t('giftCards.cardLabel')} copied={copied} onPress={copy} />
        </View>

        {/* ແຖບການໃຊ້ຈ່າຍ — ເຫັນທັນທີວ່າໃຊ້ໄປເທົ່າໃດແລ້ວ */}
        {card.initialBalance > 0 && !pending ? (
          <View className="mt-3 gap-1">
            <ProgressRail value={1 - used} dark={live} height={5} />
            <View className="flex-row items-center justify-between">
              <T className={cn('font-lao', live ? 'text-white/60' : 'text-muted-foreground')} style={SMALL}>
                {t('giftCards.usedPct', { pct: Math.round(used * 100) })}
              </T>
              <T
                className={cn(
                  'font-lao',
                  live ? (left <= 30 ? 'text-champagne' : 'text-white/60') : 'text-muted-foreground',
                )}
                style={SMALL}
              >
                {left < 0
                  ? t('giftCards.expiredOn', { date: formatDate(card.expireDate) })
                  : t('giftCards.expiresIn', { count: left, date: formatDate(card.expireDate) })}
              </T>
            </View>
          </View>
        ) : null}

        {/* ແຖວປຸ່ມ */}
        <View className="mt-3 flex-row gap-2">
          {pending ? (
            <HeroAction primary icon="card-outline" label={t('giftCards.payNow')} onPress={onPay} />
          ) : live ? (
            <>
              <HeroAction icon="share-social-outline" label={t('giftCards.share')} onPress={share} />
              <HeroAction icon="receipt-outline" label={t('giftCards.viewDetail')} onPress={onPress} />
            </>
          ) : (
            <Touchable
              onPress={onPress}
              pressScale={0.97}
              accessibilityRole="button"
              accessibilityLabel={t('giftCards.viewDetail')}
              className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-muted"
            >
              <Ionicons name="receipt-outline" size={13} color={colors.mutedForeground} />
              <T className="font-lao-medium text-muted-foreground">{t('giftCards.viewDetail')}</T>
            </Touchable>
          )}
        </View>
      </View>
    </Touchable>
  );
}

// ---- detail sheet ----------------------------------------------------------

function CardDetailSheet({
  code,
  onClose,
  onPay,
}: {
  code: string | null;
  onClose: () => void;
  onPay: (card: GiftCardView) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const q = useGiftCardDetail(code);
  const card = q.data;
  const state = card ? cardState(card) : null;

  return (
    <Sheet
      open={Boolean(code)}
      onClose={onClose}
      title={t('giftCards.detailTitle')}
      description={code ?? undefined}
    >
      {q.isLoading ? (
        <ActivityIndicator className="py-8" color={colors.primary} />
      ) : q.isError || !card ? (
        <Notice tone="destructive" icon="alert-circle-outline" body={normalizeError(q.error).message} />
      ) : (
        <View className="gap-3">
          {/* QR ໃຫ້ພະນັກງານສະແກນທີ່ເຄົາເຕີ */}
          <View className="items-center gap-2 rounded-2xl border border-border bg-card p-3.5" style={shadow.xs}>
            <View className="rounded-xl bg-white p-2.5">
              <QRCode value={card.code} size={132} />
            </View>
            <T className="font-mono text-foreground" style={NUM}>
              {card.code}
            </T>
            <T className="text-center font-lao text-muted-foreground" style={SMALL}>
              {t('giftCards.qrHint')}
            </T>
          </View>

          <View className="rounded-2xl bg-muted p-3">
            <KeyValue label={t('giftCards.balance')} value={formatLAK(card.currentBalance)} tone="success" />
            <KeyValue label={t('giftCards.initial')} value={formatLAK(card.initialBalance)} />
            <KeyValue label={t('giftCards.branch')} value={card.branchName} />
            <KeyValue label={t('giftCards.recipientEmail')} value={card.recipientEmail} />
            <KeyValue label={t('giftCards.expiryLabel')} value={formatDate(card.expireDate)} />
            <KeyValue
              label={t('giftCards.statusLabel')}
              value={t(STATE_KEY[state ?? 'ACTIVE'])}
              tone={STATE_TONE[state ?? 'ACTIVE']}
              divider={false}
            />
          </View>

          {/* ປະຫວັດການໃຊ້ຈ່າຍ — ມາຈາກ /gift-cards/lookup ເທົ່ານັ້ນ */}
          <View className="gap-1.5">
            <T className="px-1 font-lao-semibold text-foreground">{t('giftCards.ledgerTitle')}</T>
            {card.transactions && card.transactions.length > 0 ? (
              card.transactions.map((tx) => (
                <View
                  key={tx.id}
                  className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <View className="min-w-0 flex-1">
                    <T numberOfLines={1} className="font-lao-medium text-foreground">
                      {tx.amount < 0 ? t('giftCards.txSpend') : t('giftCards.txTopUp')}
                    </T>
                    <T className="font-lao text-muted-foreground" style={SMALL}>
                      {formatDateTime(tx.createdAt)}
                    </T>
                  </View>
                  <View className="items-end">
                    <T className={cn('font-sans-semibold', tx.amount < 0 ? 'text-destructive' : 'text-success')}>
                      {tx.amount < 0 ? '−' : '+'}
                      {formatLAK(Math.abs(tx.amount))}
                    </T>
                    <T className="font-sans text-muted-foreground" style={SMALL}>
                      {formatLAK(tx.balanceAfter)}
                    </T>
                  </View>
                </View>
              ))
            ) : (
              <View className="rounded-xl border border-dashed border-border px-3 py-4">
                <T className="text-center font-lao text-muted-foreground" style={SMALL}>
                  {t('giftCards.ledgerEmpty')}
                </T>
              </View>
            )}
          </View>

          {state === 'PENDING' && card.purchasePaymentId ? (
            <Button
              label={t('giftCards.payNow')}
              icon="card-outline"
              onPress={() => {
                onClose();
                onPay(card);
              }}
            />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

// ---- lookup sheet ----------------------------------------------------------

function LookupSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const q = useGiftCardDetail(code);

  const close = (): void => {
    setDraft('');
    setCode(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={t('giftCards.lookupTitle')} description={t('giftCards.lookupSubtitle')}>
      <View className="gap-3">
        <Input
          label={t('giftCards.lookupField')}
          autoCapitalize="characters"
          autoCorrect={false}
          value={draft}
          onChangeText={(v) => setDraft(v.toUpperCase().replace(/\s/g, ''))}
          onSubmitEditing={() => setCode(draft.trim() || null)}
          returnKeyType="search"
          icon="pricetag-outline"
          className="font-mono"
        />
        <Button
          label={t('giftCards.lookupCta')}
          icon="search-outline"
          disabled={draft.trim().length < 4}
          loading={q.isFetching}
          onPress={() => setCode(draft.trim() || null)}
        />

        {code && q.isError ? (
          <Notice tone="destructive" icon="alert-circle-outline" body={normalizeError(q.error).message} />
        ) : null}

        {q.data ? (
          <Card className="gap-1 p-3.5" flat>
            <View className="flex-row items-center justify-between">
              <T className="font-lao-medium text-muted-foreground">{t('giftCards.balance')}</T>
              <Pill label={t(STATE_KEY[cardState(q.data)])} tone={STATE_TONE[cardState(q.data)]} />
            </View>
            <T className="font-sans-semibold text-foreground" style={{ fontSize: 22, lineHeight: 28 }}>
              {formatLAK(q.data.currentBalance)}
            </T>
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {q.data.branchName} · {t('giftCards.expires', { date: formatDate(q.data.expireDate) })}
            </T>
          </Card>
        ) : null}
      </View>
    </Sheet>
  );
}

// ---- purchase sheet --------------------------------------------------------

function IssueSheet({
  open,
  onClose,
  onPurchased,
}: {
  open: boolean;
  onClose: () => void;
  onPurchased: (card: GiftCardView) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const purchase = usePurchaseGiftCard();
  const [err, setErr] = useState<string | null>(null);

  const form = useForm<PurchaseGiftCardInput>({
    resolver: zodResolver(purchaseGiftCardSchema),
    defaultValues: {
      branchId: DEFAULT_BRANCH_ID,
      amount: 200_000,
      recipientEmail: '',
      recipientName: '',
      message: '',
    },
  });

  const amount = form.watch('amount') ?? 0;
  const recipientName = form.watch('recipientName') ?? '';
  const message = form.watch('message') ?? '';
  const amountValid = amount >= GIFT_CARD_MIN_AMOUNT && amount <= GIFT_CARD_MAX_AMOUNT;

  function submit(values: PurchaseGiftCardInput): void {
    setErr(null);
    purchase.mutate(values, {
      onSuccess: (card) => {
        haptics.success();
        form.reset();
        onClose();
        onPurchased(card);
      },
      onError: (e) => {
        haptics.error();
        setErr(normalizeError(e).message);
      },
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('giftCards.issueTitle')} description={t('giftCards.issueSubtitle')}>
      <View className="gap-3.5">
        {/* ຕົວຢ່າງບັດແບບສົດ — ເຫັນສິ່ງທີ່ຜູ້ຮັບຈະໄດ້ຮັບກ່ອນຈ່າຍ */}
        <View className="overflow-hidden rounded-2xl" style={shadow.xs}>
          <Gradient preset="hero" fill pointerEvents="none" />
          <View className="p-3.5">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="gift" size={12} color={colors.champagne} />
              <T className="font-lao-medium text-white/75">{t('giftCards.cardLabel')}</T>
            </View>
            <T className="mt-1 font-sans-semibold text-white" style={{ fontSize: 22, lineHeight: 28 }}>
              {formatLAK(amount)}
            </T>
            <T numberOfLines={1} className="font-lao text-white/60" style={SMALL}>
              {recipientName ? t('giftCards.previewTo', { name: recipientName }) : t('giftCards.previewNoName')}
            </T>
          </View>
        </View>

        {/* ຈຳນວນເງິນ — ຊິບສຳເລັດຮູບ + ຊ່ອງພິມເອງ */}
        <View className="gap-2">
          <Text variant="label" style={{ fontSize: 12, lineHeight: 17 }} className="font-lao-medium">
            {t('giftCards.amount')}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {PRESET_AMOUNTS.map((v) => (
              <Chip
                key={v}
                size="sm"
                label={formatLAK(v)}
                selected={amount === v}
                onPress={() => form.setValue('amount', v, { shouldValidate: true })}
              />
            ))}
          </View>
          <Input
            dense
            keyboardType="number-pad"
            value={amount ? amount.toLocaleString('en-US') : ''}
            onChangeText={(v) =>
              form.setValue('amount', Number(v.replace(/[^0-9]/g, '')) || 0, { shouldValidate: true })
            }
            leftSlot={
              <T className="font-sans-medium text-muted-foreground">₭</T>
            }
            error={form.formState.errors.amount?.message}
            hint={t('giftCards.amountHint', {
              min: formatLAK(GIFT_CARD_MIN_AMOUNT),
              max: formatLAK(GIFT_CARD_MAX_AMOUNT),
            })}
          />
        </View>

        <Input
          dense
          label={t('giftCards.recipientEmail')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          icon="mail-outline"
          onChangeText={(v) => form.setValue('recipientEmail', v.trim(), { shouldValidate: true })}
          error={form.formState.errors.recipientEmail?.message}
          hint={t('giftCards.recipientEmailHint')}
        />
        <Input
          dense
          label={t('giftCards.recipientName')}
          icon="person-outline"
          onChangeText={(v) => form.setValue('recipientName', v)}
        />
        <Input
          dense
          label={t('giftCards.message')}
          multiline
          maxLength={MESSAGE_MAX}
          onChangeText={(v) => form.setValue('message', v)}
          hint={t('giftCards.messageCount', { count: message.length, max: MESSAGE_MAX })}
        />

        <Notice tone="muted" icon="shield-checkmark-outline" body={t('giftCards.purchaseNote')} />

        {err ? <Notice tone="destructive" icon="alert-circle-outline" body={err} /> : null}

        <Button
          label={t('giftCards.continueToPay')}
          icon="arrow-forward"
          disabled={!amountValid}
          loading={purchase.isPending}
          onPress={form.handleSubmit(submit)}
        />
      </View>
    </Sheet>
  );
}
