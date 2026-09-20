import { describe, expect, it } from 'vitest';
import { buildBranchCheckInPayload, checkInWindow, parseBranchCheckInPayload } from '../checkin.js';

const ID = '11111111-1111-1111-1111-111111111111';

describe('branch check-in QR payload', () => {
  it('round-trips build → parse', () => {
    expect(parseBranchCheckInPayload(buildBranchCheckInPayload(ID))).toBe(ID);
  });
  it('ຮັບ uuid ເປົ່າ ແລະ ຊ່ອງວ່າງ/ຕົວພິມໃຫຍ່', () => {
    expect(parseBranchCheckInPayload(`  ${ID.toUpperCase()} `)).toBe(ID);
  });
  it('ປະຕິເສດ QR ອື່ນ', () => {
    expect(parseBranchCheckInPayload('https://example.com')).toBeNull();
    expect(parseBranchCheckInPayload('aura://check-in?branch=nope')).toBeNull();
  });
});

describe('checkInWindow', () => {
  const now = Date.UTC(2026, 8, 17, 10);
  it('too-early / open / closed', () => {
    expect(checkInWindow(new Date(now + 25 * 3_600_000), now)).toBe('too-early');
    expect(checkInWindow(new Date(now + 3_600_000), now)).toBe('open');
    expect(checkInWindow(new Date(now - 3 * 3_600_000), now)).toBe('open');
    expect(checkInWindow(new Date(now - 5 * 3_600_000), now)).toBe('closed');
  });
});
