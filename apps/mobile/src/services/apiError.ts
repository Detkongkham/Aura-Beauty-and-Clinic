import axios from 'axios';
import i18n from '../i18n';

export type NormalizedApiError = {
  code: string;
  message: string;
  status?: number;
};

type ErrorEnvelope = { error?: { code?: string; message?: string } };

/** ແປງ error ໃດກໍ່ໄດ້ → { code, message } ທີ່ localize ແລ້ວ. */
export function normalizeError(err: unknown): NormalizedApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data as ErrorEnvelope | undefined;
    const code = body?.error?.code ?? (err.code === 'ERR_NETWORK' ? 'network' : 'generic');
    const key = `errors.${code}`;
    const translated = i18n.t(key);
    return {
      code,
      status,
      message: translated === key ? body?.error?.message ?? i18n.t('errors.generic') : translated,
    };
  }
  if (err instanceof Error) return { code: 'generic', message: err.message };
  return { code: 'generic', message: i18n.t('errors.generic') };
}
