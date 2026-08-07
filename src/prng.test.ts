import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, rngFor } from './prng';

describe('hashString', () => {
  it('is deterministic and distinguishes close inputs', () => {
    expect(hashString('Ham sandwich')).toBe(hashString('Ham sandwich'));
    expect(hashString('Ham sandwich')).not.toBe(hashString('Ham sandwick'));
  });
});

describe('mulberry32', () => {
  it('yields the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('rngFor', () => {
  it('derives distinct streams from distinct parts', () => {
    expect(rngFor('Ham sandwich', '0')()).not.toBe(rngFor('Ham sandwich', '1')());
  });
});
