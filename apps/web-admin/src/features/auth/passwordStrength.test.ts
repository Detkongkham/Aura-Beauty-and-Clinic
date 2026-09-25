import { describe, expect, it } from 'vitest';

import { scorePassword } from './passwordStrength';

describe('scorePassword', () => {
  it('is empty for an empty value', () => {
    expect(scorePassword('').score).toBe(0);
  });

  it('never rates a password under the 8-char minimum above weak', () => {
    expect(scorePassword('Ab1!').score).toBe(1);
  });

  it('climbs with each advisory rule', () => {
    expect(scorePassword('abcdefgh').score).toBe(1);
    expect(scorePassword('abcdefg1').score).toBe(2);
    expect(scorePassword('Abcdefg1').score).toBe(3);
    expect(scorePassword('Abcdefg1!').score).toBe(4);
  });

  it('caps at strong', () => {
    expect(scorePassword('Abcdefghijk1!').score).toBe(4);
  });
});
