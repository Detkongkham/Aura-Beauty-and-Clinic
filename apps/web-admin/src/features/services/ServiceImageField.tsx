import { ImagePlus, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { FileTooLargeError, fileToBase64 } from '@/features/payments-treasury/treasury.lib';

import { useUploadServiceImage } from './services.api';

const ACCEPT = 'image/jpeg,image/png,image/webp';

interface Props {
  value: string;
  onChange: (url: string) => void;
  /** Called with each freshly uploaded URL — feed it to `useImageUploadSession().track`. */
  onUploaded?: (url: string) => void;
  name?: string;
  error?: string;
}

/**
 * Service catalog image: drag-drop / click / paste an image to upload it
 * (downscaled to ≤1600px JPEG client-side, stored via POST /services/images),
 * or paste an external link. The resulting URL is what the form saves as `imageUrl`.
 */
export function ServiceImageField({ value, onChange, onUploaded, name, error }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadServiceImage();
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState(false);
  const [showLink, setShowLink] = useState(false);
  useEffect(() => setBroken(false), [value]);

  const busy = upload.isPending;
  const hasImage = Boolean(value) && !broken;

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error(t('services.imageInvalidType'));
      return;
    }
    try {
      const payload = await fileToBase64(file, { maxDimension: 1600, quality: 0.85 });
      if (payload.contentType !== 'image/jpeg') throw new Error('unexpected');
      const { url } = await upload.mutateAsync({
        contentType: payload.contentType,
        dataBase64: payload.dataBase64,
      });
      onUploaded?.(url);
      onChange(url);
      setShowLink(false);
      toast.success(t('services.imageUploaded'));
    } catch (err) {
      if (err instanceof FileTooLargeError) toast.error(t('services.imageTooLarge'));
      else if (err instanceof NormalizedApiError) toast.error(err.message);
      else toast.error(t('services.imageUploadFailed'));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void handleFile(file);
    }
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={t('services.imageUpload')}
        onClick={() => !hasImage && openPicker()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !hasImage) {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={cn(
          'group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          hasImage ? 'border-border' : 'cursor-pointer border-dashed border-input hover:border-primary/60 hover:bg-muted/70',
          dragging && 'border-primary bg-primary/5',
          error && 'border-destructive',
        )}
      >
        {hasImage ? (
          <>
            <img
              src={value}
              alt={name || ''}
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t('services.imageReplace')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('services.imageRemove')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-primary shadow-sm">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">
              {value && broken ? t('services.imageBroken') : t('services.imageDropHint')}
            </p>
            <p className="text-xs text-muted-foreground">{t('services.imageFormats')}</p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm font-medium text-foreground backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('services.imageUploading')}
          </div>
        )}
      </div>

      {showLink ? (
        <Input
          autoFocus
          placeholder="https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowLink(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('services.imageUseLink')}
        </button>
      )}
    </div>
  );
}
