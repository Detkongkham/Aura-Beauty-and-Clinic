import { useCallback, useEffect, useRef } from 'react';

import { useDiscardServiceImage } from './services.api';

/**
 * Tracks images uploaded while a form dialog is open and discards the ones
 * that don't end up saved once it closes (cancel, replaced, removed). Call
 * `keep(url)` right before saving so the saved image survives the close; the
 * server also refuses to delete anything a row still references. Anything that
 * slips through (tab closed mid-edit) is swept by the backend's nightly upload-gc job.
 */
export function useImageUploadSession(open: boolean) {
  const uploaded = useRef(new Set<string>());
  const keepRef = useRef<string | null>(null);
  const { mutate: discard } = useDiscardServiceImage();

  useEffect(() => {
    if (!open) return;
    keepRef.current = null;
    const pending = uploaded.current;
    return () => {
      for (const url of pending) if (url !== keepRef.current) discard(url);
      pending.clear();
    };
  }, [open, discard]);

  const track = useCallback((url: string) => {
    uploaded.current.add(url);
  }, []);
  const keep = useCallback((url: string | null) => {
    keepRef.current = url;
  }, []);

  return { track, keep };
}
