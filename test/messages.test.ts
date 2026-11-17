import { describe, expect, it } from 'vitest';
import { ITEM_LABELS, NOTICES, TAX_LABELS, WORDS } from '../src/messages.ts';

const params = {
  daily: '$100.00',
  mw: '$315.04',
  given: '10',
  taken: '3',
  accrued: '2',
  factor: '1.050000',
  other: '1',
  base: 'daily',
  cap: '$630.08',
  floor: '$315.04',
  years: '3.5000',
  value: '$1.00',
};

describe('messages', () => {
  it('both languages define the same keys', () => {
    for (const dict of [ITEM_LABELS, TAX_LABELS, WORDS, NOTICES]) {
      expect(Object.keys(dict.en).sort()).toEqual(Object.keys(dict.es).sort());
    }
  });

  it('every notice renders in both languages, mentions its numbers, and has no em-dash', () => {
    for (const locale of ['es', 'en'] as const) {
      for (const [code, template] of Object.entries(NOTICES[locale])) {
        const text = template(params);
        expect(text.length, `${locale}:${code}`).toBeGreaterThan(30);
        expect(text).not.toMatch(/undefined|\$\{/);
        expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
      }
      // Branches that depend on parameters.
      expect(NOTICES[locale]['seniority-premium-base']({ base: 'integrated' })).toMatch(/243324/);
      expect(NOTICES[locale]['integrated-salary-estimated']({ factor: '1.0', other: '' })).toMatch(/1\.0/);
    }
  });
});
