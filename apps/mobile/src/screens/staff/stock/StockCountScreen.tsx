import type { StockCountLineView } from '@abcp/shared-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Modal, RefreshControl, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FooterBar } from '../../../components/shared/FooterBar';
import { ErrorView, LoadingScreen } from '../../../components/shared/StateViews';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Sheet } from '../../../components/ui/Sheet';
import {
  isForbidden,
  isNotFound,
  useCountAction,
  useInventoryAccess,
  useProductLookup,
  useSaveCountLines,
  useStockCount,
} from '../../../features/inventory/inventory.api';
import {
  countedProgress,
  dirtyCountLines,
  formatQty,
  parseQty,
  type CountDrafts,
} from '../../../features/inventory/inventory.logic';
import { cn } from '../../../lib/cn';
import { formatLAK } from '../../../lib/format';
import { haptics } from '../../../lib/haptics';
import { normalizeError } from '../../../services/apiError';
import { colors, shadow } from '../../../theme';
import type { StaffAppScreenProps } from '../../../navigation/types';
import { EmptyBlock, FilterChipRow, HeaderIconButton, MiniBar, SMALL, T } from '../staff-portal.parts';
import { COUNT_STATUS_TONE } from './StockCountsScreen';
import { LockedBlock, Notice, QtyInput, SmallField, StockHeader, useScrolled } from './stock.parts';
import { StockScanner } from './StockScanner';

type Filter = 'all' | 'todo' | 'done';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** ຮ່າງຜົນນັບເກັບໃນເຄື່ອງ — ເນັດຫຼຸດ/ປິດແອັບ ກໍບໍ່ເສຍຕົວເລກທີ່ນັບແລ້ວ (ສົ່ງຄືນເມື່ອເປີດໃບນີ້ອີກ). */
const draftKey = (id: string): string => `aura.stockCount.drafts.${id}`;
const AUTOSAVE_MS = 1200;

function LineRow({
  line,
  draft,
  editable,
  showExpected,
  highlighted,
  onChange,
  onBlur,
  inputRef,
}: {
  line: StockCountLineView;
  draft: string | undefined;
  editable: boolean;
  showExpected: boolean;
  highlighted: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
  inputRef: (el: TextInput | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = draft ?? (line.countedQty != null ? String(line.countedQty) : '');
  const parsed = parseQty(value);
  const invalid = parsed !== null && Number.isNaN(parsed);
  const pendingSave = draft !== undefined && parsed !== line.countedQty && !invalid;
  const counted = parsed != null && !invalid;
  const variance =
    showExpected && counted && line.expectedQty != null ? (parsed as number) - line.expectedQty : null;
  return (
    <View
      className={cn(
        'gap-2 rounded-2xl border bg-card p-3',
        highlighted ? 'border-primary' : 'border-border',
      )}
      style={shadow.xs}
    >
      <View className="flex-row items-start gap-2">
        <View
          className={cn(
            'mt-0.5 h-5 w-5 items-center justify-center rounded-full',
            counted ? 'bg-success' : 'border border-border bg-muted',
          )}
        >
          {counted ? <Ionicons name="checkmark" size={12} color={colors.successForeground} /> : null}
        </View>
        <View className="min-w-0 flex-1">
          <T numberOfLines={2} className="font-lao-semibold text-foreground">
            {line.productName}
          </T>
          <T numberOfLines={1} className="font-sans text-muted-foreground" style={SMALL}>
            {line.sku}
            {line.lotNumber ? ` · ${t('stock.count.lot')} ${line.lotNumber}` : ''}
            {line.expiryDate ? ` · ${line.expiryDate}` : ''}
          </T>
        </View>
        {pendingSave ? <Badge label={t('stock.count.unsavedBadge')} tone="warning" /> : null}
      </View>
      {editable ? (
        <QtyInput
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          unit={line.unit}
          invalid={invalid}
          accessibilityLabel={t('stock.count.qtyLabel', { name: line.productName })}
          inputRef={inputRef}
        />
      ) : (
        <T className="font-sans-semibold text-foreground">
          {line.countedQty != null ? `${formatQty(line.countedQty)} ${line.unit}` : t('stock.count.notCounted')}
        </T>
      )}
      {showExpected && line.expectedQty != null ? (
        <View className="flex-row items-center justify-between">
          <T className="font-lao text-muted-foreground" style={SMALL}>
            {t('stock.count.expected', { qty: `${formatQty(line.expectedQty)} ${line.unit}` })}
            {line.movedSinceStart !== 0
              ? ` · ${t('stock.count.movedSince', { qty: formatQty(line.movedSinceStart) })}`
              : ''}
          </T>
          {variance != null && variance !== 0 ? (
            <T
              className={cn('font-sans-semibold', variance > 0 ? 'text-success' : 'text-destructive')}
              style={SMALL}
            >
              {variance > 0 ? '+' : ''}
              {formatQty(variance)}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * M14 — ໃບນັບສະຕັອກ. ພິມຈຳນວນ (ໜ່ວຍພື້ນຖານ) ຕໍ່ແຖວ; ບັນທຶກອັດຕະໂນມັດ (debounce 1.2 ວິ + ຕອນອອກຈາກຊ່ອງ)
 * ດ້ວຍ PATCH /stock-counts/:id/lines ສະເພາະແຖວທີ່ປ່ຽນ. ຮ່າງເກັບໃນ AsyncStorage ຈົນກວ່າ server ຮັບ;
 * ລົ້ມເຫຼວ → ສະຖານະ "ຍັງບໍ່ບັນທຶກ" + ປຸ່ມລອງໃໝ່. ສະແກນເພື່ອໂດດໄປແຖວຂອງສິນຄ້ານັ້ນ.
 * ພະນັກງານນັບແບບ "ບໍ່ເຫັນຍອດລະບົບ" (blind count); ຍອດຄາດ/ສ່ວນຕ່າງສະແດງສະເພາະ admin.
 */
export function StockCountScreen({ navigation, route }: StaffAppScreenProps<'StockCount'>): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = route.params;
  const access = useInventoryAccess();
  const { scrolled, onScroll } = useScrolled();
  const query = useStockCount(id);
  const save = useSaveCountLines(id);
  const action = useCountAction(id);
  const lookup = useProductLookup();

  const [drafts, setDrafts] = useState<CountDrafts>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [filter, setFilter] = useState<Filter>('all');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const listRef = useRef<FlatList<StockCountLineView>>(null);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const restored = useRef(false);

  const count = query.data;
  const lines = useMemo(() => count?.lines ?? [], [count]);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const editable = count?.status === 'COUNTING';

  // ---- ຮ່າງໃນເຄື່ອງ: ໂຫຼດຄືນຄັ້ງດຽວ, ບັນທຶກທຸກຄັ້ງທີ່ປ່ຽນ ----
  useEffect(() => {
    void AsyncStorage.getItem(draftKey(id))
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as CountDrafts;
          setDrafts((cur) => ({ ...saved, ...cur }));
        }
      })
      .catch(() => {})
      .finally(() => {
        restored.current = true;
      });
  }, [id]);

  useEffect(() => {
    if (!restored.current) return;
    const key = draftKey(id);
    const op = Object.keys(drafts).length
      ? AsyncStorage.setItem(key, JSON.stringify(drafts))
      : AsyncStorage.removeItem(key);
    void op.catch(() => {});
  }, [drafts, id]);

  // ---- ບັນທຶກ ----
  const inFlight = useRef(false);
  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    const dirty = dirtyCountLines(linesRef.current, draftsRef.current);
    if (dirty.length === 0) return true;
    inFlight.current = true;
    setSaveState('saving');
    try {
      await save.mutateAsync({ lines: dirty });
      // ລຶບຮ່າງທີ່ server ຮັບແລ້ວ (ຍົກເວັ້ນແຖວທີ່ພິມຕໍ່ລະຫວ່າງສົ່ງ)
      setDrafts((cur) => {
        const next = { ...cur };
        for (const d of dirty) {
          const text = next[d.lineId];
          if (text !== undefined && parseQty(text) === d.countedQty) delete next[d.lineId];
        }
        return next;
      });
      setSaveState('saved');
      return true;
    } catch {
      setSaveState('error');
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [save]);

  // autosave (debounce)
  useEffect(() => {
    if (!editable) return undefined;
    if (dirtyCountLines(lines, drafts).length === 0) return undefined;
    const timer = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [drafts, lines, editable, flush]);

  // ອອກຈາກໜ້າ → ສົ່ງສິ່ງທີ່ຄ້າງ (mutation ດຳເນີນຕໍ່ຫຼັງ unmount; ລົ້ມ = ຮ່າງຍັງຢູ່ໃນເຄື່ອງ)
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  const unsavedCount = dirtyCountLines(lines, drafts).length;
  const progress = countedProgress(lines, drafts);

  const visible = useMemo(() => {
    if (filter === 'all') return lines;
    return lines.filter((l) => {
      const d = drafts[l.id];
      const v = d === undefined ? l.countedQty : parseQty(d);
      const done = v != null && !Number.isNaN(v);
      return filter === 'done' ? done : !done;
    });
  }, [lines, drafts, filter]);

  // ---- ສະແກນ → ໂດດໄປແຖວ ----
  const jumpTo = (lineId: string): void => {
    setFilter('all');
    setHighlight(lineId);
    const idx = linesRef.current.findIndex((l) => l.id === lineId);
    setTimeout(() => {
      if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.2, animated: true });
      setTimeout(() => inputs.current[lineId]?.focus(), 350);
    }, 50);
  };

  const onScanCode = (code: string): void => {
    lookup.mutate(code, {
      onSuccess: (res) => {
        const line = linesRef.current.find((l) => l.productId === res.product.id);
        if (!line) {
          haptics.error();
          setScanError(t('stock.count.notInCount', { name: res.product.name }));
          return;
        }
        haptics.success();
        setScanOpen(false);
        jumpTo(line.id);
      },
      onError: (err) => {
        haptics.error();
        setScanError(isNotFound(err) ? t('stock.scan.notFound', { code }) : normalizeError(err).message);
      },
    });
  };

  // ---- ຄຳສັ່ງ ----
  const runAction = (
    kind: 'start' | 'submit' | 'approve' | 'reject',
    reason?: string,
    doneMsg?: string,
  ): void => {
    action.mutate(
      { action: kind, reason },
      {
        onSuccess: () => {
          haptics.success();
          setRejectOpen(false);
          if (doneMsg) Alert.alert('', doneMsg);
        },
        onError: (err) => {
          haptics.error();
          Alert.alert('', isForbidden(err) ? t('stock.locked.hint') : normalizeError(err).message);
        },
      },
    );
  };

  const onSubmit = async (): Promise<void> => {
    const ok = await flush();
    if (!ok && dirtyCountLines(linesRef.current, draftsRef.current).length > 0) {
      Alert.alert('', t('stock.count.saveFirst'));
      return;
    }
    const remaining = progress.total - progress.counted;
    Alert.alert(
      t('stock.count.submitTitle'),
      remaining > 0 ? t('stock.count.submitUncounted', { count: remaining }) : t('stock.count.submitBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('stock.count.submit'), onPress: () => runAction('submit', undefined, t('stock.count.submitted')) },
      ],
    );
  };

  if (query.isPending) return <LoadingScreen />;
  if (query.isError || !count) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <StockHeader title={t('stock.count.title')} onBack={() => navigation.goBack()} scrolled={false} />
        {isForbidden(query.error) ? (
          <View className="p-4">
            <LockedBlock hint={t('stock.counts.lockedHint')} />
          </View>
        ) : (
          <ErrorView message={normalizeError(query.error).message} onRetry={() => void query.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const saveLine =
    saveState === 'saving'
      ? t('stock.count.saving')
      : unsavedCount > 0
        ? t('stock.count.unsaved', { count: unsavedCount })
        : saveState === 'saved'
          ? t('stock.count.saved')
          : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StockHeader
        title={count.countNumber}
        subtitle={`${t(`stock.countType.${count.type}`)} · ${count.branchName}`}
        onBack={() => navigation.goBack()}
        scrolled={scrolled}
        right={
          <>
            <Badge dot label={t(`stock.countStatus.${count.status}`)} tone={COUNT_STATUS_TONE[count.status]} />
            {editable ? (
              <HeaderIconButton
                icon="barcode-outline"
                tone="solid"
                label={t('stock.count.scanToFind')}
                onPress={() => {
                  setScanError(null);
                  setScanOpen(true);
                }}
              />
            ) : null}
          </>
        }
      >
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <MiniBar value={progress.counted} max={Math.max(1, progress.total)} gradient />
            </View>
            <T className="font-sans-medium text-foreground" style={SMALL}>
              {t('stock.count.progress', { counted: progress.counted, total: progress.total })}
            </T>
          </View>
          {editable && saveLine ? (
            <View className="flex-row items-center gap-1.5">
              <Ionicons
                name={
                  saveState === 'error'
                    ? 'cloud-offline-outline'
                    : unsavedCount > 0 || saveState === 'saving'
                      ? 'cloud-upload-outline'
                      : 'cloud-done-outline'
                }
                size={12}
                color={saveState === 'error' ? colors.destructive : colors.mutedForeground}
              />
              <T
                className={cn('flex-1 font-lao', saveState === 'error' ? 'text-destructive' : 'text-muted-foreground')}
                style={SMALL}
              >
                {saveState === 'error' ? t('stock.count.saveFailed', { count: unsavedCount }) : saveLine}
              </T>
              {saveState === 'error' ? (
                <Button
                  label={t('common.retry')}
                  size="xs"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => void flush()}
                />
              ) : null}
            </View>
          ) : null}
          <FilterChipRow
            value={filter}
            onChange={setFilter}
            items={[
              { key: 'all', label: t('stock.count.filterAll'), count: progress.total },
              { key: 'todo', label: t('stock.count.filterTodo'), count: progress.total - progress.counted },
              { key: 'done', label: t('stock.count.filterDone'), count: progress.counted },
            ]}
          />
        </View>
      </StockHeader>

      <FlatList
        ref={listRef}
        data={visible}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View className="gap-2">
            {count.status === 'DRAFT' ? (
              <Notice tone="info">{t('stock.count.draftNotice')}</Notice>
            ) : null}
            {count.status === 'PENDING_APPROVAL' ? (
              <Notice tone="warning" icon="hourglass-outline">
                {access.canManage
                  ? t('stock.count.pendingAdmin', {
                      net: formatLAK(count.netVarianceValue),
                      abs: formatLAK(count.absVarianceValue),
                    })
                  : t('stock.count.pendingStaff')}
              </Notice>
            ) : null}
            {count.status === 'POSTED' ? <Notice tone="success">{t('stock.count.postedNotice')}</Notice> : null}
            {count.rejectReason && count.status === 'COUNTING' ? (
              <Notice tone="destructive" icon="close-circle-outline">
                {t('stock.count.rejectedNotice', { reason: count.rejectReason })}
              </Notice>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyBlock icon="checkmark-done-outline" title={t('stock.count.emptyFilter')} />}
        renderItem={({ item }) => (
          <LineRow
            line={item}
            draft={drafts[item.id]}
            editable={editable}
            showExpected={access.canManage}
            highlighted={highlight === item.id}
            onChange={(text) => {
              setHighlight(null);
              setDrafts((cur) => ({ ...cur, [item.id]: text }));
            }}
            onBlur={() => void flush()}
            inputRef={(el) => {
              inputs.current[item.id] = el;
            }}
          />
        )}
      />

      {count.status === 'COUNTING' ||
      (count.status === 'DRAFT' && access.canManage) ||
      (count.status === 'PENDING_APPROVAL' && access.canManage) ? (
        <FooterBar>
          {count.status === 'COUNTING' ? (
            <Button
              label={t('stock.count.submit')}
              icon="paper-plane-outline"
              size="sm"
              labelClassName="text-[12px]"
              loading={action.isPending}
              onPress={() => void onSubmit()}
            />
          ) : count.status === 'DRAFT' ? (
            <Button
              label={t('stock.count.start')}
              icon="play-outline"
              size="sm"
              labelClassName="text-[12px]"
              loading={action.isPending}
              onPress={() => runAction('start')}
            />
          ) : (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label={t('stock.count.reject')}
                  variant="outline"
                  size="sm"
                  labelClassName="text-[12px]"
                  disabled={action.isPending}
                  onPress={() => setRejectOpen(true)}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={t('stock.count.approve')}
                  icon="checkmark-done-outline"
                  size="sm"
                  labelClassName="text-[12px]"
                  loading={action.isPending}
                  onPress={() =>
                    Alert.alert(t('stock.count.approveTitle'), t('stock.count.approveBody'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('stock.count.approve'),
                        onPress: () => runAction('approve', undefined, t('stock.count.approved')),
                      },
                    ])
                  }
                />
              </View>
            </View>
          )}
        </FooterBar>
      ) : null}

      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <StockScanner
          title={t('stock.count.scanToFind')}
          hint={t('stock.count.scanHint')}
          onCode={onScanCode}
          onClose={() => setScanOpen(false)}
          busy={lookup.isPending}
          error={scanError}
          onRetry={() => setScanError(null)}
        />
      </Modal>

      <Sheet open={rejectOpen} onClose={() => setRejectOpen(false)} title={t('stock.count.rejectTitle')}>
        <View className="gap-3">
          <SmallField
            label={t('stock.count.rejectReason')}
            value={rejectReason}
            onChangeText={setRejectReason}
            multiline
          />
          <Button
            label={t('stock.count.reject')}
            variant="destructive"
            size="sm"
            labelClassName="text-[12px]"
            disabled={!rejectReason.trim()}
            loading={action.isPending}
            onPress={() => runAction('reject', rejectReason.trim())}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
