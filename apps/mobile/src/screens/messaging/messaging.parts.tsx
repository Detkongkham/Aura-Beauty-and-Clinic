import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Switch, TextInput, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { apiUpdateProfile } from '../../features/auth/auth.api';
import { useAuth } from '../../features/auth/useAuth';
import { useBlockedUsers, useReportConversation, useUnblockUser } from '../../features/messaging/messaging.api';
import { cn } from '../../lib/cn';
import { vientiane } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';

/** ຂໍ້ຄວາມ 12px ຄົງທີ່ (flat type scale) — ໃຊ້ຮ່ວມກັນ inbox + thread. */
export function T({ style, ...rest }: React.ComponentProps<typeof Text>): React.JSX.Element {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
export const SMALL = { fontSize: 10, lineHeight: 14 } as const;

type IconName = keyof typeof Ionicons.glyphMap;

/** ປຸ່ມໄອຄອນວົງມົນ 36pt (hitSlop ໃຫ້ຄົບ 44pt). */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'soft';
  /** ຈຸດສະຖານະນ້ອຍມຸມຂວາເທິງ. */
  badge?: string;
}): React.JSX.Element {
  return (
    <Touchable
      onPress={onPress}
      hitSlop={6}
      pressScale={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn('h-9 w-9 items-center justify-center rounded-full', tone === 'soft' && 'bg-primary-subtle')}
    >
      <Ionicons name={icon} size={18} color={tone === 'soft' ? colors.primaryStrong : colors.foreground} />
      {badge ? (
        <View
          className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: badge, borderWidth: 1.5, borderColor: colors.background }}
        />
      ) : null}
    </Touchable>
  );
}

/** ແຖວ action ໃນ sheet — ໄອຄອນໃນກ່ອງສີ + label + hint. */
export function SheetAction({
  icon,
  label,
  hint,
  onPress,
  destructive,
  disabled,
  loading,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}): React.JSX.Element {
  const tint = destructive ? colors.destructive : colors.primary;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || loading}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn('min-h-[48px] flex-row items-center gap-3 px-3 py-2.5', disabled && 'opacity-40')}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-xl"
        style={{ backgroundColor: destructive ? colors.destructiveSoft : colors.primarySubtle }}
      >
        {loading ? <ActivityIndicator size="small" color={tint} /> : <Ionicons name={icon} size={16} color={tint} />}
      </View>
      <View className="flex-1">
        <T className={cn('font-lao-medium', destructive ? 'text-destructive' : 'text-foreground')}>{label}</T>
        {hint ? (
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {hint}
          </T>
        ) : null}
      </View>
      {!destructive ? <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} /> : null}
    </Touchable>
  );
}

/** ກ້ອງ grouped (iOS inset list) — ເສັ້ນຄັ່ນ hairline ລະຫວ່າງລູກ. */
export function GroupCard({ children, className }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)} style={shadow.xs}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View className="ml-14 h-px bg-border" /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

/** ສະວິດ "ໃຫ້ລູກຄ້າອື່ນສົ່ງຂໍ້ຄວາມຫາຂ້ອຍ" — optimistic, ຕົວດຽວກັນກັບ ProfileScreen. */
export function useDirectMessagesPreference(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  pending: boolean;
} {
  const { user, updateUser } = useAuth();
  const enabled = user?.allowDirectMessages ?? false;
  const mutation = useMutation({
    mutationFn: (next: boolean) => apiUpdateProfile({ allowDirectMessages: next }),
    onMutate: (next) => {
      updateUser({ allowDirectMessages: next });
      return { prev: enabled };
    },
    onSuccess: (u) => {
      updateUser({ allowDirectMessages: u.allowDirectMessages });
      haptics.success();
    },
    onError: (err, _next, ctx) => {
      if (ctx) updateUser({ allowDirectMessages: ctx.prev });
      Alert.alert('', normalizeError(err).message);
    },
  });
  return { enabled, setEnabled: (next) => mutation.mutate(next), pending: mutation.isPending };
}

function Tip({ icon, text }: { icon: IconName; text: string }): React.JSX.Element {
  return (
    <View className="flex-row items-start gap-2.5">
      <View className="mt-px h-6 w-6 items-center justify-center rounded-lg bg-muted">
        <Ionicons name={icon} size={13} color={colors.mutedForeground} />
      </View>
      <T className="flex-1 font-lao text-muted-foreground">{text}</T>
    </View>
  );
}

/** ຄຳແນະນຳຄວາມປອດໄພ — ໃຊ້ໃນ privacy sheet ແລະ ໜ້າຫ້ອງແຊັດທີ່ຍັງວ່າງ. */
export function SafetyTips({ className }: { className?: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className={cn('gap-2.5 rounded-2xl border border-border bg-card p-3.5', className)}>
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="shield-checkmark" size={14} color={colors.success} />
        <T className="font-lao-semibold text-foreground">{t('messaging.privacy.tipsTitle')}</T>
      </View>
      <Tip icon="key-outline" text={t('messaging.privacy.tipSecrets')} />
      <Tip icon="flag-outline" text={t('messaging.privacy.tipReport')} />
      <Tip icon="hand-left-outline" text={t('messaging.privacy.tipBlock')} />
    </View>
  );
}

/** ຖາມຢືນຢັນກ່ອນຍົກເລີກບລັອກ — ໃຊ້ຮ່ວມກັນ privacy sheet, inbox action sheet ແລະ ໜ້າແຊັດ. */
export function useConfirmUnblock(): {
  confirm: (user: { id: string; name: string }) => void;
  pendingId: string | null;
} {
  const { t } = useTranslation();
  const unblock = useUnblockUser();
  const confirm = (user: { id: string; name: string }): void => {
    Alert.alert(
      t('messaging.blocked.unblockConfirmTitle', { name: user.name }),
      t('messaging.blocked.unblockConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('messaging.blocked.unblock'),
          onPress: () =>
            unblock.mutate(user.id, {
              onSuccess: () => haptics.success(),
              onError: (err) => {
                haptics.error();
                Alert.alert('', normalizeError(err).message);
              },
            }),
        },
      ],
    );
  };
  return { confirm, pendingId: unblock.isPending ? (unblock.variables ?? null) : null };
}

function UnblockButton({
  label,
  loading,
  onPress,
  tone = 'muted',
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
  tone?: 'muted' | 'card';
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      disabled={loading}
      hitSlop={6}
      pressScale={0.95}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn('h-8 min-w-[80px] items-center justify-center rounded-full px-3', tone === 'muted' ? 'bg-muted' : 'bg-card')}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <T className="font-lao-semibold text-foreground">{t('messaging.blocked.unblock')}</T>
      )}
    </Touchable>
  );
}

/** ລາຍຊື່ຄົນທີ່ບລັອກໄວ້ + ປຸ່ມຍົກເລີກ (ໃນ PrivacySheet). */
function BlockedUsersSection(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const blocked = useBlockedUsers();
  const { confirm, pendingId } = useConfirmUnblock();
  const list = blocked.data ?? [];
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between px-1">
        <T className="font-lao-semibold text-muted-foreground">{t('messaging.blocked.title')}</T>
        {list.length > 0 ? (
          <T className="font-sans text-muted-foreground" style={SMALL}>
            {list.length}
          </T>
        ) : null}
      </View>
      {blocked.isLoading ? (
        <View className="items-center rounded-2xl border border-border bg-card py-4">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : blocked.isError ? (
        <Touchable
          onPress={() => void blocked.refetch()}
          accessibilityRole="button"
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-2xl border border-border bg-card"
        >
          <Ionicons name="refresh" size={13} color={colors.mutedForeground} />
          <T className="font-lao text-muted-foreground">{t('common.loadError')}</T>
        </Touchable>
      ) : list.length === 0 ? (
        <View className="flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3.5">
          <Ionicons name="happy-outline" size={14} color={colors.mutedForeground} />
          <T className="font-lao text-muted-foreground">{t('messaging.blocked.empty')}</T>
        </View>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {list.map((b, i) => (
            <View key={b.userId}>
              {i > 0 ? <View className="ml-[58px] h-px bg-border" /> : null}
              <View className="min-h-[52px] flex-row items-center gap-3 px-3.5 py-2">
                <Avatar uri={b.avatarUrl} name={b.name} size={32} mode="cartoon" />
                <View className="flex-1">
                  <T className="font-lao-medium text-foreground" numberOfLines={1}>
                    {b.name}
                  </T>
                  <T className="font-lao text-muted-foreground" style={SMALL}>
                    {t('messaging.blocked.since', {
                      date: vientiane(b.blockedAt).format(i18n.language === 'lo' ? 'DD/MM/YYYY' : 'D MMM YYYY'),
                    })}
                  </T>
                </View>
                <UnblockButton
                  label={`${t('messaging.blocked.unblock')} ${b.name}`}
                  loading={pendingId === b.userId}
                  onPress={() => confirm({ id: b.userId, name: b.name })}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** ແທນ composer ເມື່ອຂ້ອຍບລັອກອີກຝ່າຍໄວ້ — ຍົກເລີກໄດ້ຈາກບ່ອນນີ້ເລີຍ. */
export function BlockedNotice({ user }: { user: { id: string; name: string } }): React.JSX.Element {
  const { t } = useTranslation();
  const { confirm, pendingId } = useConfirmUnblock();
  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl px-3.5 py-2.5"
      style={{ backgroundColor: colors.destructiveSoft }}
    >
      <Ionicons name="hand-left" size={16} color={colors.destructive} />
      <View className="flex-1">
        <T className="font-lao-semibold text-foreground" numberOfLines={1}>
          {t('messaging.blocked.noticeTitle', { name: user.name })}
        </T>
        <T className="font-lao text-muted-foreground" style={SMALL}>
          {t('messaging.blocked.noticeBody')}
        </T>
      </View>
      <UnblockButton
        label={`${t('messaging.blocked.unblock')} ${user.name}`}
        loading={pendingId === user.id}
        onPress={() => confirm(user)}
        tone="card"
      />
    </View>
  );
}

export function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const pref = useDirectMessagesPreference();
  return (
    <Sheet open={open} onClose={onClose} title={t('messaging.privacy.title')}>
      <View className="gap-3">
        <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary-subtle">
            <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
          </View>
          <View className="flex-1">
            <T className="font-lao-medium text-foreground">{t('messaging.privacy.toggle')}</T>
            <T className="font-lao text-muted-foreground" style={SMALL}>
              {t('messaging.privacy.toggleDesc')}
            </T>
          </View>
          <Switch
            value={pref.enabled}
            onValueChange={pref.setEnabled}
            disabled={pref.pending}
            trackColor={{ true: colors.primary, false: colors.input }}
            accessibilityLabel={t('messaging.privacy.toggle')}
          />
        </View>
        <BlockedUsersSection />
        <SafetyTips />
      </View>
    </Sheet>
  );
}

const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'scam', 'other'] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * ລາຍງານຫ້ອງ ຫຼື ຂໍ້ຄວາມດຽວ (`messageId`) — ເລືອກເຫດຜົນ + ໝາຍເຫດ. ແທນ `Alert.prompt` ເກົ່າ
 * (iOS-only; Android ສົ່ງເຫດຜົນຕາຍຕົວໂດຍບໍ່ຖາມ).
 */
export function ReportSheet({
  threadId,
  messageId,
  open,
  onClose,
}: {
  threadId: string;
  messageId?: string;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const report = useReportConversation(threadId);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setDone(false);
    }
  }, [open]);

  const submit = (): void => {
    if (!reason) return;
    const label = t(`messaging.report.reasons.${reason}`);
    const body = note.trim() ? `${label} — ${note.trim()}` : label;
    report.mutate(
      { reason: body.slice(0, 500), messageId },
      {
        onSuccess: () => {
          haptics.success();
          setDone(true);
        },
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? undefined : t(messageId ? 'messaging.report.titleMessage' : 'messaging.report.title')}
      description={done ? undefined : t('messaging.report.description')}
    >
      {done ? (
        <View className="items-center gap-2 py-4">
          <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.successSoft }}>
            <Ionicons name="checkmark" size={24} color={colors.success} />
          </View>
          <T className="font-lao-semibold text-foreground">{t('messaging.report.successTitle')}</T>
          <T className="text-center font-lao text-muted-foreground">{t('messaging.report.successBody')}</T>
          <Touchable
            onPress={onClose}
            pressScale={0.97}
            accessibilityRole="button"
            className="mt-2 h-11 w-full items-center justify-center rounded-full bg-muted"
          >
            <T className="font-lao-semibold text-foreground">{t('common.close')}</T>
          </Touchable>
        </View>
      ) : (
        <View className="gap-3">
          <View className="gap-1.5" accessibilityRole="radiogroup">
            {REPORT_REASONS.map((r) => {
              const selected = reason === r;
              return (
                <Touchable
                  key={r}
                  onPress={() => {
                    haptics.select();
                    setReason(r);
                  }}
                  pressScale={0.98}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  className={cn(
                    'min-h-[44px] flex-row items-center gap-3 rounded-2xl border px-3.5',
                    selected ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
                  )}
                >
                  <T className={cn('flex-1 font-lao', selected ? 'text-primary-strong' : 'text-foreground')}>
                    {t(`messaging.report.reasons.${r}`)}
                  </T>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selected ? colors.primary : colors.input}
                  />
                </Touchable>
              );
            })}
          </View>

          <View className="rounded-2xl border border-border bg-card px-3.5">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('messaging.report.notePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              multiline
              maxLength={300}
              className="font-lao text-foreground"
              style={{ fontSize: 12, lineHeight: 17, minHeight: 64, maxHeight: 110, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' }}
            />
          </View>

          <Touchable
            onPress={submit}
            disabled={!reason || report.isPending}
            pressScale={0.97}
            accessibilityRole="button"
            accessibilityState={{ disabled: !reason || report.isPending }}
            className={cn(
              'h-11 flex-row items-center justify-center gap-2 rounded-full',
              reason ? 'bg-destructive' : 'bg-muted',
            )}
          >
            {report.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
            <T className={cn('font-lao-semibold', reason ? 'text-white' : 'text-muted-foreground')}>
              {t('messaging.report.submit')}
            </T>
          </Touchable>
        </View>
      )}
    </Sheet>
  );
}
