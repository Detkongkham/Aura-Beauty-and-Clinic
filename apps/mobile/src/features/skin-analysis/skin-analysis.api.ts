import type { CreateSkinAnalysisInput, SkinAnalysisView } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** ໂມດູນ 30 — AI Skin & Hair Camera (rule-based heuristic, ບໍ່ແມ່ນ ML ແທ້). */
export function useMyAnalyses() {
  return useQuery({
    queryKey: qk.skinAnalyses,
    queryFn: async () => {
      const { data } = await http.get<{ data: SkinAnalysisView[] }>('/skin-analysis/me');
      return data.data;
    },
  });
}

export function useCreateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSkinAnalysisInput) => {
      const { data } = await http.post<{ data: SkinAnalysisView }>('/skin-analysis', input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.skinAnalyses });
    },
  });
}
