/**
 * Exact rational arithmetic on top of BigInt.
 *
 * Money is never handled with binary floating point in this library. Every
 * intermediate quantity (days, proportions, salaries) is an exact fraction
 * n/d, and rounding happens only where the documented rounding rules say so
 * (see `roundToCentavos`).
 *
 * Invariants: the denominator is always positive and gcd(|n|, d) === 1.
 */

const ZERO = 0n;
const ONE = 1n;

function abs(x: bigint): bigint {
  return x < ZERO ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== ZERO) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/** Values accepted wherever the public API takes a number. */
export type Decimalish = string | number | bigint | Rational;

const DECIMAL_RE = /^([+-])?(\d+)?(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

export class Rational {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static readonly ZERO = new Rational(ZERO, ONE);
  static readonly ONE = new Rational(ONE, ONE);

  /** Builds n/d and normalizes it. Throws on a zero denominator. */
  static of(n: bigint | number, d: bigint | number = ONE): Rational {
    let nn = typeof n === 'bigint' ? n : BigInt(n);
    let dd = typeof d === 'bigint' ? d : BigInt(d);
    if (dd === ZERO) throw new RangeError('Rational: zero denominator');
    if (dd < ZERO) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(nn, dd);
    return g === ONE ? new Rational(nn, dd) : new Rational(nn / g, dd / g);
  }

  /**
   * Parses a decimal value exactly. Accepts plain decimals ("1234.56"),
   * scientific notation ("1.5e3") and finite JS numbers (converted through
   * their shortest round-trip string, so 0.1 parses as exactly 1/10).
   */
  static parse(value: Decimalish): Rational {
    if (value instanceof Rational) return value;
    if (typeof value === 'bigint') return Rational.of(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new RangeError(`Rational: not a finite number: ${value}`);
      return Rational.parse(String(value));
    }
    const s = value.trim().replace(/_/g, '');
    const m = DECIMAL_RE.exec(s);
    if (!m || (m[2] === undefined && m[3] === undefined)) {
      throw new RangeError(`Rational: not a decimal number: "${value}"`);
    }
    const sign = m[1] === '-' ? -ONE : ONE;
    const intPart = m[2] ?? '0';
    const fracPart = m[3] ?? '';
    const exp = m[4] === undefined ? 0 : Number.parseInt(m[4], 10);
    let n = BigInt(intPart + fracPart) * sign;
    let d = 10n ** BigInt(fracPart.length);
    if (exp > 0) n *= 10n ** BigInt(exp);
    if (exp < 0) d *= 10n ** BigInt(-exp);
    return Rational.of(n, d);
  }

  add(o: Rational): Rational {
    return Rational.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(o: Rational): Rational {
    return Rational.of(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(o: Rational): Rational {
    return Rational.of(this.n * o.n, this.d * o.d);
  }

  div(o: Rational): Rational {
    if (o.n === ZERO) throw new RangeError('Rational: division by zero');
    return Rational.of(this.n * o.d, this.d * o.n);
  }

  neg(): Rational {
    return new Rational(-this.n, this.d);
  }

  /** -1, 0 or 1. */
  cmp(o: Rational): -1 | 0 | 1 {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }

  eq(o: Rational): boolean {
    return this.n === o.n && this.d === o.d;
  }

  lt(o: Rational): boolean {
    return this.cmp(o) < 0;
  }

  lte(o: Rational): boolean {
    return this.cmp(o) <= 0;
  }

  gt(o: Rational): boolean {
    return this.cmp(o) > 0;
  }

  gte(o: Rational): boolean {
    return this.cmp(o) >= 0;
  }

  isZero(): boolean {
    return this.n === ZERO;
  }

  isNegative(): boolean {
    return this.n < ZERO;
  }

  isInteger(): boolean {
    return this.d === ONE;
  }

  static min(a: Rational, b: Rational): Rational {
    return a.lte(b) ? a : b;
  }

  static max(a: Rational, b: Rational): Rational {
    return a.gte(b) ? a : b;
  }

  static sum(values: readonly Rational[]): Rational {
    return values.reduce((acc, v) => acc.add(v), Rational.ZERO);
  }

  /** Largest integer <= this. */
  floor(): bigint {
    const q = this.n / this.d;
    return this.n < ZERO && q * this.d !== this.n ? q - ONE : q;
  }

  /**
   * Rounds to `digits` decimal places, half away from zero (the usual
   * "redondeo comercial": 0.005 -> 0.01), and returns the scaled integer.
   * Example: 1234.565 with digits=2 returns 123457n.
   */
  roundScaled(digits: number): bigint {
    const scale = 10n ** BigInt(digits);
    const scaled = this.n * scale;
    const q = abs(scaled) / this.d;
    const r = abs(scaled) % this.d;
    const rounded = r * 2n >= this.d ? q + ONE : q;
    return this.n < ZERO ? -rounded : rounded;
  }

  /** Rounds half away from zero to whole centavos (2 decimals). */
  roundToCentavos(): bigint {
    return this.roundScaled(2);
  }

  /** The value rounded to `digits` decimals, as an exact Rational. */
  round(digits: number): Rational {
    return Rational.of(this.roundScaled(digits), 10n ** BigInt(digits));
  }

  /** Decimal string rounded half away from zero, e.g. "7.3973". */
  toFixed(digits: number): string {
    const scaled = this.roundScaled(digits);
    const negative = scaled < ZERO;
    const s = abs(scaled).toString().padStart(digits + 1, '0');
    const body = digits === 0 ? s : `${s.slice(0, -digits)}.${s.slice(-digits)}`;
    return negative ? `-${body}` : body;
  }

  /**
   * Shortest readable decimal: exact when the expansion terminates within
   * `maxDigits`, otherwise rounded to `maxDigits`. Trailing zeros removed.
   */
  toDecimalString(maxDigits = 4): string {
    const fixed = this.toFixed(maxDigits);
    return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  }

  /** "n/d" or "n" for integers. */
  toString(): string {
    return this.d === ONE ? this.n.toString() : `${this.n}/${this.d}`;
  }

  /** Approximate JS number, for charts and property tests only. */
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
}

/** Shorthand for `Rational.parse`. */
export function q(value: Decimalish): Rational {
  return Rational.parse(value);
}
