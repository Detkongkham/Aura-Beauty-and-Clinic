import { chatMediaContentType } from '@abcp/shared-types';
import { useEffect, useRef, useState } from 'react';

type ChatMediaContentType = (typeof chatMediaContentType.options)[number];

/** Chat photos are viewed full-size in a lightbox (see `ChatMessageBubble`), so this stays larger
 * than the 256/512px avatar/logo caps in `lib/image.ts` — downscaling only kicks in above this. */
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.85;
/** Matches the backend's 8MB post-decode cap (`chat.service.ts`) — checked client-side so an
 * oversized pick fails fast with a clear message instead of a round-trip 400. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Matches the backend's 10MB cap for audio; also caps recording length so a forgotten-running
 * mic doesn't quietly grow past it. Hitting this auto-stops (and sends) rather than discarding. */
const MAX_RECORDING_MS = 3 * 60 * 1000;

export class ChatMediaError extends Error {}

const dataUrlToBase64 = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

/** Downscales + re-encodes a picked image to JPEG so it comfortably clears the backend's size cap,
 * and returns the raw base64 payload `sendChatMediaSchema` expects (no `data:` prefix). */
export function fileToChatImage(file: File): Promise<{ base64: string; contentType: 'image/jpeg' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ChatMediaError('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new ChatMediaError('decode-failed'));
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new ChatMediaError('canvas-unsupported'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
        const base64 = dataUrlToBase64(dataUrl);
        if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
          reject(new ChatMediaError('too-large'));
          return;
        }
        resolve({ base64, contentType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ChatMediaError('read-failed'));
    reader.onload = () => resolve(dataUrlToBase64(String(reader.result)));
    reader.readAsDataURL(blob);
  });

interface VoiceRecorderState {
  isRecording: boolean;
  elapsedMs: number;
}

export interface VoiceClip {
  base64: string;
  contentType: ChatMediaContentType;
}

/** Browsers report container MIME types (`audio/webm`, `audio/mp4`, …) that line up with
 * `chatMediaContentType`; this narrows the runtime string and falls back to `audio/webm` — the
 * widest-supported browser default — if a future browser reports something unrecognized. */
const toAllowedAudioType = (mimeType: string): ChatMediaContentType => {
  const base = (mimeType || 'audio/webm').split(';')[0]!;
  const parsed = chatMediaContentType.safeParse(base);
  return parsed.success ? parsed.data : 'audio/webm';
};

/**
 * Browser `MediaRecorder`-based voice note capture — the web counterpart to mobile's
 * `expo-av`-backed `useVoiceRecorder`. `mimeType` (stripped of any `;codecs=` suffix) lands
 * squarely in `chatMediaContentType` for every evergreen browser: Chrome/Firefox record
 * `audio/webm`, Safari records `audio/mp4`.
 *
 * `onStopped` fires exactly once per recording, however it ends — `stop()`, `cancel()`, or the
 * `MAX_RECORDING_MS` safety timeout — with `null` only for an explicit `cancel()`. It's wired up
 * once per recording (inside `start`) rather than per-call, so the timeout path (which calls the
 * *native* `recorder.stop()`, not this hook's `stop`) still resolves correctly instead of the
 * clip silently vanishing.
 */
export function useVoiceRecorder(onStopped: (clip: VoiceClip | null) => void) {
  const [state, setState] = useState<VoiceRecorderState>({ isRecording: false, elapsedMs: 0 });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const maxTimeoutRef = useRef<number | null>(null);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  const cleanup = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (maxTimeoutRef.current) window.clearTimeout(maxTimeoutRef.current);
    timerRef.current = null;
    maxTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setState({ isRecording: false, elapsedMs: 0 });
  };

  useEffect(() => cleanup, []);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const contentType = toAllowedAudioType(recorder.mimeType);
      const cancelled = cancelledRef.current;
      const chunks = chunksRef.current;
      cleanup();
      if (cancelled) {
        onStoppedRef.current(null);
        return;
      }
      blobToBase64(new Blob(chunks, { type: contentType }))
        .then((base64) => onStoppedRef.current({ base64, contentType }))
        .catch(() => onStoppedRef.current(null));
    };
    recorder.start();
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setState({ isRecording: true, elapsedMs: 0 });
    timerRef.current = window.setInterval(() => {
      setState({ isRecording: true, elapsedMs: Date.now() - startedAtRef.current });
    }, 200);
    maxTimeoutRef.current = window.setTimeout(() => recorderRef.current?.stop(), MAX_RECORDING_MS);
  };

  const stop = () => {
    cancelledRef.current = false;
    recorderRef.current?.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  };

  return { ...state, start, stop, cancel };
}
