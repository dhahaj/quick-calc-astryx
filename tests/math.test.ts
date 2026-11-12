/** Grammar and arithmetic: precedence, implicit multiplication, percent, functions, bitwise. */

import { describe, expect, test } from 'vitest';

import { approx, calc } from './helpers';

describe('arithmetic', () => {
  test.each<[string, number]>([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['2 ^ 3 ^ 2', 512],
    ['2 ** 10', 1024],
    ['-2 ^ 2', -4],
    ['(-2) ^ 2', 4],
    ['2 ^ -1', 0.5],
    ['--3', 3],
    ['(+5)', 5],
    ['6 / 3', 2],
    ['7 / 2', 3.5],
    ['1 - -1', 2],
    ['2 * -3', -6],
    ['.5 + .5', 1],
    ['5.', 5],
    ['1e3', 1000],
    ['1E3', 1000],
    ['1.5e-3', 0.0015],
    ['10 mod 3', 1],
    ['10 % 3', 1],
    ['2 × 3', 6],
    ['6 ÷ 3', 2],
    ['5 − 2', 3],
    ['3²', 9],
    ['2³', 8],
  ])('%s', (text, expected) => approx(calc().num(text), expected));
});

describe('implicit multiplication', () => {
  test.each<[string, number]>([
    ['2(3+4)', 14],
    ['(1+2)(3+4)', 21],
    ['2pi', 2 * Math.PI],
    ['2 pi', 2 * Math.PI],
    ['2π', 2 * Math.PI],
    ['3sqrt(2)', 3 * Math.sqrt(2)],
    ['(2)3', 6],
    ['2(3)(4)', 24],
    ['2pi^2', 2 * Math.PI ** 2], // power binds tighter than adjacency
    ['1/2pi', 1 / (2 * Math.PI)], // adjacency binds tighter than division
    ['-2pi', -2 * Math.PI],
    ['2e', 2 * Math.E],
    ['2 e', 2 * Math.E],
  ])('%s', (text, expected) => approx(calc().num(text), expected));

  test('with variables', () => {
    const c = calc();
    c.ok('x = 3');
    expect(c.num('2x')).toBe(6n);
    expect(c.num('x x')).toBe(9n);
    expect(c.num('2x^2')).toBe(18n);
    expect(c.num('x(x+1)')).toBe(12n);
  });

  test('two numbers side by side is an error', () => {
    expect(calc().err('2 3')).toContain('operator');
  });
});

describe('percent', () => {
  test.each<[string, number]>([
    ['80 * 15%', 12],
    ['200 + 10%', 220],
    ['200 - 10%', 180],
    ['15%', 0.15],
    ['50% * 50%', 0.25],
    ['100 * (5 + 5)%', 10],
    ['200 + 10% + 10%', 242], // each percent applies to the running total
    ['10% + 5', 5.1], // percent on the left is just 0.1
    ['1000 * 5% * 2', 100],
    ['200 / 50%', 400],
  ])('%s', (text, expected) => approx(calc().num(text), expected));

  test('keeps integers exact', () => {
    const c = calc();
    expect(c.ok('200 + 10%').value).toBe(220n);
    expect(typeof c.ok('200 + 10%').value).toBe('bigint');
  });
});

describe('functions in radians', () => {
  test.each<[string, number]>([
    ['sqrt(16)', 4],
    ['sqrt(2)', Math.SQRT2],
    ['√16', 4],
    ['√(9+16)', 5],
    ['√16 + 9', 13],
    ['cbrt(27)', 3],
    ['cbrt(-8)', -2],
    ['abs(-3.5)', 3.5],
    ['round(2.5)', 2],
    ['round(3.14159, 2)', 3.14],
    ['round(1234, -2)', 1200],
    ['floor(2.7)', 2],
    ['floor(-2.7)', -3],
    ['ceil(2.1)', 3],
    ['log(1000)', 3],
    ['log(8, 2)', 3],
    ['ln(e)', 1],
    ['ln(e^2)', 2],
    ['log2(1024)', 10],
    ['exp(0)', 1],
    ['exp(1)', Math.E],
    ['sin(0)', 0],
    ['sin(pi/2)', 1],
    ['sin(pi)', 0],
    ['cos(0)', 1],
    ['cos(pi/2)', 0],
    ['tan(pi/4)', 1],
    ['asin(1)', Math.PI / 2],
    ['acos(1)', 0],
    ['atan(1)', Math.PI / 4],
    ['atan2(1, 1)', Math.PI / 4],
    ['atan2(1, -1)', (3 * Math.PI) / 4],
    ['min(3, 1, 2)', 1],
    ['max(3, 1, 2)', 3],
    ['max(2)', 2],
    ['min(1, 2) + max(3, 4)', 5],
  ])('%s', (text, expected) => approx(calc().num(text), expected, { abs: 1e-12 }));
});

describe('functions in degrees', () => {
  test.each<[string, number]>([
    ['sin(30)', 0.5],
    ['cos(60)', 0.5],
    ['tan(45)', 1],
    ['sin(180)', 0],
    ['asin(0.5)', 30],
    ['acos(0.5)', 60],
    ['atan(1)', 45],
    ['atan2(1, 1)', 45],
    ['sin(pi rad)', 0], // an explicit unit beats the degrees setting
    ['sin(30 deg)', 0.5],
  ])('%s', (text, expected) => {
    const c = calc();
    c.engine.degrees = true;
    approx(c.num(text), expected, { abs: 1e-9 });
  });

  test('explicit degrees in radian mode', () => {
    const c = calc();
    approx(c.num('sin(30 deg)'), 0.5);
    approx(c.num('sin(30°)'), 0.5);
    approx(c.num('cos(60 deg)'), 0.5);
  });
});

test('integer results stay integers', () => {
  const c = calc();
  for (const text of ['sqrt(16)', '6/3', '2^10', 'abs(-4)', 'floor(2.5)', 'round(2.6)', 'cbrt(27)']) {
    expect(typeof c.ok(text).value, text).toBe('bigint');
  }
});

describe('function errors', () => {
  test.each<[string, string]>([
    ['sqrt(-1)', 'negative'],
    ['log(0)', 'positive'],
    ['ln(-1)', 'positive'],
    ['asin(2)', 'between'],
    ['acos(-2)', 'between'],
    ['tan(pi/2)', 'undefined'],
    ['sqrt()', '1 argument'],
    ['sqrt(1, 2)', '1 argument'],
    ['atan2(1)', '2 arguments'],
    ['min()', 'at least 1'],
    ['(-8)^(1/3)', 'real'],
    ['0^-1', 'zero'],
    ['5 mod 0', 'zero'],
    ['sqrt', 'parentheses'],
  ])('%s', (text, fragment) => expect(calc().err(text)).toContain(fragment));
});

describe('bitwise', () => {
  test.each<[string, number]>([
    ['0xF0 & 0x3C', 0x30],
    ['0xF0 | 0x0F', 0xff],
    ['5 xor 3', 6],
    ['1 << 4', 16],
    ['256 >> 4', 16],
    ['~0', -1],
    ['~5 & 0xF', 10],
    ['1 << 4 | 1', 17],
    ['1 | 2 & 3', 3], // & binds tighter than |
    ['1 + 1 << 2', 8], // arithmetic binds tighter than shifts
    ['6 & 3 xor 1', 3],
    ['0xFF & ~0x0F', 0xf0],
    ['2^4 & 0xFF', 16],
  ])('%s', (text, expected) => expect(calc().num(text)).toBe(BigInt(expected)));

  test('needs integers', () => {
    const c = calc();
    expect(c.err('1.5 & 3')).toContain('whole numbers');
    expect(c.err('3 << 0.5')).toContain('whole numbers');
    expect(c.err('1 << -1')).toContain('negative');
  });
});

describe('parallel', () => {
  test.each<[string, number]>([
    ['10 || 10', 5],
    ['4.7k || 10k', 3197.278911564626],
    ['1k || 1k || 1k', 1000 / 3],
    ['2 * 10 || 10', 10], // || binds tighter than *
    ['10 + 10 || 10', 15],
    ['100 / 10 || 10', 20],
    ['0 || 5', 0],
  ])('%s', (text, expected) => approx(calc().num(text), expected));

  test('errors', () => {
    const c = calc();
    expect(c.err('5 || -5')).toBe('Division by zero');
    expect(c.err('10 ohm || 10')).toContain('parallel');
  });
});

describe('SI suffixes', () => {
  test.each<[string, number]>([
    ['1f', 1e-15],
    ['1p', 1e-12],
    ['1n', 1e-9],
    ['1u', 1e-6],
    ['1µ', 1e-6],
    ['1m', 1e-3],
    ['1k', 1e3],
    ['1M', 1e6],
    ['1G', 1e9],
    ['1T', 1e12],
    ['4.7k', 4700],
    ['0.1u', 1e-7],
    ['1.5k + 500', 2000],
    ['2k * 3k', 6e6],
    ['3.3 / 4.7k', 3.3 / 4700],
    ['1 / 2k', 1 / 2000],
    ['2k^2', 4e6],
    ['10k(2)', 20000],
    ['1e3k', 1e6],
  ])('%s', (text, expected) => approx(calc().num(text), expected, { rel: 1e-12 }));

  test('precision', () => {
    // Scaled as decimal text, not by float multiplication, so no stray digits appear.
    const c = calc();
    expect(c.ok('4.7k').value).toBe(4700);
    expect(c.ok('2.2u').value).toBe(2.2e-6);
    expect(c.ok('100n').value).toBe(1e-7);
    expect(typeof c.ok('10M').value).toBe('bigint');
  });

  test('suffix needs no space', () => {
    // With a space, k is no longer a suffix (and is not a unit either).
    expect(calc().err('4.7 k')).toContain("Unknown name 'k'");
  });
});

test('big numbers do not hang', () => {
  const c = calc();
  expect(c.err('9^9^9')).toBe('Result is too large');
  expect(c.err('1 << 100000')).toBe('Result is too large');
  expect(c.num('2^64')).toBe(2n ** 64n);
  expect(c.text('2^64')).toBe('18446744073709551616');
  expect(c.err('10.0^400')).toBe('Result is too large');
});

test('cancellation noise', () => {
  const c = calc();
  expect(c.num('0.3 - 0.1 - 0.2')).toBe(0);
  expect(c.num('1 - 0.9 - 0.1')).toBe(0);
});

describe('bad syntax is an error, not a crash', () => {
  test.each(['', '   ', '1 +', '(', '2 *', 'sqrt(', '1 + * 2', ')', '2 ) 3', '1 $ 2', 'a b =', '= 5', '5 = 5', '1,2', 'to'])(
    '%j',
    (text) => {
      const result = calc().run(text);
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    },
  );
});

test('missing close paren is forgiven', () => {
  const c = calc();
  expect(c.num('2(3+4')).toBe(14n);
  expect(c.num('sqrt(16')).toBe(4n);
});

test('deep nesting does not crash', () => {
  const c = calc();
  const result = c.run(`${'('.repeat(5000)}1${')'.repeat(5000)}`);
  expect(result.ok).toBe(false);
  expect(c.num('1+1')).toBe(2n);
});

test('garbage never throws', () => {
  const c = calc();
  for (const text of ['🙂', '1 ++ 2', '((((', '0x', '1e', '1..2', '@#!', 'in', 'to to', 'a = b = 1', '\x00', '5 5 5', '%', '~', '||']) {
    c.run(text); // must simply return
  }
});
