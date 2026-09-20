import { useSyncExternalStore } from 'react';

/** Tracks the resolved `.dark` class on <html> — true even when colorMode is 'system'. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
