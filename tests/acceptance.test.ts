/** Every row of the acceptance table in the original spec, plus the other examples it mentions. */

import { expect, test } from 'vitest';

import { approx, calc } from './helpers';

test('implicit multiplication', () => {
  const c = calc();
  expect(c.num('2(3+4)')).toBe(14n);
  expect(c.text('2(3+4)')).toBe('14');
});

test('power and sqrt', () => {
  const c = calc();
  expect(c.num('3^2 + sqrt(16)')).toBe(13n);
  expect(c.text('3^2 + sqrt(16)')).toBe('13');
});

test('percent of', () => {
  const c = calc();
  approx(c.num('80 * 15%'), 12);
  expect(c.text('80 * 15%')).toBe('12');
});

test('percent add', () => {
  const c = calc();
  expect(c.num('200 + 10%')).toBe(220n);
  expect(c.text('200 + 10%')).toBe('220');
});

test('parallel', () => {
  const c = calc();
  approx(c.num('4.7k || 10k'), 3197.2789, { rel: 1e-6 });
  c.fmt({ mode: 'eng', sigFigs: 4 });
  expect(c.text('4.7k || 10k')).toBe('3.197 k');
});

test('engineering mode', () => {
  const c = calc();
  approx(c.num('3.3 / 4.7k'), 702.1277e-6, { rel: 1e-6 });
  c.fmt({ mode: 'eng', sigFigs: 4 });
  expect(c.text('3.3 / 4.7k')).toBe('702.1 µ');
});

test("ohm's law with units", () => {
  const c = calc();
  c.fmt({ sigFigs: 4 });
  expect(c.text('9 V / 4.7 kohm')).toBe('1.915 mA');
  c.fmt({ mode: 'eng', sigFigs: 4 });
  expect(c.text('9 V / 4.7 kohm')).toBe('1.915 mA');
});

test('speed times time', () => expect(calc().text('60 mph * 2 h')).toBe('120 mi'));

test('mil to mm', () => expect(calc().text('10 mil to mm')).toBe('0.254 mm'));

test('mm to mil', () => {
  const c = calc();
  approx(c.num('1.6 mm to mil'), 62.99, { abs: 0.005 });
  c.fmt({ sigFigs: 4 });
  expect(c.text('1.6 mm to mil')).toBe('62.99 mil');
});

test('fahrenheit to celsius', () => {
  const c = calc();
  approx(c.num('72 F to C'), 22.2222, { abs: 1e-4 });
  c.fmt({ sigFigs: 4 });
  expect(c.text('72 F to C')).toBe('22.22 °C');
});

test('mph to km/h', () => {
  const c = calc();
  approx(c.num('60 mph to km/h'), 96.56064);
  c.fmt({ sigFigs: 4 });
  expect(c.text('60 mph to km/h')).toBe('96.56 km/h');
});

test('GiB to MB', () => {
  const c = calc();
  approx(c.num('1 GiB to MB'), 1073.741824);
  c.fmt({ sigFigs: 6 });
  expect(c.text('1 GiB to MB')).toBe('1073.74 MB');
});

test('hex plus binary', () => {
  const c = calc();
  expect(c.num('0xFF + 0b1010')).toBe(265n);
  expect(c.text('0xFF + 0b1010')).toBe('265');
});

test('to hex', () => {
  const c = calc();
  expect(c.text('255 to hex')).toBe('0xFF');
  expect(c.text('0x3F to bin')).toBe('0b111111');
  expect(c.text('42 to oct')).toBe('0o52');
});

test('leading operator uses ans', () => {
  const c = calc();
  c.ok('0xFF + 0b1010');
  expect(c.num('*2')).toBe(530n);
  approx(c.num('/3'), 530 / 3);
});

test('division by zero is an inline error', () => {
  const c = calc();
  expect(c.err('1/0')).toBe('Division by zero');
  expect(c.num('1+1')).toBe(2n); // still alive
});

test('incompatible conversion', () => expect(calc().err('5 kg to m')).toBe("Can't convert mass to length"));

test('parallel with units', () => expect(calc().text('10 kohm || 10 kohm')).toBe('5 kΩ'));

test('in is inch or keyword', () => {
  const c = calc();
  expect(c.text('5 in in mm')).toBe('127 mm');
  expect(c.text('5 in to mm')).toBe('127 mm');
  approx(c.num('5 mm in in'), 5 / 25.4);
  expect(c.text('5 in')).toBe('5 in');
  expect(c.text('5 in * 2')).toBe('10 in');
  expect(c.text('2 in + 3 in')).toBe('5 in');
});

test('compound units', () => {
  const c = calc();
  expect(c.text('5 ft 3 in to cm')).toBe('160.02 cm');
  expect(c.text('1 h 30 min to min')).toBe('90 min');
});

test('SI suffix examples', () => {
  const c = calc();
  expect(c.num('4.7k')).toBe(4700);
  approx(c.num('100n'), 100e-9);
  approx(c.num('2.2u'), 2.2e-6);
  approx(c.num('2.2µ'), 2.2e-6);
  expect(c.num('10M')).toBe(10_000_000n);
  expect(c.num('1G')).toBe(1_000_000_000n);
  approx(c.num('33p'), 33e-12);
});

test('m is milli or metre', () => {
  const c = calc();
  approx(c.num('10m'), 0.01);
  expect(c.text('10 m')).toBe('10 m');
  approx(c.num('10 m to ft'), 32.8084, { rel: 1e-5 });
  approx(c.num('10m to ft'), 32.8084, { rel: 1e-5 });
});

test('number formats', () => {
  const c = calc();
  expect(c.num('0xFF')).toBe(255n);
  expect(c.num('0b1010')).toBe(10n);
  expect(c.num('0o17')).toBe(15n);
  approx(c.num('1e-6'), 1e-6);
  expect(c.num('1_000_000')).toBe(1_000_000n);
});

test('float noise is trimmed', () => expect(calc().text('0.1+0.2')).toBe('0.3'));

test('variables', () => {
  const c = calc();
  expect(c.num('r1 = 4.7k')).toBe(4700);
  approx(c.num('r1 || 10k'), 3197.2789, { rel: 1e-6 });
});

test('copper weight', () => {
  const c = calc();
  approx(c.num('1 oz_cu to mil'), 1.37);
  approx(c.num('2 oz_cu to mm'), 0.069596);
});

test('dBm', () => {
  const c = calc();
  approx(c.num('20 dBm to mW'), 100);
  approx(c.num('100 mW to dBm'), 20);
  approx(c.num('0 dBm to mW'), 1);
});
