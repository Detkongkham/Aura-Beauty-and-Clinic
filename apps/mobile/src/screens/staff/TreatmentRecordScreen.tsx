import type { TreatmentPhotoCreateInput, TreatmentPhotoView } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Modal, Pressable, View } from 'react-native';
import { Screen } from '../../components/shared/Screen';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { ErrorView, LoadingScreen } from '../../components/shared/StateViews';
import { AnimatedEntrance } from '../../components/ui/AnimatedEntrance';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Touchable } from '../../components/ui/Touchable';
import { useTreatmentMutations, useTreatmentRecord } from '../../features/staff/staff-portal.api';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { normalizeError } from '../../services/apiError';
import { colors, shadow } from '../../theme';
import type { StaffAppScreenProps } from '../../navigation/types';
import {
  EmptyBlock,
  IconTile,
  SectionHeading,
  SMALL,
  T,
  TINT,
  type IconName,
} from './staff-portal.parts';

type PhotoType = TreatmentPhotoCreateInput['type'];

const PHOTO_TYPES: PhotoType[] = ['BEFORE', 'PROGRESS', 'AFTER'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const NOTES_MAX = 5000;

const TYPE_ICON: Record<PhotoType, IconName> = {
  BEFORE: 'camera-outline',
  PROGRESS: 'hourglass-outline',
  AFTER: 'sparkles-outline',
};

function mimeOf(m: string | null | undefined): TreatmentPhotoCreateInput['contentType'] {
  return (ALLOWED_MIME as readonly string[]).includes(m ?? '')
    ? (m as TreatmentPhotoCreateInput['contentType'])
    : 'image/jpeg';
}

function PhotoTile({
  photo,
  onPress,
}: {
  photo: TreatmentPhotoView;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Touchable
      onPress={onPress}
      pressScale={0.96}
      accessibilityRole="imagebutton"
      accessibilityLabel={t(`staffPortal.treatment.type_${photo.type}`)}
      className="w-[31.5%] gap-1"
    >
      <Image
        source={{ uri: photo.photoUrl }}
        className="aspect-square w-full rounded-xl border border-border bg-muted"
        resizeMode="cover"
      />
      <T numberOfLines={1} className="font-sans text-muted-foreground" style={SMALL}>
        {formatDateTime(photo.createdAt)}
      </T>
    </Touchable>
  );
}

/** ຮູບເຕັມຈໍ — ແຕະເພື່ອປິດ. */
function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }): React.JSX.Element {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/90"
        accessibilityRole="button"
        accessibilityLabel="close"
      >
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
      </Pressable>
    </Modal>
  );
}

export function TreatmentRecordScreen({
  route,
  navigation,
}: StaffAppScreenProps<'TreatmentRecord'>): React.JSX.Element {
  const { appointmentId, customerName } = route.params;
  const { t } = useTranslation();
  const query = useTreatmentRecord(appointmentId);
  const { saveNotes, addPhoto } = useTreatmentMutations(appointmentId);

  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState('');
  const [pickerType, setPickerType] = useState<PhotoType | null>(null);
  const [typeSheet, setTypeSheet] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setNotes(query.data.medicalNotes ?? '');
      setSaved(query.data.medicalNotes ?? '');
    }
  }, [query.data]);

  const photos = useMemo(() => query.data?.photos ?? [], [query.data]);
  const byType = useMemo(() => {
    const out: Record<PhotoType, TreatmentPhotoView[]> = { BEFORE: [], PROGRESS: [], AFTER: [] };
    for (const p of photos) out[p.type].push(p);
    return out;
  }, [photos]);

  const dirty = notes.trim() !== saved.trim();

  const upload = async (type: PhotoType, source: 'camera' | 'library'): Promise<void> => {
    try {
      setPickerType(null);
      setTypeSheet(false);
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('', t('staffPortal.treatment.permissionDenied'));
        return;
      }
      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
      } as const;
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset?.base64) return;
      await addPhoto.mutateAsync({
        type,
        contentType: mimeOf(asset.mimeType),
        dataBase64: asset.base64,
      });
      haptics.success();
    } catch (err) {
      haptics.error();
      Alert.alert('', normalizeError(err).message);
    }
  };

  const save = (): void => {
    const value = notes.trim() ? notes.trim() : null;
    saveNotes.mutate(
      { medicalNotes: value },
      {
        onSuccess: () => {
          setSaved(value ?? '');
          haptics.success();
        },
        onError: (err) => {
          haptics.error();
          Alert.alert('', normalizeError(err).message);
        },
      },
    );
  };

  return (
    <Screen
      scroll
      padded={false}
      edges={['top', 'bottom']}
      footer={
        <View className="gap-2">
          {dirty ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-1.5 w-1.5 rounded-full bg-warning" />
              <T className="font-lao text-muted-foreground" style={SMALL}>
                {t('staffPortal.treatment.unsaved')}
              </T>
            </View>
          ) : null}
          <Button
            label={
              saveNotes.isPending ? t('staffPortal.treatment.uploading') : t('staffPortal.treatment.save')
            }
            size="sm"
            icon="save-outline"
            labelClassName="text-[13px]"
            disabled={!dirty}
            loading={saveNotes.isPending}
            onPress={save}
          />
        </View>
      }
    >
      <ScreenHeader
        title={t('staffPortal.treatment.title')}
        titleStyle={{ fontSize: 14, lineHeight: 19 }}
        onBack={() => navigation.goBack()}
        borderless
        right={
          <Touchable
            onPress={() => setTypeSheet(true)}
            hitSlop={8}
            pressScale={0.9}
            accessibilityRole="button"
            accessibilityLabel={t('staffPortal.treatment.addPhoto')}
            className="h-9 w-9 items-center justify-center rounded-full bg-primary"
          >
            <Ionicons name="camera" size={16} color={colors.primaryForeground} />
          </Touchable>
        }
      />

      {query.isLoading ? (
        <LoadingScreen />
      ) : query.isError ? (
        <ErrorView
          message={normalizeError(query.error).message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <View className="gap-3.5 px-4 pb-6 pt-1">
          <AnimatedEntrance index={0}>
            <View
              className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
              style={shadow.xs}
            >
              <IconTile icon="person-outline" tint={TINT.client} />
              <View className="flex-1">
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.detail.customer')}
                </T>
                <T numberOfLines={1} className="font-lao-semibold text-foreground">
                  {customerName}
                </T>
              </View>
              <View className="items-end">
                <T className="font-sans-semibold text-foreground">{photos.length}</T>
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.treatment.photos')}
                </T>
              </View>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance index={1}>
            <View className="gap-2">
              <SectionHeading
                label={t('staffPortal.treatment.notesLabel')}
                trailing={
                  <T className="font-sans text-muted-foreground" style={SMALL}>
                    {notes.length}/{NOTES_MAX}
                  </T>
                }
              />
              <Input
                placeholder={t('staffPortal.treatment.notesPlaceholder')}
                value={notes}
                onChangeText={(v) => setNotes(v.slice(0, NOTES_MAX))}
                multiline
              />
              <View className="flex-row items-start gap-1.5 px-1">
                <Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} />
                <T className="flex-1 font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.treatment.privacyHint')}
                </T>
              </View>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance index={2}>
            <View className="gap-2.5">
              <SectionHeading
                label={t('staffPortal.treatment.photos')}
                hint={t('staffPortal.treatment.photosHint')}
                trailing={
                  <Button
                    label={
                      addPhoto.isPending
                        ? t('staffPortal.treatment.uploading')
                        : t('staffPortal.treatment.addPhoto')
                    }
                    size="xs"
                    variant="secondary"
                    icon="add"
                    fullWidth={false}
                    loading={addPhoto.isPending}
                    onPress={() => setTypeSheet(true)}
                  />
                }
              />

              {photos.length === 0 ? (
                <EmptyBlock
                  icon="images-outline"
                  title={t('staffPortal.treatment.empty')}
                  hint={t('staffPortal.treatment.emptyHint')}
                  actionLabel={t('staffPortal.treatment.addPhoto')}
                  onAction={() => setTypeSheet(true)}
                />
              ) : (
                PHOTO_TYPES.map((type) => {
                  const list = byType[type];
                  if (list.length === 0) return null;
                  return (
                    <View key={type} className="gap-1.5">
                      <View className="flex-row items-center gap-2 px-1">
                        <Ionicons
                          name={TYPE_ICON[type]}
                          size={12}
                          color={colors.mutedForeground}
                        />
                        <T className="font-lao-medium text-muted-foreground" style={SMALL}>
                          {t(`staffPortal.treatment.type_${type}`)}
                        </T>
                        <View className="h-px flex-1 bg-border" />
                        <T className="font-sans text-muted-foreground" style={SMALL}>
                          {list.length}
                        </T>
                      </View>
                      <View className="flex-row flex-wrap gap-[2.75%]">
                        {list.map((p) => (
                          <PhotoTile key={p.id} photo={p} onPress={() => setViewerUri(p.photoUrl)} />
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </AnimatedEntrance>
        </View>
      )}

      {/* ເລືອກປະເພດຮູບ → ເລືອກແຫຼ່ງ (ກ້ອງ / ຄັງຮູບ) */}
      <Sheet
        open={typeSheet}
        onClose={() => setTypeSheet(false)}
        title={t('staffPortal.treatment.pickType')}
      >
        <View className="gap-2">
          {PHOTO_TYPES.map((type) => (
            <Touchable
              key={type}
              onPress={() => {
                setTypeSheet(false);
                setTimeout(() => setPickerType(type), 300);
              }}
              pressScale={0.98}
              accessibilityRole="button"
              className={cn(
                'min-h-[52px] flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5',
              )}
            >
              <IconTile icon={TYPE_ICON[type]} tint={TINT.service} />
              <View className="flex-1">
                <T className="font-lao-semibold text-foreground">
                  {t(`staffPortal.treatment.type_${type}`)}
                </T>
                <T className="font-lao text-muted-foreground" style={SMALL}>
                  {t('staffPortal.treatment.typeCount', { count: byType[type].length })}
                </T>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
            </Touchable>
          ))}
          <Button
            variant="ghost"
            size="sm"
            label={t('common.cancel')}
            onPress={() => setTypeSheet(false)}
          />
        </View>
      </Sheet>

      <Sheet
        open={pickerType !== null}
        onClose={() => setPickerType(null)}
        title={t('staffPortal.treatment.pickSource')}
        description={
          pickerType ? t(`staffPortal.treatment.type_${pickerType}`) : undefined
        }
      >
        <View className="gap-2">
          <Button
            label={t('staffPortal.treatment.fromCamera')}
            size="sm"
            icon="camera-outline"
            onPress={() => pickerType && void upload(pickerType, 'camera')}
          />
          <Button
            label={t('staffPortal.treatment.fromLibrary')}
            size="sm"
            variant="outline"
            icon="images-outline"
            onPress={() => pickerType && void upload(pickerType, 'library')}
          />
          <Button
            variant="ghost"
            size="sm"
            label={t('common.cancel')}
            onPress={() => setPickerType(null)}
          />
        </View>
      </Sheet>

      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </Screen>
  );
}
