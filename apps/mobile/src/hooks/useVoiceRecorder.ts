import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';

export type VoiceRecording = { dataBase64: string; durationMs: number };

/**
 * ອັດຂໍ້ຄວາມສຽງ (voice note) — ໃຊ້ໃນ chat composer ທຸກໜ້າ. ອັດເປັນ m4a (AAC), ອ່ານກັບເປັນ base64
 * ຜ່ານ `expo-file-system` ແລ້ວສົ່ງໄປ `/chat/threads/:id/media`.
 */
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicking = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const start = useCallback(async (): Promise<boolean> => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return false;

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
    return true;
  }, []);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const recording = recordingRef.current;
    stopTicking();
    setIsRecording(false);
    if (!recording) return null;
    recordingRef.current = null;

    await recording.stopAndUnloadAsync();
    const durationMs = Date.now() - startedAtRef.current;
    const uri = recording.getURI();
    if (!uri) return null;

    const dataBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { dataBase64, durationMs };
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    const recording = recordingRef.current;
    stopTicking();
    setIsRecording(false);
    recordingRef.current = null;
    if (recording) {
      await recording.stopAndUnloadAsync().catch(() => undefined);
    }
  }, []);

  return { isRecording, elapsedMs, start, stop, cancel };
}
