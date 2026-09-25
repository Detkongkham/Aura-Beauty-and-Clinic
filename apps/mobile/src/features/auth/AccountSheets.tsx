import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AVATAR_PACK_SIZE, packAvatarToken, parsePackAvatar } from '@abcp/shared-types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, useWindowDimensions, View } from 'react-native';
import { z } from 'zod';
import { Avatar, avatarSourceAt } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { Touchable } from '../../components/ui/Touchable';
import { normalizeError } from '../../services/apiError';
import { colors } from '../../theme';
import { apiChangePassword, apiUpdateProfile } from './auth.api';
import { useAuth } from './useAuth';

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().or(z.literal('')),
});
type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileEditSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  const { control, handleSubmit, reset, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  useEffect(() => {
    if (open) reset({ name: user?.name ?? '', email: user?.email ?? '' });
  }, [open, user?.name, user?.email, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      apiUpdateProfile({
        name: values.name.trim(),
        email: values.email.trim() ? values.email.trim() : null,
      }),
    onSuccess: (next) => {
      updateUser({ name: next.name, email: next.email });
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <Sheet open={open} onClose={onClose} title={t('profile.editTitle')}>
      <View className="gap-3">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <Input
              label={t('auth.name')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              icon="person-outline"
              autoCapitalize="words"
              error={fieldState.error ? t('profile.nameRequired') : undefined}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Input
              label={t('auth.email')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              icon="mail-outline"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={t('profile.emailOptional')}
              error={fieldState.error ? t('profile.emailInvalid') : undefined}
            />
          )}
        />
        {mutation.isError ? (
          <Text variant="caption" className="text-destructive">
            {normalizeError(mutation.error).message}
          </Text>
        ) : null}
        <Button
          label={t('common.save')}
          loading={mutation.isPending}
          disabled={!formState.isDirty}
          onPress={onSubmit}
        />
      </View>
    </Sheet>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

export function ChangePasswordSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { control, handleSubmit, reset, formState } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (open) reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      apiChangePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: onClose,
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <Sheet open={open} onClose={onClose} title={t('profile.changePasswordTitle')}>
      <View className="gap-3">
        <Controller
          control={control}
          name="currentPassword"
          render={({ field }) => (
            <Input
              label={t('profile.currentPassword')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              icon="lock-closed-outline"
              secureTextEntry
            />
          )}
        />
        <Controller
          control={control}
          name="newPassword"
          render={({ field, fieldState }) => (
            <Input
              label={t('profile.newPassword')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              icon="key-outline"
              secureTextEntry
              error={fieldState.error ? t('profile.passwordTooShort') : undefined}
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <Input
              label={t('profile.confirmPassword')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              icon="key-outline"
              secureTextEntry
              error={fieldState.error ? t('profile.passwordMismatch') : undefined}
            />
          )}
        />
        {mutation.isError ? (
          <Text variant="caption" className="text-destructive">
            {normalizeError(mutation.error).message}
          </Text>
        ) : null}
        <Button
          label={t('profile.changePasswordTitle')}
          loading={mutation.isPending}
          disabled={!formState.isDirty}
          onPress={onSubmit}
        />
      </View>
    </Sheet>
  );
}

const PICKER_COLS = 5;
const PICKER_GAP = 10;
const PACK_INDEXES = Array.from({ length: AVATAR_PACK_SIZE }, (_, i) => i + 1);

/**
 * ເລືອກ avatar ກາຕູນ 3D ເອງ ແທນໜ້າທີ່ສຸ່ມຈາກ hash ຊື່. ບັນທຶກເປັນ token `pack:NN`
 * ໃນ `avatarUrl` → web PersonAvatar ສະແດງໜ້າດຽວກັນ. "ໃຊ້ຄ່າເລີ່ມຕົ້ນ" = null (ກັບໄປ hash ຊື່).
 */
export function AvatarPickerSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const { width, height } = useWindowDimensions();
  const current = parsePackAvatar(user?.avatarUrl);
  const [selected, setSelected] = useState<number | null>(current);

  useEffect(() => {
    if (open) setSelected(current);
  }, [open, current]);

  // Sheet ມີ px-5 (20px) ສອງຂ້າງ.
  const cell = Math.floor((width - 40 - PICKER_GAP * (PICKER_COLS - 1)) / PICKER_COLS);

  const mutation = useMutation({
    mutationFn: (avatarUrl: string | null) => apiUpdateProfile({ avatarUrl }),
    onSuccess: (next) => {
      updateUser({ avatarUrl: next.avatarUrl });
      onClose();
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('profile.avatarPickerTitle')}
      description={t('profile.avatarPickerDesc')}
    >
      <View className="gap-3">
        <View className="items-center">
          <Avatar
            name={user?.name ?? ''}
            uri={selected !== null ? packAvatarToken(selected) : null}
            size={72}
            mode="cartoon"
          />
        </View>
        <ScrollView style={{ maxHeight: height * 0.42 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row flex-wrap" style={{ gap: PICKER_GAP }}>
            {PACK_INDEXES.map((n) => {
              const active = selected === n;
              return (
                <Touchable
                  key={n}
                  onPress={() => setSelected(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t('profile.avatarOption', { n })}
                  className={
                    active
                      ? 'items-center justify-center rounded-full border-2 border-primary'
                      : 'items-center justify-center rounded-full border-2 border-transparent'
                  }
                  style={{ width: cell, height: cell }}
                >
                  <View className="h-full w-full overflow-hidden rounded-full bg-primary-subtle">
                    <Image source={avatarSourceAt(n)} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                  </View>
                  {active ? (
                    <View className="absolute bottom-0 right-0 h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-primary">
                      <Ionicons name="checkmark" size={11} color={colors.primaryForeground} />
                    </View>
                  ) : null}
                </Touchable>
              );
            })}
          </View>
        </ScrollView>
        {mutation.isError ? (
          <Text variant="caption" className="text-destructive">
            {normalizeError(mutation.error).message}
          </Text>
        ) : null}
        <Button
          label={t('common.save')}
          loading={mutation.isPending}
          disabled={selected === null || selected === current}
          onPress={() => selected !== null && mutation.mutate(packAvatarToken(selected))}
        />
        {user?.avatarUrl ? (
          <Button
            label={t('profile.avatarUseDefault')}
            variant="ghost"
            disabled={mutation.isPending}
            onPress={() => mutation.mutate(null)}
          />
        ) : null}
      </View>
    </Sheet>
  );
}
