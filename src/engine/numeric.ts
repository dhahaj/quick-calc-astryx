/**
 * Plain numbers with Python semantics.
 *
 * QuickCalc distinguishes whole numbers that are exact (Python `int`) from floating point
 * values (Python `float`): `6 / 3` is the exact 2, `2^64` prints every digit, and `7 / 2`
 * is 3.5. Here a `bigint` plays the part of `int` and a `number` the part of `float`.
 *
 * The decimal helpers work on the exact binary value of a double and round half-to-even,
 * which is what Python's `Decimal` formatting and `round()` do, so output matches digit for
 * digit.
 */

import { DomainError, OverflowError, ZeroDivisionError } from './errors';

export type Scalar = bigint | number;

export const isInt = (x: unknown): x is bigint => typeof x === 'bigint';
export const isFloat = (x: unknown): x is number => typeof x === 'number';
export const isScalar = (x: unknown): x is Scalar => typeof x === 'bigint' || typeof x === 'number';

/** float(x): raises OverflowError for an int too large for a double. */
export function toFloat(x: Scalar): number {
  if (typeof x === 'number') return x;
  const f = Number(x);
  if (!Number.isFinite(f)) throw new OverflowError('int too large to convert to float');
  return f;
}

export function isZero(x: Scalar): boolean {
  return typeof x === 'bigint' ? x === 0n : x === 0;
}

export function isNegative(x: Scalar): boolean {
  return typeof x === 'bigint' ? x < 0n : x < 0;
}

export function absScalar(x: Scalar): Scalar {
  if (typeof x === 'bigint') return x < 0n ? -x : x;
  return Math.abs(x);
}

export function neg(x: Scalar): Scalar {
  return typeof x === 'bigint' ? -x : -x;
}

export function bitLength(n: bigint): number {
  if (n < 0n) n = -n;
  return n === 0n ? 0 : n.toString(2).length;
}

/** Guard float results: a finite operation that overflows is an OverflowError, as in Python. */
function checkedFloat(result: number, ...inputs: number[]): number {
  if (!Number.isFinite(result) && inputs.every(Number.isFinite)) {
    if (Number.isNaN(result)) throw new DomainError('math domain error');
    throw new OverflowError('math range error');
  }
  return result;
}

export function add(a: Scalar, b: Scalar): Scalar {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a + b;
  return toFloat(a) + toFloat(b);
}

export function sub(a: Scalar, b: Scalar): Scalar {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a - b;
  return toFloat(a) - toFloat(b);
}

export function mul(a: Scalar, b: Scalar): Scalar {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a * b;
  return toFloat(a) * toFloat(b);
}

/** Python true division `a / b` (always a float). */
export function trueDiv(a: Scalar, b: Scalar): number {
  if (isZero(b)) throw new ZeroDivisionError('division by zero');
  if (typeof a === 'bigint' && typeof b === 'bigint') return intTrueDiv(a, b);
  return toFloat(a) / toFloat(b);
}

/** Correctly scaled int / int, even when both are far beyond the double range. */
function intTrueDiv(a: bigint, b: bigint): number {
  const fa = Number(a);
  const fb = Number(b);
  const safe = 2 ** 53;
  if (Math.abs(fa) <= safe && Math.abs(fb) <= safe) return fa / fb;
  const negative = a < 0n !== b < 0n;
  const x = a < 0n ? -a : a;
  const y = b < 0n ? -b : b;
  const shift = bitLength(y) - bitLength(x) + 64;
  const q = shift >= 0 ? (x << BigInt(shift)) / y : x / (y << BigInt(-shift));
  let result = Number(q);
  // Apply 2^-shift in steps so the intermediate never overflows or underflows early.
  let s = -shift;
  while (s > 1000) {
    result *= 2 ** 1000;
    s -= 1000;
  }
  while (s < -1000) {
    result *= 2 ** -1000;
    s += 1000;
  }
  result *= 2 ** s;
  if (!Number.isFinite(result)) throw new OverflowError('integer division result too large for a float');
  return negative ? -result : result;
}

/** Python floor division for ints. */
export function floorDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new ZeroDivisionError('integer division by zero');
  const q = a / b;
  return (a % b !== 0n && a < 0n !== b < 0n) ? q - 1n : q;
}

/** Python `a % b`: the result takes the sign of the divisor. */
export function mod(a: Scalar, b: Scalar): Scalar {
  if (isZero(b)) throw new ZeroDivisionError('modulo by zero');
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    const r = a % b;
    return r !== 0n && r < 0n !== b < 0n ? r + b : r;
  }
  return floatMod(toFloat(a), toFloat(b));
}

export function floatMod(a: number, b: number): number {
  if (b === 0) throw new ZeroDivisionError('float modulo');
  let r = a % b;
  if (r !== 0 && r < 0 !== b < 0) r += b;
  return r;
}

export function compare(a: Scalar, b: Scalar): number {
  // Mixed bigint / number comparisons are exact in JavaScript.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function pow(base: number, exp: number): number {
  return checkedFloat(base ** exp, base, exp);
}

/** Integer square root (floor). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new DomainError('isqrt() argument must be nonnegative');
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  if (x === 0n) x = 1n;
  // Newton iterations from a float estimate; converges in a few steps.
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) {
      if (x * x > n) {
        x -= 1n;
        continue;
      }
      while ((x + 1n) * (x + 1n) <= n) x += 1n;
      return x;
    }
    x = y;
  }
}

/** Natural log that also copes with ints beyond the double range. */
export function lnScalar(x: Scalar): number {
  if (typeof x === 'bigint') {
    const f = Number(x);
    if (Number.isFinite(f)) return Math.log(f);
    const digits = x.toString();
    const lead = Number(`${digits.slice(0, 17)}e-16`);
    return Math.log(lead) + (digits.length - 1) * Math.LN10;
  }
  return Math.log(x);
}

/** int(x) for a finite float. */
export function floatToInt(x: number): bigint {
  if (Number.isNaN(x)) throw new DomainError('cannot convert float NaN to integer');
  if (!Number.isFinite(x)) throw new OverflowError('cannot convert float infinity to integer');
  return BigInt(Math.trunc(x));
}

// ------------------------------------------------------------------ exact decimals

/** |x| = digits × 10^exp exactly; digits has no leading zeros ('0' for zero). */
export interface ExactDecimal {
  negative: boolean;
  digits: string;
  exp: number;
}

const f64 = new DataView(new ArrayBuffer(8));

export function exactDecimal(x: Scalar): ExactDecimal {
  if (typeof x === 'bigint') {
    const negative = x < 0n;
    return normalize({ negative, digits: (negative ? -x : x).toString(), exp: 0 });
  }
  const negative = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  if (a === 0) return { negative, digits: '0', exp: 0 };
  f64.setFloat64(0, a);
  const hi = f64.getUint32(0);
  const lo = f64.getUint32(4);
  const expField = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e2: number;
  if (expField === 0) {
    e2 = -1074;
  } else {
    mantissa |= 1n << 52n;
    e2 = expField - 1075;
  }
  while ((mantissa & 1n) === 0n && e2 < 0) {
    mantissa >>= 1n;
    e2 += 1;
  }
  if (e2 >= 0) return normalize({ negative, digits: (mantissa << BigInt(e2)).toString(), exp: 0 });
  return normalize({ negative, digits: (mantissa * 5n ** BigInt(-e2)).toString(), exp: e2 });
}

function normalize(d: ExactDecimal): ExactDecimal {
  if (d.digits === '0') return d;
  let end = d.digits.length;
  while (end > 1 && d.digits[end - 1] === '0') end -= 1;
  return { negative: d.negative, digits: d.digits.slice(0, end), exp: d.exp + (d.digits.length - end) };
}

/**
 * Keep the first `keep` digits of `digits`, rounding half to even on what is dropped.
 * Returns the kept digits (padded with zeros) and whether rounding carried into a new
 * leading digit, in which case `digits` has `keep + 1` characters.
 */
function roundDigits(digits: string, keep: number): { digits: string; carry: boolean } {
  if (keep < 0) return { digits: '', carry: false };
  if (digits.length <= keep) return { digits: digits.padEnd(keep, '0'), carry: false };
  const head = digits.slice(0, keep);
  const next = digits.charCodeAt(keep) - 48;
  const rest = digits.slice(keep + 1);
  const lastOdd = head.length > 0 && (head.charCodeAt(head.length - 1) - 48) % 2 === 1;
  const up = next > 5 || (next === 5 && (/[1-9]/.test(rest) || lastOdd));
  if (!up) return { digits: head, carry: false };
  const bumped = (BigInt(head || '0') + 1n).toString();
  if (head.length === 0) return { digits: bumped, carry: true };
  return bumped.length > head.length ? { digits: bumped, carry: true } : { digits: bumped.padStart(head.length, '0'), carry: false };
}

/**
 * Round |x| to `sig` significant figures (1..17). Returns the digit string and the power of
 * ten of its first digit, so 0.000702 at 4 figures gives ['7020', -4]. Matches
 * `f"{Decimal(abs(x)):.{sig - 1}e}"` in the original.
 */
export function significantDigits(x: Scalar, sig: number): [string, number] {
  sig = Math.max(1, Math.min(sig, 17));
  const d = exactDecimal(x);
  if (d.digits === '0') return ['0'.repeat(sig), 0];
  let first = d.exp + d.digits.length - 1;
  const r = roundDigits(d.digits, sig);
  let digits = r.digits;
  if (r.carry) {
    digits = digits.slice(0, sig);
    first += 1;
  }
  return [digits, first];
}

/** `f"{Decimal(x):.{decimals}f}"`: exact value, half-even, keeps a '-' on negative values. */
export function fixedString(x: Scalar, decimals: number): string {
  const d = exactDecimal(x);
  const sign = d.negative ? '-' : '';
  let n: string;
  const shift = d.exp + decimals; // |x| × 10^decimals = digits × 10^shift
  if (d.digits === '0') {
    n = '0';
  } else if (shift >= 0) {
    n = d.digits + '0'.repeat(shift);
  } else {
    const keep = d.digits.length + shift;
    if (keep < 0) {
      n = '0';
    } else {
      const r = roundDigits(d.digits, keep);
      n = r.digits === '' ? '0' : r.digits;
    }
  }
  n = n.replace(/^0+(?=\d)/, '');
  if (decimals === 0) return sign + n;
  n = n.padStart(decimals + 1, '0');
  return `${sign}${n.slice(0, n.length - decimals)}.${n.slice(n.length - decimals)}`;
}

/** Python `round(x, ndigits)` for a float: exact half-even rounding, back to a float. */
export function roundFloat(x: number, ndigits: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  if (ndigits > 400) return x;
  if (ndigits < -400) return x < 0 ? -0 : 0;
  const text = fixedString(x * 1, Math.max(ndigits, 0));
  if (ndigits >= 0) return Number(text);
  // Negative ndigits: round to tens, hundreds, ...
  const d = exactDecimal(x);
  const keep = d.digits.length + d.exp + ndigits;
  if (keep < 0) return d.negative ? -0 : 0;
  const r = roundDigits(d.digits, keep);
  const digits = r.digits === '' ? '0' : r.digits;
  return Number(`${d.negative ? '-' : ''}${digits}e${-ndigits}`);
}

/** Python `round(n, ndigits)` for an int with ndigits <= 0 (half to even). */
export function roundInt(n: bigint, ndigits: number): bigint {
  if (ndigits >= 0) return n;
  const m = 10n ** BigInt(-ndigits);
  let q = floorDiv(n, m);
  const r = n - q * m;
  if (2n * r > m || (2n * r === m && q % 2n !== 0n)) q += 1n;
  return q * m;
}

/** Shortest round-trip decimal of x scaled by 10^shift, as a float (decimal, not binary, scaling). */
export function scaleDecimal(x: number, shift: number): number {
  const [mantissa, exponent] = x.toExponential().split('e');
  return Number(`${mantissa}e${Number(exponent) + shift}`);
}
