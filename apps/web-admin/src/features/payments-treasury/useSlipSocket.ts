import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PaymentSlipEvent } from '@abcp/shared-types';

import { connectAppSocket } from '@/services/socket';

import { TREASURY_KEY } from './treasury.api';

/**
 * Live refresh for the slip inbox: joins the reviewer room and invalidates the slip queries whenever
 * a slip changes (uploaded / OCR finished / reviewed by a colleague). The event carries no PII —
 * details still come from REST, so permission checks stay server-side.
 *
 * Returns whether the socket is connected, so the page can say "live" honestly, and calls `onEvent`
 * (e.g. to flash the row that just changed).
 */
export function useSlipSocket(
  enabled: boolean,
  onEvent?: (evt: PaymentSlipEvent) => void,
): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const socket = connectAppSocket();
    const join = () => {
      setConnected(true);
      socket.emit('join-slip-review');
    };
    const drop = () => setConnected(false);
    socket.on('connect', join);
    socket.on('disconnect', drop);
    socket.on('payment-slip:updated', (evt: PaymentSlipEvent) => {
      void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'slips'] });
      void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'slip'] });
      onEvent?.(evt);
    });
    return () => {
      socket.emit('leave-slip-review');
      socket.off('connect', join);
      socket.off('disconnect', drop);
      socket.off('payment-slip:updated');
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onEvent is a notification hook, not a dependency
  }, [enabled, qc]);
  return connected;
}
