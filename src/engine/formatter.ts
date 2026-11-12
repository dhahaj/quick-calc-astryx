/** Turns values into display strings according to the user's format settings. */

import { type Scalar, fixedString, isInt, isZero, significantDigits } from './numeric';
import { Quantity, type Value } from './quantity';
import type { Units } from './units';

export const MODES = ['auto', 'eng', 'sci', 'fixed'] as const;
export type FormatMode = (typeof MODES)[number];

const SI_LETTERS: ReadonlyMap<number, string> = new Map([
  [-15, 'f'], [-12, 'p'], [-9, 'n'], [-6, 'µ'], [-3, 'm'], [0, ''],
  [3, 'k'], [6, 'M'], [9, 'G'], [12, 'T'],
]);

// Auto mode shows plain decimals inside this range and engineering notation outside it.
const AUTO_MIN = 1e-4;
const AUTO_MAX = 1e12;
const EXACT_INT_DIGITS = 21;

export interface FormatSettings {
  mode: FormatMode;
  sigFigs: number;
  fixedDecimals: number;
  thousandsSep: boolean;
  showIntBases: boolean;
}

export function formatSettings(overrides: Partial<FormatSettings> = {}): FormatSettings {
  return { mode: 'auto', sigFigs: 10, fixedDecimals: 4, thousandsSep: false, showIntBases: false, ...overrides };
}

/** Put a decimal point after `point` digits and trim trailing zeros. */
function place(digits: string, point: number): string {
  let text: string;
  if (point <= 0) {
    text = `0.${'0'.repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    return digits + '0'.repeat(point - digits.length);
  } else {
    text = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/** Insert thousands separators into the integer part of a plain decimal string. */
function group(text: string): string {
  const sign = text.startsWith('-') ? '-' : '';
  const body = text.slice(sign.length);
  const dot = body.indexOf('.');
  const whole = dot < 0 ? body : body.slice(0, dot);
  const rest = dot < 0 ? '' : body.slice(dot);
  if (!/^[0-9]+$/.test(whole)) return text;
  const trimmed = whole.replace(/^0+(?=\d)/, '');
  return sign + trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
}

/** Format a bare number. `siLetters` allows 'k', 'µ' ... in engineering mode. */
export function formatNumber(x: Scalar, s: FormatSettings, siLetters = true): string {
  if (typeof x === 'number' && !Number.isFinite(x)) {
    return Number.isNaN(x) ? 'undefined' : x < 0 ? '-∞' : '∞';
  }
  const negative = typeof x === 'bigint' ? x < 0n : x < 0;
  const sign = negative ? '-' : '';
  const grouped = s.thousandsSep ? group : (t: string) => t;

  if (s.mode === 'fixed') {
    let text = fixedString(x, Math.max(0, s.fixedDecimals));
    if (text.replace(/^[-0.]+/, '') === '') text = text.replace(/^-+/, '');
    return grouped(text);
  }

  if (isZero(x)) return '0';

  if (s.mode === 'sci') {
    const [digits, exp] = significantDigits(x, s.sigFigs);
    return `${sign}${place(digits, 1)}e${exp}`;
  }

  if (s.mode === 'eng') return sign + engineering(x, s.sigFigs, siLetters);

  // auto
  if (isInt(x)) {
    if ((negative ? -x : x).toString().length <= EXACT_INT_DIGITS) return grouped(x.toString());
    return sign + engineering(x, s.sigFigs, false);
  }
  const magnitude = Math.abs(x);
  if (Number.isInteger(x) && magnitude < 1e15) return grouped(BigInt(x).toString());
  if (magnitude >= AUTO_MIN && magnitude < AUTO_MAX) {
    const wholeDigits = magnitude >= 1 ? BigInt(Math.trunc(magnitude)).toString().length : 0;
    const [digits, exp] = significantDigits(x, Math.max(s.sigFigs, wholeDigits));
    return grouped(sign + place(digits, exp + 1));
  }
  return sign + engineering(x, s.sigFigs, false);
}

function engineering(x: Scalar, sig: number, siLetters: boolean): string {
  const [digits, exp] = significantDigits(x, sig);
  const exp3 = 3 * Math.floor(exp / 3);
  const mantissa = place(digits, exp - exp3 + 1);
  if (exp3 === 0) return mantissa;
  const letter = SI_LETTERS.get(exp3);
  if (siLetters && letter !== undefined) return `${mantissa} ${letter}`;
  return `${mantissa}e${exp3}`;
}

export function formatBase(n: bigint, base: string): string {
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  if (base === 'hex') return `${sign}0x${abs.toString(16).toUpperCase()}`;
  if (base === 'bin') return `${sign}0b${abs.toString(2)}`;
  if (base === 'oct') return `${sign}0o${abs.toString(8)}`;
  return `${sign}${abs}`;
}

function asInt(value: Value): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) < 2 ** 53) return BigInt(value);
  return null;
}

/**
 * Format a result. Returns [main text, optional secondary text].
 *
 * `locked` means the user asked for this exact unit, so no prefix is substituted.
 * `base` is 'hex' / 'bin' / 'oct' / 'dec' for an explicit base conversion.
 */
export function formatValue(
  value: Value,
  s: FormatSettings,
  units: Units,
  locked = false,
  base: string | null = null,
): [string, string | null] {
  if (base !== null) {
    const n = value as bigint;
    return [formatBase(n, base), base === 'dec' ? null : n.toString()];
  }

  if (value instanceof Quantity) {
    let q = value;
    let prefixed = false;
    if (!locked && (s.mode === 'auto' || s.mode === 'eng')) {
      q = units.reprefix(q, s.sigFigs);
      prefixed = units.prefixInfo(q.units) !== null;
    }
    let number: string;
    if (prefixed && s.mode === 'eng') {
      // The unit prefix already carries the exponent.
      number = formatNumber(q.magnitude, { ...s, mode: 'auto', showIntBases: false });
    } else {
      number = formatNumber(q.magnitude, s, false);
    }
    const symbol = units.symbol(q.units);
    if (!symbol) return [number, null];
    return [symbol === '°' ? number + symbol : `${number} ${symbol}`, null];
  }

  const text = formatNumber(value as Scalar, s);
  let alt: string | null = null;
  if (s.showIntBases) {
    const n = asInt(value);
    if (n !== null && (n < 0n ? -n : n) < 2n ** 64n) alt = `${formatBase(n, 'hex')}  ${formatBase(n, 'bin')}`;
  }
  return [text, alt];
}
