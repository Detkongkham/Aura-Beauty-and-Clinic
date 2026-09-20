import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { Text } from '../../components/ui/Text';
import { normalizeError } from '../../services/apiError';
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
