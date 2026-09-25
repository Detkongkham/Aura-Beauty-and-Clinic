import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, KeyboardAvoidingView, Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../components/ui/Button';
import { GlassView } from '../../../components/ui/GlassView';
import { Touchable } from '../../../components/ui/Touchable';
import { normalizeScannedCode, STOCK_BARCODE_TYPES } from '../../../features/inventory/inventory.logic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { cn } from '../../../lib/cn';
import { colors } from '../../../theme';
import { SMALL, T } from '../staff-portal.parts';

/**
 * M14 — ກ້ອງສະແກນ barcode ເຕັມຈໍ (ຮູບແບບດຽວກັບ CheckInScreen: ຂໍສິດກ້ອງ, ໜ້າກາກ + ມຸມກອບ,
 * ເສັ້ນສະແກນ, ໄຟສາຍ, lock ກັນຍິງຊ້ຳ). ເພີ່ມຊ່ອງພິມລະຫັດເອງ (fallback ເມື່ອບາໂຄດເສຍ/ບໍ່ມີສິດກ້ອງ).
 * ຜູ້ເອີ້ນຮັບ `onCode` ແລ້ວຕອບ `busy` / `error`; ການສະແກນຢຸດຈົນກວ່າຈະກົດ "ສະແກນອີກ".
 */

const FRAME_W = 264;
const FRAME_H = 176;

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }): React.JSX.Element {
  const top = pos[0] === 't';
  const left = pos[1] === 'l';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 30,
        height: 30,
        [top ? 'top' : 'bottom']: -2,
        [left ? 'left' : 'right']: -2,
        borderColor: '#FFFFFF',
        borderTopWidth: top ? 4 : 0,
        borderBottomWidth: top ? 0 : 4,
        borderLeftWidth: left ? 4 : 0,
        borderRightWidth: left ? 0 : 4,
        [`border${top ? 'Top' : 'Bottom'}${left ? 'Left' : 'Right'}Radius`]: 18,
      }}
    />
  );
}

function ScanLine({ active }: { active: boolean }): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !active) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, active, y]);
  if (reduced || !active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        height: 2,
        borderRadius: 1,
        backgroundColor: colors.aura300,
        shadowColor: colors.primary,
        shadowOpacity: 0.9,
        shadowRadius: 8,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [14, FRAME_H - 14] }) }],
      }}
    />
  );
}

export function StockScanner({
  title,
  hint,
  onCode,
  onClose,
  busy,
  error,
  onRetry,
}: {
  title: string;
  hint?: string;
  /** ລະຫັດທີ່ normalize ແລ້ວ (ຈາກກ້ອງ ຫຼື ພິມເອງ). */
  onCode: (code: string) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
  onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  /** ກັນ onBarcodeScanned ຍິງຊ້ຳຫຼາຍເທື່ອຕໍ່ວິນາທີ. */
  const lock = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  // ຜູ້ເອີ້ນລ້າງ error/busy → ປົດ lock ໃຫ້ສະແກນຕໍ່ໄດ້
  useEffect(() => {
    if (!busy && !error) lock.current = false;
  }, [busy, error]);

  const granted = !!permission?.granted;
  const scanning = granted && !manual && !busy && !error;

  const onScanned = ({ data }: BarcodeScanningResult): void => {
    if (lock.current) return;
    const code = normalizeScannedCode(data);
    if (!code) return;
    lock.current = true;
    onCode(code);
  };

  const submitTyped = (): void => {
    const code = normalizeScannedCode(typed);
    if (!code) return;
    lock.current = true;
    onCode(code);
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {granted && !manual ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...STOCK_BARCODE_TYPES] }}
          onBarcodeScanned={scanning ? onScanned : undefined}
        />
      ) : null}

      {granted && !manual ? (
        <>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={styles.mask} />
            <View style={{ flexDirection: 'row', height: FRAME_H }}>
              <View style={styles.mask} />
              <View style={{ width: FRAME_W }} />
              <View style={styles.mask} />
            </View>
            <View style={styles.mask} />
          </View>
          <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
            <View style={{ width: FRAME_W, height: FRAME_H }}>
              <Corner pos="tl" />
              <Corner pos="tr" />
              <Corner pos="bl" />
              <Corner pos="br" />
              <ScanLine active={scanning} />
            </View>
          </View>
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 items-center px-8"
            style={{ top: '50%', marginTop: FRAME_H / 2 + 18 }}
          >
            <T className="text-center font-lao-medium text-white">
              {busy ? t('stock.scan.looking') : (hint ?? t('stock.scan.instruction'))}
            </T>
          </View>
        </>
      ) : !manual && permission ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="camera-outline" size={26} color="#FFFFFF" />
          </View>
          <T className="text-center font-lao-semibold text-white">{t('stock.scan.permissionTitle')}</T>
          <T className="text-center font-lao text-white/70">{t('stock.scan.permissionBody')}</T>
          <Button
            label={permission.canAskAgain ? t('stock.scan.allowCamera') : t('stock.scan.openSettings')}
            size="sm"
            fullWidth={false}
            className="mt-1 px-6"
            labelClassName="text-[12px]"
            onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
          />
        </View>
      ) : null}

      {/* ແຖບເທິງ */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-4"
        style={{ top: insets.top + 6 }}
      >
        <Touchable
          onPress={onClose}
          hitSlop={8}
          pressScale={0.92}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </Touchable>
        <T className="font-lao-semibold text-white">{title}</T>
        {granted && !manual ? (
          <Touchable
            onPress={() => setTorch((v) => !v)}
            hitSlop={8}
            pressScale={0.92}
            accessibilityRole="button"
            accessibilityLabel={torch ? t('stock.scan.torchOff') : t('stock.scan.torchOn')}
            accessibilityState={{ selected: torch }}
            className={cn('h-10 w-10 items-center justify-center rounded-full', torch ? 'bg-champagne' : 'bg-white/15')}
          >
            <Ionicons
              name={torch ? 'flashlight' : 'flashlight-outline'}
              size={18}
              color={torch ? colors.aura900 : '#FFFFFF'}
            />
          </Touchable>
        ) : (
          <View className="h-10 w-10" />
        )}
      </View>

      {/* ແຜງລຸ່ມ: error / ພິມລະຫັດເອງ */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="absolute bottom-0 left-0 right-0"
      >
        <View className="px-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <GlassView intensity={50} tint="dark" radius={22}>
            <View className="gap-2.5 p-3.5">
              {error ? (
                <>
                  <View className="flex-row items-start gap-2">
                    <Ionicons name="alert-circle" size={16} color="#FB7185" style={{ marginTop: 1 }} />
                    <T className="flex-1 font-lao-medium text-white">{error}</T>
                  </View>
                  <Button
                    label={t('stock.scan.again')}
                    icon="scan-outline"
                    size="sm"
                    labelClassName="text-[12px]"
                    onPress={() => {
                      setTyped('');
                      onRetry();
                    }}
                  />
                </>
              ) : manual ? (
                <>
                  <T className="font-lao-medium text-white">{t('stock.scan.manualTitle')}</T>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={typed}
                      onChangeText={setTyped}
                      autoFocus
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="search"
                      onSubmitEditing={submitTyped}
                      placeholder={t('stock.scan.manualPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      selectionColor={colors.champagne}
                      accessibilityLabel={t('stock.scan.manualTitle')}
                      className="h-11 flex-1 rounded-xl bg-white/15 px-3 font-sans text-white"
                      style={{ fontSize: 14, lineHeight: 18 }}
                    />
                    <Button
                      label={t('common.search')}
                      size="sm"
                      fullWidth={false}
                      loading={busy}
                      disabled={!normalizeScannedCode(typed)}
                      labelClassName="text-[12px]"
                      onPress={submitTyped}
                    />
                  </View>
                  <Touchable
                    onPress={() => setManual(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('stock.scan.useCamera')}
                    className="flex-row items-center justify-center gap-1.5 py-1"
                  >
                    <Ionicons name="scan-outline" size={13} color="#FFFFFF" />
                    <T className="font-lao text-white/80" style={SMALL}>
                      {t('stock.scan.useCamera')}
                    </T>
                  </Touchable>
                </>
              ) : (
                <Touchable
                  onPress={() => setManual(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.scan.typeCode')}
                  className="flex-row items-center gap-2.5"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Ionicons name="keypad-outline" size={16} color={colors.champagne} />
                  </View>
                  <View className="flex-1">
                    <T className="font-lao-medium text-white">{t('stock.scan.typeCode')}</T>
                    <T className="font-lao text-white/70" style={SMALL}>
                      {t('stock.scan.typeCodeHint')}
                    </T>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                </Touchable>
              )}
            </View>
          </GlassView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(12,8,24,0.62)' },
});
