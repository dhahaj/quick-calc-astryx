/** Units: conversions, aliases, temperature, ambiguity rules, simplification, custom file. */

import { describe, expect, test } from 'vitest';

import { CUSTOM_UNITS_TEMPLATE, Engine, Quantity } from '../src/engine';
import { approx, calc } from './helpers';

describe('conversions', () => {
  test.each<[string, number, string]>([
    // length
    ['1 in to mm', 25.4, 'mm'],
    ['1 inch to mm', 25.4, 'mm'],
    ['1 ft to in', 12, 'in'],
    ['1 mi to km', 1.609344, 'km'],
    ['1 yd to m', 0.9144, 'm'],
    ['100 thou to mm', 2.54, 'mm'],
    ['100 mils to mm', 2.54, 'mm'],
    ['1 nmi to km', 1.852, 'km'],
    ['1 um to nm', 1000, 'nm'],
    // area and volume
    ['1 acre to m^2', 4046.8564224, 'm²'],
    ['1 m^2 to ft^2', 10.76391041671, 'ft²'],
    ['1 sqft to sqin', 144, 'in²'],
    ['1 gal to L', 3.785411784, 'L'],
    ['1 L to mL', 1000, 'mL'],
    ['1 cup to floz', 8, 'floz'],
    ['1 m^3 to L', 1000, 'L'],
    // mass
    ['1 lb to kg', 0.45359237, 'kg'],
    ['1 oz to g', 28.349523125, 'g'],
    ['1 kg to lb', 2.2046226218, 'lb'],
    // time
    ['1 h to min', 60, 'min'],
    ['1 day to h', 24, 'h'],
    ['1 week to day', 7, 'd'],
    ['90 s to min', 1.5, 'min'],
    // speed
    ['60 mph to km/h', 96.56064, 'km/h'],
    ['100 km/h to mph', 62.1371192237, 'mph'],
    ['1 knot to km/h', 1.852, 'km/h'],
    ['10 m/s to km/h', 36, 'km/h'],
    ['100 kph to m/s', 27.7777777778, 'm/s'],
    // pressure
    ['1 atm to psi', 14.6959487755, 'psi'],
    ['1 bar to kPa', 100, 'kPa'],
    ['1 psi to kPa', 6.89475729317, 'kPa'],
    // energy and power
    ['1 kWh to MJ', 3.6, 'MJ'],
    ['1 cal to J', 4.184, 'J'],
    ['1 BTU to J', 1055.056, 'J'],
    ['1 hp to W', 745.699871582, 'W'],
    ['1 eV to J', 1.602176634e-19, 'J'],
    // force
    ['1 lbf to N', 4.4482216152605, 'N'],
    ['1 kgf to N', 9.80665, 'N'],
    // angle
    ['180 deg to rad', 3.14159265359, 'rad'],
    ['pi rad to deg', 180, '°'],
    ['1 turn to deg', 360, '°'],
    // frequency
    ['60 rpm to Hz', 1, 'Hz'],
    ['1 Hz to rpm', 60, 'rpm'],
    ['1 kHz to Hz', 1000, 'Hz'],
    ['60 rpm to rad/s', 6.28318530718, 'rad/s'],
    // data
    ['1 GiB to MB', 1073.741824, 'MB'],
    ['1 kB to B', 1000, 'B'],
    ['1 KiB to B', 1024, 'B'],
    ['1 MB to MiB', 0.95367431640625, 'MiB'],
    ['1 B to bit', 8, 'bit'],
    ['1 MB to Mb', 8, 'Mbit'],
    ['100 Mbps to MB/s', 12.5, 'MB/s'],
    // electrical
    ['1 kohm to ohm', 1000, 'Ω'],
    ['4.7 kΩ to Ω', 4700, 'Ω'],
    ['100 nF to uF', 0.1, 'µF'],
    ['100 nF to µF', 0.1, 'µF'],
    ['1 mAh to C', 3.6, 'C'],
  ])('%s', (text, expected, unit) => {
    const result = calc().ok(text);
    approx((result.value as Quantity).magnitude, expected, { rel: 1e-9 });
    const last = result.text.split(' ').pop();
    expect(last === unit || result.text.endsWith(unit), `${result.text} should end in ${unit}`).toBe(true);
  });
});

test.each(['to', 'in', '->', '→'])('conversion keyword %s', (keyword) => {
  expect(calc().text(`1 ft ${keyword} mm`)).toBe('304.8 mm');
});

test('conversion chain', () => {
  expect(calc().text('1 ft to in to mm')).toBe('304.8 mm');
});

test('conversion applies to whole expression', () => {
  const c = calc();
  expect(c.text('1 ft + 6 in to mm')).toBe('457.2 mm');
  expect(c.text('2 * 5 in to mm')).toBe('254 mm');
});

test('conversion inside parentheses is rejected', () => {
  expect(calc().err('(5 in to mm) * 2')).toContain('parentheses');
});

describe('temperature', () => {
  test.each<[string, number, string]>([
    ['72 F to C', 22.2222222222, '°C'],
    ['72 degF to degC', 22.2222222222, '°C'],
    ['72 °F to °C', 22.2222222222, '°C'],
    ['72 fahrenheit to celsius', 22.2222222222, '°C'],
    ['100 C to F', 212, '°F'],
    ['0 C to K', 273.15, 'K'],
    ['300 K to C', 26.85, '°C'],
    ['-40 F to C', -40, '°C'],
    ['-40 C to F', -40, '°F'],
    ['32 F to K', 273.15, 'K'],
    ['72 F in C', 22.2222222222, '°C'],
    ['0 K to F', -459.67, '°F'],
  ])('%s', (text, expected, symbol) => {
    const result = calc().ok(text);
    approx((result.value as Quantity).magnitude, expected, { abs: 1e-8 });
    expect(result.text.endsWith(` ${symbol}`)).toBe(true);
  });

  test('F and C are farad and coulomb otherwise', () => {
    const c = calc();
    expect(c.text('100n F')).toBe('100 nF');
    expect(c.text('1 C / 1 s')).toBe('1 A');
    expect(c.text('10 uF to nF')).toBe('10000 nF');
    expect(c.text('1 F to uF')).toBe('1000000 µF');
  });

  test('arithmetic', () => {
    const c = calc();
    expect(c.text('20 degC + 5 degC')).toBe('25 °C');
    expect(c.text('25 degC - 20 degC')).toBe('5 Δ°C');
    expect(c.err('20 degC + 5 degF')).toContain('same temperature unit');
  });
});

test('in edge cases', () => {
  const c = calc();
  expect(c.text('1 in')).toBe('1 in');
  expect(c.text('12 in to ft')).toBe('1 ft');
  expect(c.text('1 ft in in')).toBe('12 in');
  expect(c.text('1 m/s in in/s').endsWith(' in/s')).toBe(true);
  expect(c.text('3 in * 2 in')).toBe('6 in²');
  expect(c.num('(2 in) / (1 in)')).toBe(2);
  expect(c.err('2 in mm')).toContain('plain number'); // 'in' here is the keyword
});

test('leading conversion uses ans', () => {
  const c = calc();
  c.ok('1 ft');
  expect(c.text('to mm')).toBe('304.8 mm');
  expect(c.text('in in')).toBe('12 in');
  expect(c.text('-> m')).toBe('0.3048 m');
  c.ok('255');
  expect(c.text('to hex')).toBe('0xFF');
});

test('base conversion', () => {
  const c = calc();
  expect(c.text('255 to hex')).toBe('0xFF');
  expect(c.text('255 to bin')).toBe('0b11111111');
  expect(c.text('8 to oct')).toBe('0o10');
  expect(c.text('0xFF to dec')).toBe('255');
  expect(c.text('-255 to hex')).toBe('-0xFF');
  expect(c.text('2^8 - 1 to hex')).toBe('0xFF');
  expect(c.text('510 / 2 to hex')).toBe('0xFF');
  expect(c.text('255 in hex')).toBe('0xFF');
  expect(c.text('255 -> hex')).toBe('0xFF');
  expect(c.err('1.5 to hex')).toContain('whole numbers');
  expect(c.err('5 V to hex')).toContain('whole numbers');
  expect(c.num('255 to hex')).toBe(255n); // ans stays a number
  expect(c.num('ans + 1')).toBe(256n);
});

test('compound input', () => {
  const c = calc();
  approx(c.num('5 ft 3 in'), 5.25);
  expect(c.text('5 ft 3 in')).toBe('5.25 ft');
  expect(c.text('5 ft 3 in to cm')).toBe('160.02 cm');
  expect(c.text('1 h 30 min')).toBe('1.5 h');
  expect(c.text('1 h 30 min 30 s to s')).toBe('5430 s');
  expect(c.text('2 lb 8 oz to lb')).toBe('2.5 lb');
  // Different kinds of unit side by side are still multiplied.
  expect(c.text('2 N 3 m')).toBe('6 J');
});

describe('unit arithmetic', () => {
  test.each<[string, string]>([
    ['9 V / 4.7 kohm', '1.914893617 mA'],
    ['5 V * 2 mA', '10 mW'],
    ['12 V / 0.5 A', '24 Ω'],
    ['2 A * 10 ohm', '20 V'],
    ['3.3 V / 10 kΩ', '330 µA'],
    ['(5 V)^2 / 100 ohm', '250 mW'],
    ['1 / (1 kHz)', '1 ms'],
    ['1 / (2 pi * 1 kohm * 100 nF)', '1.591549431 kHz'],
    ['1 kohm * 1 uF', '1 ms'],
    ['60 mph * 2 h', '120 mi'],
    ['100 km / 2 h', '50 km/h'],
    ['120 mi / 2 h', '60 mi/h'],
    ['3 ft * 2 ft', '6 ft²'],
    ['2 m * 50 cm', '1 m²'],
    ['10 m / 2 m', '5'],
    ['1 kohm / 1 ohm', '1000'],
    ['1 GiB / 1 MiB', '1024'],
    ['100 MB / 4 s', '25 MB/s'],
    ['10 Mbps * 60 s to MB', '75 MB'],
    ['5 mm * 5 cm', '2.5 cm²'],
    ['500 mA * 2 h', '1 Ah'],
    ['100 W * 3 h', '300 Wh'],
    ['1 kWh / 2 h', '500 W'],
    ['5 psi * 2 in^2', '10 lbf'],
    ['10 N * 2 m', '20 J'],
    ['1 kg * 9.81 m/s^2', '9.81 N'],
    ['sqrt(16 m^2)', '4 m'],
    ['2 * 3 V', '6 V'],
    ['1 V + 500 mV', '1.5 V'],
    ['1 ft + 1 in', '1.083333333 ft'],
    ['-5 V', '-5 V'],
    ['abs(-5 V)', '5 V'],
    ['max(1 ft, 10 in)', '1 ft'],
    ['min(1 ft, 10 in)', '10 in'],
    ['200 V + 10%', '220 V'],
    ['10 m^2', '10 m²'],
    ['5 kg m/s^2', '5 N'],
  ])('%s', (text, expected) => expect(calc().text(text)).toBe(expected));
});

describe('auto prefix', () => {
  test.each<[string, string]>([
    ['0.5 V', '500 mV'],
    ['4700 ohm', '4.7 kΩ'],
    ['0.0000001 F', '100 nF'],
    ['2.4e9 Hz', '2.4 GHz'],
    ['1500 m', '1.5 km'],
    ['0.5 km', '500 m'],
    ['5000 kg', '5000 kg'], // no megagrams
    ['3600 s', '3600 s'], // no kiloseconds
    ['0.001 s', '1 ms'],
    ['2.54 cm', '2.54 cm'], // centi is left alone
    ['0.5 mi', '0.5 mi'], // not an SI unit
    ['5 kΩ', '5 kΩ'],
    ['0 V', '0 V'],
  ])('%s', (text, expected) => expect(calc().text(text)).toBe(expected));
});

test('explicit target is never reprefixed', () => {
  const c = calc();
  expect(c.text('10 mil to mm')).toBe('0.254 mm');
  expect(c.text('1 km to m')).toBe('1000 m');
  expect(c.text('1 mA to A')).toBe('0.001 A');
});

describe('unit errors', () => {
  test.each<[string, string]>([
    ['5 kg to m', "Can't convert mass to length"],
    ['5 V to A', "Can't convert voltage to current"],
    ['1 GiB to m', "Can't convert data size to length"],
    ['30 deg to m', "Can't convert angle to length"],
    ['1 MB to rad', "Can't convert data size to angle"],
    ['5 to m', "Can't convert a plain number to length"],
    ['5 m + 3', "Can't add length and a plain number"],
    ['3 - 5 m', "Can't subtract a plain number and length"],
    ['5 m + 3 s', "Can't add length and time"],
    ['5 m to xyz', "Unknown unit 'xyz'"],
    ['5 xyz', "Unknown name 'xyz'"],
    ['2 ^ (3 m)', 'An exponent must be a plain number, not length'],
  ])('%s', (text, message) => expect(calc().err(text)).toBe(message));
});

test('glued m, G and T', () => {
  const c = calc();
  // With no other units on the line, a glued m / G / T is an SI prefix.
  approx(c.num('10m'), 0.01);
  approx(c.num('3.3 / 10m'), 330);
  expect(c.num('1G')).toBe(1_000_000_000n);
  // With other units on the line, it is the unit.
  expect(c.text('10m/s')).toBe('10 m/s');
  expect(c.text('3m + 20cm')).toBe('3.2 m');
  expect(c.text('10m to ft').endsWith(' ft')).toBe(true);
  expect(c.text('5m * 2 m')).toBe('10 m²');
  // Unambiguous spellings never depend on context.
  expect(c.text('10mm')).toBe('10 mm');
  expect(c.text('4.7kohm')).toBe('4.7 kΩ');
  expect(c.text('10mA')).toBe('10 mA');
  expect(c.text('5V')).toBe('5 V');
  expect(c.text('100n F')).toBe('100 nF');
  expect(c.text('4.7k ohm')).toBe('4.7 kΩ');
});

test('single-letter constants are not units', () => {
  const c = calc();
  for (const name of ['k', 'u', 'M', 'R', 'a']) expect(c.err(name)).toBe(`Unknown name '${name}'`);
});

test('variables shadow units', () => {
  const c = calc();
  c.ok('m = 3');
  expect(c.num('2 m')).toBe(6n);
  expect(c.text('2 mm')).toBe('2 mm');
});

test('speed of light', () => {
  approx(calc().num('c / 2.4 GHz to cm'), 12.4913524, { rel: 1e-8 });
});

test('dB arithmetic is refused', () => {
  const c = calc();
  expect(c.err('10 dBm + 3 dBm')).toContain('dB');
  expect(c.err('2 * 10 dBm')).toContain('dB');
});

test('tesla and gauss convert', () => {
  expect(calc().text('1 T to G')).toBe('10000 G');
});

// ----------------------------------------------------------------- custom units file

const source = (text: string | null, error?: string) => ({ name: 'units.txt', text, error });

describe('custom units file', () => {
  test('definitions are loaded', () => {
    const engine = new Engine({ customUnits: source('# comment\nsmoot = 1.7018 * meter\nrack_unit = 1.75 * inch = RU\n') });
    expect(engine.warnings).toEqual([]);
    expect(engine.evaluate('1 smoot to m').text).toBe('1.7018 m');
    expect(engine.evaluate('2 RU to in').text).toBe('3.5 in');
    expect(engine.evaluate('1 oz_cu to mil').text).toBe('1.37 mil'); // built-in fallback
  });

  test('the template is valid', () => {
    const engine = new Engine({ customUnits: source(CUSTOM_UNITS_TEMPLATE) });
    expect(engine.warnings).toEqual([]);
    expect(engine.evaluate('1 oz_cu to mil').text).toBe('1.37 mil');
  });

  test('copper weight can be redefined', () => {
    const engine = new Engine({ customUnits: source('oz_cu = 1.4 * thou\n') });
    expect(engine.evaluate('1 oz_cu to mil').text).toBe('1.4 mil');
  });

  test('bad lines are skipped', () => {
    const engine = new Engine({
      customUnits: source('this is not a definition\nbroken = 3 * nosuchunit\nsmoot = 1.7018 * meter\n'),
    });
    expect(engine.warnings).toHaveLength(2);
    expect(engine.warnings[0]).toContain('line 1');
    expect(engine.warnings[1]).toContain('line 2');
    expect(engine.evaluate('1 smoot to m').text).toBe('1.7018 m');
    expect(engine.evaluate('1 + 1').text).toBe('2');
  });

  test('a missing file is not fatal', () => {
    const engine = new Engine({ customUnits: source(null, 'No such file or directory') });
    expect(engine.warnings).toHaveLength(1);
    expect(engine.evaluate('1 + 1').text).toBe('2');
  });
});
