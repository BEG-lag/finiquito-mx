/**
 * Every number in the READMEs must come from running the code.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateSeverance, MINIMUM_WAGES, UMA_VALUES } from '../src/index.ts';
import { exampleMarkdown, extractBlock, README_FILES, replaceBlock } from '../scripts/readme-example.ts';

const docs = {
  en: readFileSync(README_FILES.en, 'utf8'),
  es: readFileSync(README_FILES.es, 'utf8'),
};

describe('README', () => {
  it.each(['en', 'es'] as const)('the %s worked example matches the code output', (locale) => {
    expect(extractBlock(docs[locale])).toBe(exampleMarkdown(locale));
  });

  it('the quickstart snippets show real output', () => {
    const input = {
      startDate: '2019-03-01',
      endDate: '2026-10-31',
      salary: { amount: '25000', period: 'monthly' as const },
      reason: 'unjustified-dismissal' as const,
      zone: 'general' as const,
    };
    for (const locale of ['en', 'es'] as const) {
      const r = calculateSeverance(input, { locale });
      const item = r.items[3];
      expect(docs[locale]).toContain(`totals.total.formatted; // '${r.totals.total.formatted}'`);
      expect(item?.id).toBe('seniority-premium');
      expect(docs[locale]).toContain(`label: '${item?.label ?? ''}'`);
      expect(docs[locale]).toContain(`formula: '${item?.formula ?? ''}'`);
      expect(docs[locale]).toContain(`centavos: ${String(item?.amount.centavos)}`);
    }
  });

  it('the data tables in both READMEs match the bundled official values', () => {
    for (const doc of Object.values(docs)) {
      for (const mw of MINIMUM_WAGES) {
        expect(doc).toContain(`$${mw.general}`);
        expect(doc).toContain(`$${mw.zlfn}`);
      }
      for (const uma of UMA_VALUES) expect(doc).toContain(`$${uma.daily}`);
    }
  });

  it('carries the disclaimer and cross-links both languages', () => {
    expect(docs.en).toContain(
      'Estimate for reference only. Not legal advice. Validate with PROFEDET, an attorney or the competent authority.',
    );
    expect(docs.en).toContain('href="README.es.md"');
    expect(docs.es).toContain('href="README.md"');
  });

  it('replaceBlock only touches the generated region', () => {
    const doc = docs.en;
    expect(replaceBlock(doc, exampleMarkdown('en'))).toBe(doc);
    expect(() => replaceBlock('no markers', 'x')).toThrow();
    expect(extractBlock('no markers')).toBeNull();
  });
});
