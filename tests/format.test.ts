/** Output formatting: auto / engineering / scientific / fixed, sig figs, separators, bases. */

import { describe, expect, test } from 'vitest';

import { type FormatSettings, formatNumber, formatSettings } from '../src/engine';
import { calc } from './helpers';

const fmt = (x: number | bigint, overrides: Partial<FormatSettings> = {}) => formatNumber(x, formatSettings(overrides));

describe('auto', () => {
  test.each<[number | bigint, string]>([
    [0n, '0'],
    [0.0, '0'],
    [-0.0, '0'],
    [14n, '14'],
    [-14n, '-14'],
    [2.0, '2'],
    [0.5, '0.5'],
    [-0.5, '-0.5'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.3333333333'],
    [2 / 3, '0.6666666667'],
    [3197.278911564626, '3197.278912'],
    [0.0001, '0.0001'],
    [0.00012345, '0.00012345'],
    [0.00001234, '12.34e-6'],
    [0.0007021276595744681, '0.0007021276596'],
    [123456789.123, '123456789.1'],
    [999999999999.0, '999999999999'],
    [123456789012345.0, '123456789012345'],
    [1e15, '1e15'],
    [1.5e20, '150e18'],
    [1e-9, '1e-9'],
    [-2.5e-7, '-250e-9'],
    [6.02214076e23, '602.214076e21'],
    [2n ** 64n, '18446744073709551616'],
    [10n ** 30n, '1e30'],
    [0.9999999999999999, '1'],
    [999.99999999999, '1000'],
  ])('%s', (value, expected) => expect(fmt(value)).toBe(expected));
});

describe('engineering', () => {
  test.each<[number | bigint, number, string]>([
    [0.0007021276595744681, 4, '702.1 µ'],
    [3197.278911564626, 4, '3.197 k'],
    [4700n, 10, '4.7 k'],
    [265n, 10, '265'],
    [1n, 10, '1'],
    [0n, 10, '0'],
    [0.015, 10, '15 m'],
    [1e-9, 10, '1 n'],
    [3.3e-12, 10, '3.3 p'],
    [2.5e-15, 10, '2.5 f'],
    [2.2e6, 10, '2.2 M'],
    [1e9, 10, '1 G'],
    [1e12, 10, '1 T'],
    [1e15, 10, '1e15'], // beyond the prefix range: plain exponent
    [1e-18, 10, '1e-18'],
    [-0.0047, 10, '-4.7 m'],
    [999.96, 4, '1 k'], // rounding carries into the next prefix
    [12345n, 3, '12.3 k'],
  ])('%s at %i figures', (value, sig, expected) => expect(fmt(value, { mode: 'eng', sigFigs: sig })).toBe(expected));
});

describe('scientific', () => {
  test.each<[number | bigint, number, string]>([
    [0.0007021276595744681, 4, '7.021e-4'],
    [12345n, 3, '1.23e4'],
    [1n, 10, '1e0'],
    [0n, 10, '0'],
    [-1500n, 10, '-1.5e3'],
    [6.02214076e23, 10, '6.02214076e23'],
  ])('%s at %i figures', (value, sig, expected) => expect(fmt(value, { mode: 'sci', sigFigs: sig })).toBe(expected));
});

describe('fixed', () => {
  test.each<[number | bigint, number, string]>([
    [3.14159, 2, '3.14'],
    [2n, 2, '2.00'],
    [0.1 + 0.2, 4, '0.3000'],
    [2.675, 0, '3'],
    [-0.0001, 2, '0.00'],
    [1234.5, 1, '1234.5'],
    [0n, 3, '0.000'],
  ])('%s with %i decimals', (value, decimals, expected) =>
    expect(fmt(value, { mode: 'fixed', fixedDecimals: decimals })).toBe(expected));
});

describe('significant figures', () => {
  test.each<[number, number, string]>([
    [1 / 3, 3, '0.333'],
    [1 / 3, 15, '0.333333333333333'],
    [2 / 3, 1, '0.7'],
    [123.456, 4, '123.5'],
    [123456.789, 3, '123457'], // never rounds away integer digits
    [0.1 + 0.2, 17, '0.30000000000000004'],
  ])('%s at %i figures', (value, sig, expected) => expect(fmt(value, { sigFigs: sig })).toBe(expected));
});

describe('thousands separators', () => {
  test.each<[number | bigint, Partial<FormatSettings>, string]>([
    [1234567n, {}, '1,234,567'],
    [-1234567.891, {}, '-1,234,567.891'],
    [999n, {}, '999'],
    [1000n, {}, '1,000'],
    [0.000123, {}, '0.000123'],
    [1234567.5, { mode: 'fixed', fixedDecimals: 2 }, '1,234,567.50'],
    [2n ** 64n, {}, '18,446,744,073,709,551,616'],
  ])('%s', (value, overrides, expected) => expect(fmt(value, { thousandsSep: true, ...overrides })).toBe(expected));
});

test('integer bases alongside', () => {
  const c = calc();
  expect(c.ok('265').alt).toBeNull();
  c.fmt({ showIntBases: true });
  expect(c.ok('0xFF + 0b1010').alt).toBe('0x109  0b100001001');
  expect(c.ok('6 / 3').alt).toBe('0x2  0b10');
  expect(c.ok('-1').alt).toBe('-0x1  -0b1');
  expect(c.ok('1.5').alt).toBeNull();
  expect(c.ok('5 V').alt).toBeNull();
});

test('modes with units', () => {
  const c = calc();
  c.fmt({ mode: 'eng', sigFigs: 4 });
  expect(c.text('9 V / 4.7 kohm')).toBe('1.915 mA');
  expect(c.text('0.000702 A')).toBe('702 µA');
  expect(c.text('0.00001 mi')).toBe('10e-6 mi'); // no SI letters on non-SI units
  c.fmt({ mode: 'sci', sigFigs: 4 });
  expect(c.text('9 V / 4.7 kohm')).toBe('1.915e-3 A');
  c.fmt({ mode: 'fixed', fixedDecimals: 2 });
  expect(c.text('10 mil to mm')).toBe('0.25 mm');
  expect(c.text('1/3')).toBe('0.33');
});

test('reformat for clipboard', () => {
  const c = calc();
  c.fmt({ thousandsSep: true });
  const result = c.ok('1234 * 1000');
  expect(result.text).toBe('1,234,000');
  expect(c.engine.formatResult(result, formatSettings())).toBe('1234000');
});

test('unit symbols', () => {
  const c = calc();
  expect(c.text('1 kohm')).toBe('1 kΩ');
  expect(c.text('1 uF')).toBe('1 µF');
  expect(c.text('5 mil')).toBe('5 mil');
  expect(c.text('45 deg')).toBe('45°');
  expect(c.text('1 m/s^2')).toBe('1 m/s²');
  expect(c.text('1 degF')).toBe('1 °F');
  expect(c.text('1 GiB')).toBe('1 GiB');
});
