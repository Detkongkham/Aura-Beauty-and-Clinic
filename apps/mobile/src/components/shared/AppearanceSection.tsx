import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUiStore } from '../../store/ui.store';
import { colors, shadow, THEME_TONES, toneSwatch, type ColorMode, type ThemeTone } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { haptics } from '../../lib/haptics';
import { Segmented } from '../ui/Segmented';
import { Text } from '../ui/Text';
import { Touchable } from '../ui/Touchable';

const MODES: readonly ColorMode[] = ['light', 'dark', 'system'];
const SMALL = { fontSize: 11, lineHeight: 15 } as const;

/**
 * ຮູບລັກສະນະ — ສະຫວ່າງ/ມືດ/ຕາມລະບົບ + ໂທນສີແບຣນ (ຊຸດດຽວກັນກັບ web-admin
 * Settings ▸ Appearance). ໃຊ້ຮ່ວມກັນລະຫວ່າງ ໂປຣໄຟລ໌ລູກຄ້າ ແລະ ໂປຣໄຟລ໌ພະນັກງານ;
 * ຫົວຂໍ້ section ໃຫ້ໜ້າຈໍຜູ້ເອີ້ນເປັນຜູ້ວາງເອງ.
 */
export function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation();
  const { palette, isDark } = useTheme();
  const mode = useUiStore((s) => s.colorMode);
  const setColorMode = useUiStore((s) => s.setColorMode);
  const tone = useUiStore((s) => s.themeTone);
  const setThemeTone = useUiStore((s) => s.setThemeTone);

  return (
    <View className="gap-2.5">
      <Segmented
        value={mode}
        onChange={(next) => {
          haptics.select();
          setColorMode(next as ColorMode);
        }}
        options={MODES.map((m) => ({ value: m, label: t(`appearance.mode.${m}`) }))}
      />

      <View
        className="gap-2.5 rounded-2xl border border-border bg-card p-3.5"
        style={shadow.xs}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="color-palette-outline" size={14} color={colors.primary} />
          <Text className="flex-1 font-lao-medium text-foreground" style={{ fontSize: 12, lineHeight: 17 }}>
            {t('appearance.tone')}
          </Text>
          <Text className="font-lao text-muted-foreground" style={SMALL}>
            {t(`appearance.tones.${tone}`)}
          </Text>
        </View>

        <View className="flex-row gap-2">
          {THEME_TONES.map((option) => (
            <ToneSwatch
              key={option}
              tone={option}
              label={t(`appearance.tones.${option}`)}
              active={option === tone}
              scheme={palette.scheme}
              onPress={() => {
                haptics.select();
                setThemeTone(option);
              }}
            />
          ))}
        </View>

        <Text className="font-lao text-muted-foreground" style={SMALL}>
          {mode === 'system'
            ? t('appearance.systemHint', { mode: t(`appearance.mode.${isDark ? 'dark' : 'light'}`) })
            : t('appearance.hint')}
        </Text>
      </View>
    </View>
  );
}

function ToneSwatch({
  tone,
  label,
  active,
  scheme,
  onPress,
}: {
  tone: ThemeTone;
  label: string;
  active: boolean;
  scheme: 'light' | 'dark';
  onPress: () => void;
}): React.JSX.Element {
  const swatch = toneSwatch(tone, scheme);
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className="flex-1 items-center gap-1"
    >
      <View
        className="h-10 w-full items-center justify-center rounded-xl border"
        style={{
          backgroundColor: swatch.soft,
          borderColor: active ? swatch.primary : colors.border,
          borderWidth: active ? 2 : 1,
        }}
      >
        <View className="h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: swatch.primary }}>
          {active ? <Ionicons name="checkmark" size={11} color={colors.primaryForeground} /> : null}
        </View>
      </View>
      <Text numberOfLines={1} className="font-lao text-muted-foreground" style={SMALL}>
        {label}
      </Text>
    </Touchable>
  );
}
