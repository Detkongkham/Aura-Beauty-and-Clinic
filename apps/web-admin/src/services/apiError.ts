import { AxiosError } from 'axios';

/** Backend error envelope: `{ error: { code, message, details? } }` (see backend errorHandler). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class NormalizedApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  /** true when the request never reached the server (offline, DNS, CORS). */
  readonly isNetwork: boolean;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    isNetwork?: boolean;
  }) {
    super(params.message);
    this.name = 'NormalizedApiError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.isNetwork = params.isNetwork ?? false;
  }
}

function isApiErrorBody(v: unknown): v is ApiErrorBody {
  return (
    typeof v === 'object' &&
    v !== null &&
    'error' in v &&
    typeof (v as ApiErrorBody).error?.code === 'string'
  );
}

/** Turn any thrown value from axios into a single predictable shape. */
export function normalizeError(err: unknown): NormalizedApiError {
  if (err instanceof NormalizedApiError) return err;

  if (err instanceof AxiosError) {
    if (err.response) {
      const body = err.response.data;
      if (isApiErrorBody(body)) {
        return new NormalizedApiError({
          code: body.error.code,
          message: body.error.message,
          status: err.response.status,
          details: body.error.details,
        });
      }
      return new NormalizedApiError({
        code: 'INTERNAL',
        message: err.message || 'Request failed',
        status: err.response.status,
      });
    }
    return new NormalizedApiError({
      code: 'NETWORK',
      message: 'ບໍ່ສາມາດເຊື່ອມຕໍ່ເຊີບເວີໄດ້',
      status: 0,
      isNetwork: true,
    });
  }

  return new NormalizedApiError({
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Unknown error',
    status: 0,
  });
}
