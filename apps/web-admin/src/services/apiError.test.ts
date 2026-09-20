import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { normalizeError, NormalizedApiError } from './apiError';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const err = new AxiosError('Request failed');
  err.response = {
    status,
    data,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

describe('normalizeError', () => {
  it('unwraps the backend { error: { code, message } } envelope', () => {
    const n = normalizeError(
      axiosErrorWith(401, { error: { code: 'INVALID_CREDENTIALS', message: 'bad' } }),
    );
    expect(n).toBeInstanceOf(NormalizedApiError);
    expect(n.code).toBe('INVALID_CREDENTIALS');
    expect(n.status).toBe(401);
    expect(n.isNetwork).toBe(false);
  });

  it('flags requests that never reached the server as network errors', () => {
    const n = normalizeError(new AxiosError('Network Error'));
    expect(n.isNetwork).toBe(true);
    expect(n.code).toBe('NETWORK');
  });

  it('passes through an already-normalized error', () => {
    const original = new NormalizedApiError({ code: 'X', message: 'y', status: 500 });
    expect(normalizeError(original)).toBe(original);
  });
});
