import type { AccountOverview } from '@abcp/shared-types';
import { Camera, Lock, Trash2, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { SettingsRow } from '@/features/settings/components/SettingsRow';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { fileToAvatarDataUrl } from '@/lib/image';
import type { NormalizedApiError } from '@/services/apiError';

import { useUpdateProfile } from '../account.api';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // resized to ≤256px client-side before upload
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProfileSectionProps {
  data: AccountOverview;
  index: number;
}

/** Name + email are editable (dirty-gated save bar); phone / role / branch are admin-owned. */
export function ProfileSection({ data, index }: ProfileSectionProps) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const avatar = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = { name: data.user.name, email: data.user.email ?? '' };
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState({ name: false, email: false });
  const [serverError, setServerError] = useState<{
    field: 'email' | 'name';
    message: string;
  } | null>(null);

  // Re-seed when the server copy changes (after save / refetch) and nothing is pending.
  useEffect(() => {
    setForm({ name: data.user.name, email: data.user.email ?? '' });
  }, [data.user.name, data.user.email]);

  const nameError = form.name.trim().length === 0 ? t('account.profile.nameRequired') : null;
  const emailError =
    form.email.trim() && !EMAIL_RE.test(form.email.trim())
      ? t('account.profile.emailInvalid')
      : null;
  const dirty = form.name.trim() !== initial.name || form.email.trim() !== initial.email;

  const save = () => {
    setTouched({ name: true, email: true });
    if (nameError || emailError) return;
    setServerError(null);
    update.mutate(
      { name: form.name.trim(), email: form.email.trim() || null },
      {
        onSuccess: () => toast.success(t('account.profile.saved')),
        onError: (err) => {
          const e = err as NormalizedApiError;
          if (e.status === 409)
            setServerError({ field: 'email', message: t('account.profile.emailTaken') });
          else toast.error(e.message);
        },
      },
    );
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error(t('account.profile.photoType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t('account.profile.photoTooLarge'));
      return;
    }
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      avatar.mutate(
        { avatarUrl: dataUrl },
        {
          onSuccess: () => toast.success(t('account.profile.photoSaved')),
          onError: (err) => toast.error((err as Error).message),
        },
      );
    } catch {
      toast.error(t('account.profile.photoType'));
    }
  };

  const removePhoto = () =>
    avatar.mutate(
      { avatarUrl: null },
      { onSuccess: () => toast.success(t('account.profile.photoRemoved')) },
    );

  const shownEmailError =
    serverError?.field === 'email' ? serverError.message : touched.email ? emailError : null;
  const shownNameError = touched.name ? nameError : null;

  return (
    <SettingsSection
      id="acc-profile"
      icon={UserRound}
      index={index}
      title={t('account.profile.title')}
      desc={t('account.profile.desc')}
    >
      <SettingsRow label={t('account.profile.photo')} hint={t('account.profile.photoHint')}>
        <div className="flex items-center gap-3">
          <PersonAvatar name={data.user.name} src={data.avatarUrl} mode="auto" size={52} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={avatar.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Camera aria-hidden="true" />
              {avatar.isPending
                ? t('common.saving')
                : data.avatarUrl
                  ? t('account.profile.changePhoto')
                  : t('account.profile.uploadPhoto')}
            </Button>
            {data.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={avatar.isPending}
                onClick={removePhoto}
              >
                <Trash2 aria-hidden="true" />
                {t('account.profile.removePhoto')}
              </Button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            aria-label={t('account.profile.uploadPhoto')}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </SettingsRow>

      <SettingsRow label={t('users.name')} htmlFor="acc-name">
        <div>
          <Input
            id="acc-name"
            value={form.name}
            maxLength={120}
            autoComplete="name"
            aria-invalid={shownNameError ? true : undefined}
            aria-describedby={shownNameError ? 'acc-name-err' : undefined}
            onBlur={() => setTouched((x) => ({ ...x, name: true }))}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          {shownNameError ? (
            <p id="acc-name-err" role="alert" className="mt-1 text-xs text-destructive">
              {shownNameError}
            </p>
          ) : null}
        </div>
      </SettingsRow>

      <SettingsRow
        label={t('users.email')}
        hint={t('account.profile.emailHint')}
        htmlFor="acc-email"
      >
        <div>
          <Input
            id="acc-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={form.email}
            aria-invalid={shownEmailError ? true : undefined}
            aria-describedby={shownEmailError ? 'acc-email-err' : undefined}
            onBlur={() => setTouched((x) => ({ ...x, email: true }))}
            onChange={(e) => {
              setServerError(null);
              setForm((f) => ({ ...f, email: e.target.value }));
            }}
          />
          {shownEmailError ? (
            <p id="acc-email-err" role="alert" className="mt-1 text-xs text-destructive">
              {shownEmailError}
            </p>
          ) : null}
        </div>
      </SettingsRow>

      <ReadOnlyRow
        label={t('auth.phone')}
        value={data.user.phone}
        hint={t('account.profile.phoneHint')}
        mono
      />
      <ReadOnlyRow
        label={t('users.role')}
        value={
          data.role?.name ?? t(`messaging.role.${data.user.role}`, { defaultValue: data.user.role })
        }
        hint={t('account.profile.adminOwned')}
      />
      <ReadOnlyRow
        label={t('account.profile.branch')}
        value={data.branch?.name ?? t('account.hero.allBranches')}
        hint={t('account.profile.adminOwned')}
      />

      {dirty ? (
        <div className="flex flex-wrap items-center justify-between gap-2 py-3 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
          <span className="flex items-center gap-2 text-xs text-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            {t('settings.unsaved')}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={() => {
                setForm(initial);
                setTouched({ name: false, email: false });
                setServerError(null);
              }}
            >
              {t('common.discard')}
            </Button>
            <Button type="button" size="sm" disabled={update.isPending} onClick={save}>
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </SettingsSection>
  );
}

function ReadOnlyRow({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <SettingsRow label={label} hint={hint}>
      <div className="flex h-10 items-center gap-2 rounded-sm border border-dashed border-border bg-muted/40 px-3 text-sm text-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={mono ? 'truncate tabular-nums' : 'truncate'}>{value}</span>
      </div>
    </SettingsRow>
  );
}
