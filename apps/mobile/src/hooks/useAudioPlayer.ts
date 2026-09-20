import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';

/** ຫຼິ້ນ/ຢຸດຂໍ້ຄວາມສຽງ ໜຶ່ງກ້ອນ (chat bubble) — ໂຫຼດ `Audio.Sound` ແບບ lazy ຄັ້ງທຳອິດທີ່ກົດຫຼິ້ນ. */
export function useAudioPlayer(uri: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, []);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setIsPlaying(true);
      return;
    }
    setIsLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          void sound.setPositionAsync(0);
        }
      });
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, uri]);

  return { isPlaying, isLoading, toggle };
}
