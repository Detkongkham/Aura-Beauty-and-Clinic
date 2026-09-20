import { ImageUp, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { fileToLogoDataUrl } from '@/lib/image';

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB — trimmed further by fileToLogoDataUrl before it lands in form state
const DEFAULT_LOGO = '/logo.png';

interface LogoUploadFieldProps {
  value: string;
  disabled?: boolean;
  onChange: (dataUrl: string) => void;
}

/** Preview + upload/reset controls for the business logo — resizes client-side, no backend needed. */
export function LogoUploadField({ value, disabled, onChange }: LogoUploadFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.logo.invalidType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t('settings.logo.tooLarge'));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      onChange(dataUrl);
    } catch {
      toast.error(t('settings.logo.invalidType'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
        <img src={value || DEFAULT_LOGO} alt={t('settings.logo.preview')} className="h-full w-full object-contain" />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={disabled || busy} onClick={pick}>
          <ImageUp className="h-4 w-4" aria-hidden="true" />
          {busy ? t('common.loading') : t('settings.logo.upload')}
        </Button>
        {value !== DEFAULT_LOGO ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={() => onChange(DEFAULT_LOGO)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('settings.logo.reset')}
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
