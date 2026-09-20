import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const RECENT_CAP = 8;

type SearchState = {
  /** ຄຳຄົ້ນຫາລ່າສຸດ — ໃໝ່ສຸດຢູ່ຫົວ, ຕັດເຫຼືອ 8. */
  recent: string[];
  /** id ຂອງບໍລິການທີ່ບັນທຶກໄວ້ (local-only v1 — ຍັງບໍ່ sync ຂຶ້ນ server). */
  favorites: string[];
  /** ມຸມມອງຜົນຄົ້ນຫາ (ຈື່ຕໍ່ເຄື່ອງ). */
  resultLayout: 'list' | 'grid';
  setResultLayout: (l: 'list' | 'grid') => void;
  addRecent: (term: string) => void;
  removeRecent: (term: string) => void;
  clearRecent: () => void;
  toggleFavorite: (id: string) => void;
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      recent: [],
      favorites: [],
      resultLayout: 'list',
      setResultLayout: (resultLayout) => set({ resultLayout }),
      addRecent: (raw) => {
        const term = raw.trim();
        if (term.length < 2) return;
        set((s) => ({
          recent: [
            term,
            ...s.recent.filter((x) => x.toLowerCase() !== term.toLowerCase()),
          ].slice(0, RECENT_CAP),
        }));
      },
      removeRecent: (term) => set((s) => ({ recent: s.recent.filter((x) => x !== term) })),
      clearRecent: () => set({ recent: [] }),
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [id, ...s.favorites],
        })),
    }),
    {
      name: 'aura.search',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        recent: s.recent,
        favorites: s.favorites,
        resultLayout: s.resultLayout,
      }),
    },
  ),
);
