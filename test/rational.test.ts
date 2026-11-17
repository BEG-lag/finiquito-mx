import { describe, expect, it } from 'vitest';
import { Rational, q } from '../src/rational.ts';
import { formatCentavos, money, moneyFromCentavos, moneyToRational, formatPesos } from '../src/money.ts';

describe('Rational', () => {
  it('normalizes sign and common factors', () => {
    const r = Rational.of(6, -4);
    expect(r.n).toBe(-3n);
    expect(r.d).toBe(2n);
    expect(r.toString()).toBe('-3/2');
    expect(Rational.of(10, 5).toString()).toBe('2');
  });

  it('rejects a zero denominator and division by zero', () => {
    expect(() => Rational.of(1, 0)).toThrow(RangeError);
    expect(() => q(1).div(Rational.ZERO)).toThrow(RangeError);
  });

  it('parses decimals exactly (no binary floating point)', () => {
    expect(q('0.1').add(q('0.2')).eq(q('0.3'))).toBe(true);
    expect(q(0.1).add(q(0.2)).eq(q('0.3'))).toBe(true);
    expect(q('1234.56').toString()).toBe('30864/25');
    expect(q('-2.5').toString()).toBe('-5/2');
    expect(q('.5').toString()).toBe('1/2');
    expect(q('1.5e3').toString()).toBe('1500');
    expect(q('15e-1').toString()).toBe('3/2');
    expect(q(1e21).toString()).toBe('1000000000000000000000');
    expect(q('1_000').toString()).toBe('1000');
    expect(q(7n).toString()).toBe('7');
    expect(q(q(3)).toString()).toBe('3');
  });

  it('rejects garbage', () => {
    expect(() => q('abc')).toThrow(RangeError);
    expect(() => q('')).toThrow(RangeError);
    expect(() => q('.')).toThrow(RangeError);
    expect(() => q(Number.NaN)).toThrow(RangeError);
    expect(() => q(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('does arithmetic and comparisons', () => {
    const a = q('0.5');
    expect(a.mul(q(4)).toString()).toBe('2');
    expect(q(1).sub(q('0.25')).toString()).toBe('3/4');
    expect(q(3).div(q(4)).toString()).toBe('3/4');
    expect(q(2).neg().toString()).toBe('-2');
    expect(q(1).lt(q(2))).toBe(true);
    expect(q(2).lte(q(2))).toBe(true);
    expect(q(3).gt(q(2))).toBe(true);
    expect(q(2).gte(q(3))).toBe(false);
    expect(q(2).cmp(q(2))).toBe(0);
    expect(Rational.min(q(1), q(2)).toString()).toBe('1');
    expect(Rational.max(q(1), q(2)).toString()).toBe('2');
    expect(Rational.sum([q(1), q(2), q('0.5')]).toString()).toBe('7/2');
    expect(q(0).isZero()).toBe(true);
    expect(q(-1).isNegative()).toBe(true);
    expect(q(4).isInteger()).toBe(true);
    expect(q('0.5').isInteger()).toBe(false);
    expect(q('2.5').toNumber()).toBe(2.5);
  });

  it('floors toward negative infinity', () => {
    expect(q('2.5').floor()).toBe(2n);
    expect(q('-2.5').floor()).toBe(-3n);
    expect(q(-3).floor()).toBe(-3n);
  });

  it('rounds half away from zero', () => {
    expect(q('1.005').roundToCentavos()).toBe(101n);
    expect(q('1.004999').roundToCentavos()).toBe(100n);
    expect(q('-1.005').roundToCentavos()).toBe(-101n);
    expect(Rational.of(2, 3).toFixed(4)).toBe('0.6667');
    expect(Rational.of(-2, 3).toFixed(2)).toBe('-0.67');
    expect(q('2.5').toFixed(0)).toBe('3');
    expect(q('7.30').toDecimalString(4)).toBe('7.3');
    expect(q(12).toDecimalString(4)).toBe('12');
    expect(Rational.of(1, 3).toDecimalString(4)).toBe('0.3333');
    expect(q('12.345').round(2).toString()).toBe('247/20');
  });
});

describe('money', () => {
  it('formats Mexican pesos with thousands separators', () => {
    expect(formatCentavos(123456789n)).toBe('$1,234,567.89');
    expect(formatCentavos(5n)).toBe('$0.05');
    expect(formatCentavos(-150000n)).toBe('-$1,500.00');
    expect(formatPesos(q('999.995'))).toBe('$1,000.00');
  });

  it('round-trips between Money and Rational', () => {
    const m = money(q('1234.565'));
    expect(m).toEqual({ centavos: 123457, amount: '1234.57', formatted: '$1,234.57' });
    expect(moneyToRational(m).eq(q('1234.57'))).toBe(true);
    expect(moneyFromCentavos(-5n).amount).toBe('-0.05');
  });

  it('refuses amounts beyond safe integers', () => {
    expect(() => moneyFromCentavos(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
  });
});
