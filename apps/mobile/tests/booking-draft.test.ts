import { beforeEach, describe, expect, it } from 'vitest';
import { useBookingDraft } from '../src/store/booking-draft.store';

describe('booking-draft store', () => {
  beforeEach(() => useBookingDraft.getState().reset());

  it('start() seeds a create draft and clears stale fields', () => {
    useBookingDraft.getState().patch({ slot: { staffProfileId: 's', startAt: 'x', endAt: 'y' } });
    useBookingDraft.getState().start({
      branchId: 'b1',
      serviceId: 'svc1',
      serviceName: 'Haircut',
      price: 120000,
      durationMinutes: 45,
    });
    const s = useBookingDraft.getState();
    expect(s.mode).toBe('create');
    expect(s.serviceId).toBe('svc1');
    expect(s.slot).toBeNull();
    expect(s.staffProfileId).toBeNull();
  });

  it('patch() merges partial fields', () => {
    useBookingDraft.getState().start({ serviceId: 'svc1' });
    useBookingDraft.getState().patch({ staffProfileId: 'stf1', staffName: 'Dala' });
    useBookingDraft.getState().patch({ date: '2026-09-10' });
    const s = useBookingDraft.getState();
    expect(s.staffProfileId).toBe('stf1');
    expect(s.date).toBe('2026-09-10');
  });

  it('reset() returns to empty create defaults', () => {
    useBookingDraft.getState().start({ mode: 'reschedule', rescheduleId: 'a1', serviceId: 'svc' });
    useBookingDraft.getState().reset();
    const s = useBookingDraft.getState();
    expect(s.mode).toBe('create');
    expect(s.rescheduleId).toBeNull();
    expect(s.serviceId).toBeNull();
  });

  it('referralCode defaults to empty and start() clears a stale value', () => {
    useBookingDraft.getState().patch({ referralCode: 'AURA-OLD123' });
    expect(useBookingDraft.getState().referralCode).toBe('AURA-OLD123');
    useBookingDraft.getState().start({ serviceId: 'svc1' });
    expect(useBookingDraft.getState().referralCode).toBe('');
  });
});
