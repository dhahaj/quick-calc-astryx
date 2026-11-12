/** Session behaviour: ans, variables, live preview, error handling, and engine/UI separation. */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, test } from 'vitest';

import { Engine } from '../src/engine';
import { approx, calc } from './helpers';

test('ans', () => {
  const c = calc();
  expect(c.err('ans')).toContain('No previous result');
  c.ok('6 * 7');
  expect(c.num('ans')).toBe(42n);
  expect(c.num('ans + 1')).toBe(43n);
  expect(c.num('2ans')).toBe(86n);
  approx(c.num('sqrt(ans)'), 86 ** 0.5);
});

test('ans keeps units', () => {
  const c = calc();
  c.ok('9 V / 4.7 kohm');
  expect(c.text('ans * 1 kohm').endsWith(' V')).toBe(true);
  expect(c.text('ans to mV')).toBe('1914.893617 mV');
});

test('errors do not change ans', () => {
  const c = calc();
  c.ok('5');
  c.err('1/0');
  c.err('1 +');
  expect(c.num('ans')).toBe(5n);
});

describe('leading operator', () => {
  test.each<[string, number]>([
    ['*2', 20],
    ['/4', 2.5],
    ['+5', 15],
    ['^2', 100],
    ['**2', 100],
    ['|| 10', 5],
    ['& 2', 2],
    ['| 1', 11],
    ['<< 1', 20],
    ['>> 1', 5],
    ['xor 3', 9],
    ['mod 3', 1],
  ])('%s', (line, expected) => {
    const c = calc();
    c.ok('10');
    approx(c.num(line), expected);
  });
});

test('leading minus is a negative number', () => {
  const c = calc();
  c.ok('10');
  expect(c.num('-5')).toBe(-5n);
  expect(c.num('-5 + 3')).toBe(-2n);
});

test('leading operator without ans', () => {
  expect(calc().err('*2')).toContain('No previous result');
});

test('variables', () => {
  const c = calc();
  const result = c.ok('r1 = 4.7k');
  expect(result.name).toBe('r1');
  expect(result.value).toBe(4700);
  expect(c.num('r1')).toBe(4700);
  expect(c.num('r1 * 2')).toBe(9400);
  c.ok('r2 = 10k');
  approx(c.num('r1 || r2'), 3197.2789, { rel: 1e-6 });
  approx(c.num('vout = 3.3 * r2 / (r1 + r2)'), 2.2449, { rel: 1e-4 });
  approx(c.num('vout'), 2.2449, { rel: 1e-4 });
});

test('variables with units', () => {
  const c = calc();
  c.ok('v = 3.3 V');
  c.ok('r = 330 ohm');
  expect(c.text('v / r')).toBe('10 mA');
  c.ok('w = 5 in to mm');
  expect(c.text('w')).toBe('127 mm');
});

test('variable reassignment and ans', () => {
  const c = calc();
  c.ok('x = 1');
  c.ok('x = x + 1');
  expect(c.num('x')).toBe(2n);
  c.ok('y = 10');
  expect(c.num('ans')).toBe(10n);
});

test.each(['pi', 'e', 'ans', 'sqrt', 'sin', 'in', 'hex', 'max'])('reserved name %s', (name) => {
  expect(calc().err(`${name} = 5`)).toContain('reserved');
});

test('keywords cannot be assigned', () => {
  const c = calc();
  for (const name of ['to', 'xor', 'mod']) expect(c.run(`${name} = 5`).ok).toBe(false);
});

test('unknown symbol', () => {
  const c = calc();
  expect(c.err('foo + 1')).toBe("Unknown name 'foo'");
  expect(c.err('r9 * 2')).toBe("Unknown name 'r9'");
});

test('clear', () => {
  const c = calc();
  c.ok('x = 5');
  c.engine.clear();
  expect(c.err('x')).toContain("Unknown name 'x'");
  expect(c.err('ans')).toContain('No previous result');
});

test('preview has no side effects', () => {
  const c = calc();
  c.ok('5');
  const preview = c.engine.preview('x = ans * 2');
  expect(preview?.text).toBe('10');
  expect(c.num('ans')).toBe(5n);
  expect(c.err('x')).toContain("Unknown name 'x'");
});

test.each(['', '1 +', '2 *', '(', 'sqrt(', 'foo', '1/0', '5 kg to m', '5 m to', '4.7 k'])(
  'preview is silent on invalid input %j',
  (text) => expect(calc().engine.preview(text)).toBeNull(),
);

test.each<[string, string | null]>([
  ['1', '1'],
  ['1+', null],
  ['1+2', '3'],
  ['1+2*', null],
  ['1+2*(', null],
  ['1+2*(3', '7'],
  ['1+2*(3)', '7'],
])('preview while typing %j', (text, expected) => {
  const preview = calc().engine.preview(text);
  expect(preview ? preview.text : null).toBe(expected);
});

test('result fields', () => {
  const c = calc();
  const good = c.run('  1 + 1  ');
  expect([good.ok, good.expr, good.text, good.display, good.error]).toEqual([true, '1 + 1', '2', '2', null]);
  const bad = c.run('1/0');
  expect([bad.ok, bad.text, bad.display, bad.incomplete]).toEqual([false, '', 'Division by zero', false]);
  expect(c.run('1 +').incomplete).toBe(true);
});

test('engines are independent', () => {
  const a = new Engine();
  const b = new Engine();
  a.evaluate('x = 1');
  expect(b.evaluate('x').ok).toBe(false);
  expect(a.evaluate('5 m + 3 ft').ok && b.evaluate('5 m + 3 ft').ok).toBe(true);
});

test('engine does not import UI or Electron code', () => {
  const dir = path.join(__dirname, '..', 'src', 'engine');
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf-8');
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const spec of imports) expect(spec.startsWith('./'), `${file} imports ${spec}`).toBe(true);
  }
});
