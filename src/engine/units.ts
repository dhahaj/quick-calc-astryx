/**
 * The unit registry plus the QuickCalc-specific layer on top of it: friendly aliases, the
 * user's custom units file, unit arithmetic, result simplification and unit symbols.
 */

import { BUILTIN_DEFINITIONS } from './definitions';
import { EvaluationError, UnitMismatchError } from './errors';
import { type Scalar, isScalar, significantDigits, toFloat } from './numeric';
import { Quantity, Unit, type Value } from './quantity';
import { UnitRegistry } from './registry';

export const CUSTOM_UNITS_TEMPLATE = `# QuickCalc custom units
#
# One definition per line, in Pint syntax:   name = value * unit [= alias1 = alias2]
# Lines starting with # are ignored. Restart QuickCalc after editing this file.
# A line that can't be read is skipped; it never stops the app from starting.
#
# Copper weight: 1 oz/ft^2 of copper is 1.37 mil thick.
#   2 oz_cu to mm   ->  0.069596 mm
oz_cu = 1.37 * thou

# More examples (remove the leading # to enable):
# smoot = 1.7018 * meter
# rack_unit = 1.75 * inch = RU
# furlong_per_fortnight = furlong / fortnight = fpf
`;

/** The custom units file as read by the host: its text, or why it couldn't be read. */
export interface CustomUnitsSource {
  name: string;
  text: string | null;
  error?: string;
}

// Friendly spellings -> a unit expression (always one of ours, never user text).
const ALIASES: Readonly<Record<string, string>> = {
  mil: 'thou',
  mils: 'thou',
  b: 'bit',
  kb: 'kilobit',
  Kb: 'kilobit',
  Mb: 'megabit',
  Gb: 'gigabit',
  Tb: 'terabit',
  bps: 'bit / second',
  kbps: 'kilobit / second',
  Mbps: 'megabit / second',
  Gbps: 'gigabit / second',
  Ohm: 'ohm',
  ohms: 'ohm',
  Ohms: 'ohm',
  degK: 'kelvin',
  '°K': 'kelvin',
  celsius: 'degC',
  fahrenheit: 'degF',
  hrs: 'hour',
  mins: 'minute',
  secs: 'second',
  wk: 'week',
  '°': 'degree',
  sqft: 'foot ** 2',
  sqin: 'inch ** 2',
  sqm: 'meter ** 2',
  sqmi: 'mile ** 2',
  cuft: 'foot ** 3',
  cuin: 'inch ** 3',
};

// Physical constants that Pint exposes under one letter. As bare symbols in a
// calculator they are far more likely to be typos or unset variables.
const BLOCKED = new Set(['k', 'u', 'M', 'R', 'a']);

const TEMPERATURE_LETTERS: Readonly<Record<string, string>> = { F: 'degree_Fahrenheit', C: 'degree_Celsius' };

const SYMBOL_OVERRIDES: Readonly<Record<string, string>> = {
  thou: 'mil',
  degree: '°',
  liter: 'L',
  milliliter: 'mL',
  microliter: 'µL',
};

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

// Named units to land on when a compound result has one of these dimensions.
const PREFERRED = [
  'ampere', 'volt', 'ohm', 'siemens', 'farad', 'henry', 'watt', 'joule',
  'coulomb', 'hertz', 'newton', 'pascal', 'weber', 'tesla', 'second',
];

const DIMENSION_NAMES: ReadonlyArray<[string, string]> = [
  ['meter', 'length'],
  ['kilogram', 'mass'],
  ['second', 'time'],
  ['kelvin', 'temperature'],
  ['ampere', 'current'],
  ['mole', 'amount of substance'],
  ['candela', 'luminous intensity'],
  ['meter ** 2', 'area'],
  ['meter ** 3', 'volume'],
  ['meter / second', 'speed'],
  ['meter / second ** 2', 'acceleration'],
  ['kilogram / meter ** 3', 'density'],
  ['newton', 'force'],
  ['pascal', 'pressure'],
  ['joule', 'energy'],
  ['watt', 'power'],
  ['hertz', 'frequency'],
  ['volt', 'voltage'],
  ['ohm', 'resistance'],
  ['siemens', 'conductance'],
  ['farad', 'capacitance'],
  ['henry', 'inductance'],
  ['coulomb', 'charge'],
  ['weber', 'magnetic flux'],
  ['tesla', 'magnetic flux density'],
];

// Units that get an automatic SI prefix on output: name -> [lowest, highest] power of ten.
const PREFIXABLE: Readonly<Record<string, readonly [number, number]>> = {
  volt: [-15, 12],
  ampere: [-15, 12],
  ohm: [-15, 12],
  siemens: [-15, 12],
  farad: [-15, 12],
  henry: [-15, 12],
  watt: [-15, 12],
  hertz: [-15, 12],
  joule: [-15, 12],
  pascal: [-15, 12],
  newton: [-15, 12],
  coulomb: [-15, 12],
  weber: [-15, 12],
  tesla: [-15, 12],
  electron_volt: [-15, 12],
  watt_hour: [-3, 12],
  ampere_hour: [-6, 3],
  second: [-15, 0],
  meter: [-15, 3],
  gram: [-9, 3],
  liter: [-6, 0],
};

const PREFIX_NAMES: ReadonlyMap<number, string> = new Map([
  [-15, 'femto'], [-12, 'pico'], [-9, 'nano'], [-6, 'micro'], [-3, 'milli'], [0, ''],
  [3, 'kilo'], [6, 'mega'], [9, 'giga'], [12, 'tera'],
]);
const PREFIX_EXPONENTS: ReadonlyMap<string, number> = new Map([...PREFIX_NAMES].map(([e, n]) => [n, e]));

// Arithmetic failures, named after the Pint exceptions the original engine caught.
export class DimensionalityError extends Error {}
export class OffsetUnitCalculusError extends Error {}
export class LogarithmicUnitCalculusError extends Error {}

function superscript(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUPERSCRIPTS[c] ?? c)
    .join('');
}

function formatG(x: number): string {
  return String(Number(x.toPrecision(6)));
}

/** Owns the unit registry. One instance per engine. */
export class Units {
  readonly reg = new UnitRegistry();
  readonly warnings: string[] = [];
  private readonly cache = new Map<string, Unit | null>();
  private readonly preferred = new Map<string, Unit>();
  private readonly dimNames = new Map<string, string>();
  readonly radian: Unit;

  constructor(custom: CustomUnitsSource | null = null) {
    this.reg.defineAll(BUILTIN_DEFINITIONS);
    if (custom !== null) this.loadCustom(custom);
    if (!this.reg.has('oz_cu')) this.reg.define('oz_cu = 1.37 * thou');
    for (const name of PREFERRED) {
      const unit = this.parse(name);
      this.preferred.set(this.dimensionality(unit), unit);
    }
    for (const [expr, name] of DIMENSION_NAMES) {
      this.dimNames.set(this.dimensionality(this.parse(expr)), name);
    }
    this.radian = this.parse('radian');
  }

  /** A unit expression from our own tables. */
  parse(expr: string): Unit {
    const { magnitude, unit } = this.reg.evaluateExpression(expr);
    if (magnitude !== 1) throw new Error(`Unexpected scale in ${expr}`);
    return unit;
  }

  quantity(magnitude: Scalar, units: Unit): Quantity {
    return new Quantity(toFloat(magnitude), units);
  }

  // ------------------------------------------------------------------ definitions

  private loadCustom(source: CustomUnitsSource): void {
    if (source.text === null) {
      this.warnings.push(`Couldn't read ${source.name}: ${source.error ?? 'unknown error'}`);
      return;
    }
    const lines = source.text.replace(/^﻿/, '').split(/\r?\n/);
    lines.forEach((raw, index) => {
      const line = raw.split('#')[0].trim();
      if (!line) return;
      try {
        this.reg.define(line);
        // Resolve the definition now so a bad one is caught here, not on first use.
        const name = line.split('=')[0].trim();
        if (!name.endsWith('-')) this.reg.rootOf(Unit.of(this.reg.getName(name) ?? name));
      } catch (exc) {
        const message = exc instanceof Error ? exc.message : String(exc);
        this.warnings.push(`${source.name} line ${index + 1} skipped: ${message}`);
      }
    });
  }

  // ----------------------------------------------------------------------- lookup

  /** Resolve a symbol to a unit, or null if it isn't one. */
  lookup(name: string, temperatureLetters = false): Unit | null {
    const key = `${temperatureLetters ? 1 : 0}${name}`;
    if (!this.cache.has(key)) this.cache.set(key, this.lookupUncached(name, temperatureLetters));
    return this.cache.get(key) ?? null;
  }

  private lookupUncached(name: string, temperatureLetters: boolean): Unit | null {
    if (temperatureLetters && Object.hasOwn(TEMPERATURE_LETTERS, name)) return Unit.of(TEMPERATURE_LETTERS[name]);
    if (BLOCKED.has(name)) return null;
    if (Object.hasOwn(ALIASES, name)) return this.parse(ALIASES[name]);
    const canonical = this.reg.getName(name);
    if (canonical !== null) return Unit.of(canonical);
    // Case-insensitive fallback, only when it is unambiguous (kOhm, MM is not).
    const candidates = this.reg.parseUnitName(name, false);
    if (candidates.length === 1) {
      const [prefix, unit] = candidates[0];
      const resolved = this.reg.getName(prefix + unit);
      if (resolved !== null) return Unit.of(resolved);
    }
    return null;
  }

  // ------------------------------------------------------------------ description

  dimensionality(units: Unit): string {
    return this.reg.dimensionKey(units);
  }

  /** Root units including the dimensionless radian and bit. */
  rootUnits(units: Unit): Unit {
    return new Unit(this.reg.rootOf(units).root);
  }

  /** A short human name for what a value measures: 'mass', 'length', ... */
  dimensionName(value: Value): string {
    if (isScalar(value)) return 'a plain number';
    const units = value instanceof Quantity ? value.units : value;
    const dim = this.dimensionality(units);
    if (!dim) {
      const names = new Set(this.rootUnits(units).names());
      if (names.size === 1 && names.has('bit')) return 'data size';
      if (names.size === 1 && names.has('radian')) return 'angle';
      if (names.size === 0) return 'a plain number';
      return this.symbol(units);
    }
    return this.dimNames.get(dim) ?? this.symbol(units);
  }

  /** Compact display form: kΩ, km/h, m², kg·m/s². */
  symbol(units: Unit): string {
    const top: string[] = [];
    const bottom: string[] = [];
    for (const [name, exp] of units.items) {
      let sym = SYMBOL_OVERRIDES[name] ?? this.reg.getSymbol(name);
      sym = sym.replaceAll('μ', 'µ');
      const power = Math.abs(exp);
      if (power !== 1) sym += Number.isInteger(power) ? superscript(power) : `^${formatG(power)}`;
      (exp > 0 ? top : bottom).push(sym);
    }
    if (bottom.length === 0) return top.join('·');
    const denominator = bottom.length === 1 ? bottom[0] : `(${bottom.join('·')})`;
    return `${top.join('·') || '1'}/${denominator}`;
  }

  // ------------------------------------------------------------------- conversion

  /** Dimension check that also keeps bytes, radians and plain numbers apart. */
  sameKind(a: Unit, b: Unit): boolean {
    const dim = this.dimensionality(a);
    if (dim !== this.dimensionality(b)) return false;
    if (dim) return true;
    return this.rootUnits(a).equals(this.rootUnits(b));
  }

  /** Raw conversion (Pint's Quantity.to): only checks dimensionality. */
  to(q: Quantity, target: Unit): Quantity {
    if (this.dimensionality(q.units) !== this.dimensionality(target)) throw new DimensionalityError();
    return new Quantity(this.convertMagnitude(q.magnitude, q.units, target), target);
  }

  toRootUnits(q: Quantity): Quantity {
    return this.to(q, this.rootUnits(q.units));
  }

  private convertMagnitude(magnitude: number, from: Unit, to: Unit): number {
    if (from.equals(to)) return magnitude;
    const fromDef = this.singleDef(from);
    const toDef = this.singleDef(to);
    const special = (fromDef && (fromDef.offset !== 0 || fromDef.log)) || (toDef && (toDef.offset !== 0 || toDef.log));
    if (!special) {
      return magnitude * (this.reg.rootOf(from).factor / this.reg.rootOf(to).factor);
    }
    let root: number;
    if (fromDef?.log) root = fromDef.factor * fromDef.log.base ** (magnitude / fromDef.log.factor);
    else if (fromDef && fromDef.offset !== 0) root = magnitude * fromDef.factor + fromDef.offset;
    else root = magnitude * this.reg.rootOf(from).factor;
    if (toDef?.log) {
      if (root <= 0) throw new EvaluationError("Can't express zero or negative power in dB");
      return toDef.log.factor * (Math.log(root / toDef.factor) / Math.log(toDef.log.base));
    }
    if (toDef && toDef.offset !== 0) return (root - toDef.offset) / toDef.factor;
    return root / this.reg.rootOf(to).factor;
  }

  private singleDef(units: Unit) {
    const only = units.only();
    return only && only[1] === 1 ? this.reg.def(only[0]) : null;
  }

  convert(value: Value, target: Unit): Quantity {
    if (!(value instanceof Quantity)) {
      throw new UnitMismatchError(`Can't convert a plain number to ${this.dimensionName(target)}`);
    }
    if (!this.sameKind(value.units, target)) {
      throw new UnitMismatchError(`Can't convert ${this.dimensionName(value)} to ${this.dimensionName(target)}`);
    }
    try {
      let result = this.to(value, target);
      const turns = this.radianPower(value.units) - this.radianPower(target);
      if (turns && this.dimensionality(value.units)) {
        // A revolution is 2*pi radians, so rpm -> Hz comes out 2*pi too big. Between a
        // rotation rate and a plain rate, one turn is one cycle.
        result = new Quantity(result.magnitude / (2 * Math.PI) ** turns, target);
      }
      return result;
    } catch (exc) {
      if (exc instanceof DimensionalityError) {
        throw new UnitMismatchError(`Can't convert ${this.dimensionName(value)} to ${this.dimensionName(target)}`);
      }
      throw exc;
    }
  }

  private radianPower(units: Unit): number {
    return this.reg.rootOf(units).root.get('radian') ?? 0;
  }

  /** True for dB-style quantities, which can be converted but not added or scaled. */
  isLog(value: Value): boolean {
    if (isScalar(value)) return false;
    const units = value instanceof Quantity ? value.units : value;
    return units.names().some((n) => n.startsWith('decibel') || n.startsWith('bel') || n.startsWith('neper'));
  }

  isAngle(units: Unit): boolean {
    return this.sameKind(units, this.radian);
  }

  /** True for °C / °F style units, where zero is not 'nothing'. */
  isOffset(units: Unit): boolean {
    const names = units.names();
    return names.length === 1 && (names[0] === 'degree_Celsius' || names[0] === 'degree_Fahrenheit');
  }

  private offsetNames(units: Unit): string[] {
    return units.names().filter((n) => this.reg.def(n).offset !== 0);
  }

  private hasDelta(units: Unit): boolean {
    return units.names().some((n) => this.reg.def(n).isDelta);
  }

  // ---------------------------------------------------------- Pint-style arithmetic

  /** Multiplying or dividing by a quantity with an offset unit: Pint's autoconvert rules. */
  private forMulDiv(q: Quantity): Quantity {
    const offsets = this.offsetNames(q.units);
    if (offsets.length === 0) return q;
    if (offsets.length > 1 || q.units.size > 1 || (q.units.only()?.[1] ?? 0) !== 1) throw new OffsetUnitCalculusError();
    return this.toRootUnits(q);
  }

  private checkLog(...values: Value[]): void {
    if (values.some((v) => this.isLog(v))) throw new LogarithmicUnitCalculusError();
  }

  /** a + b or a - b for two quantities of the same kind. Result is in a's units. */
  addQuantities(a: Quantity, b: Quantity, sign: 1 | -1): Quantity {
    this.checkLog(a, b);
    const aOffset = this.offsetNames(a.units);
    const bOffset = this.offsetNames(b.units);
    if (aOffset.length === 0 && bOffset.length === 0) {
      return new Quantity(a.magnitude + sign * this.to(b, a.units).magnitude, a.units);
    }
    const single = (q: Quantity, names: string[]) => names.length === 1 && q.units.size === 1 && q.units.only()?.[1] === 1;
    if (sign < 0 && single(a, aOffset) && !this.hasDelta(b.units)) {
      const delta = Unit.of(`delta_${aOffset[0]}`);
      return new Quantity(a.magnitude - this.to(b, a.units).magnitude, delta);
    }
    if (sign < 0 && single(b, bOffset) && !this.hasDelta(a.units)) {
      return new Quantity(a.magnitude - this.to(b, a.units).magnitude, a.units);
    }
    if (single(a, aOffset) && this.hasDelta(b.units)) {
      const delta = Unit.of(`delta_${aOffset[0]}`);
      return new Quantity(a.magnitude + sign * this.to(b, delta).magnitude, a.units);
    }
    if (single(b, bOffset) && this.hasDelta(a.units)) {
      const delta = Unit.of(`delta_${bOffset[0]}`);
      return new Quantity(this.to(a, delta).magnitude + sign * b.magnitude, b.units);
    }
    throw new OffsetUnitCalculusError();
  }

  /** a * b where at least one side has units. */
  multiply(a: Value, b: Value): Value {
    this.checkLog(a, b);
    if (a instanceof Unit && b instanceof Unit) return a.mul(b);
    if (isScalar(a) && b instanceof Quantity) return this.scale(b, toFloat(a), true);
    if (a instanceof Quantity && isScalar(b)) return this.scale(a, toFloat(b), true);
    const qa = this.forMulDiv(this.asQuantity(a));
    const qb = this.forMulDiv(this.asQuantity(b));
    return new Quantity(qa.magnitude * qb.magnitude, qa.units.mul(qb.units));
  }

  /** a / b where at least one side has units. */
  divide(a: Value, b: Value): Value {
    this.checkLog(a, b);
    if (a instanceof Unit && b instanceof Unit) return a.div(b);
    if (a instanceof Quantity && isScalar(b)) return this.scale(a, 1 / toFloat(b), false);
    if (a instanceof Unit && isScalar(b)) return new Quantity(1 / toFloat(b), a);
    const qa = this.forMulDiv(this.asQuantity(a));
    const qb = this.forMulDiv(this.asQuantity(b));
    return new Quantity(qa.magnitude / qb.magnitude, qa.units.div(qb.units));
  }

  private scale(q: Quantity, factor: number, multiplying: boolean): Quantity {
    const offsets = this.offsetNames(q.units);
    if (offsets.length > 0) {
      // 10 °C * 2 is allowed (and stays in °C); dividing an offset reading is not.
      if (offsets.length > 1 || q.units.size > 1 || q.units.only()?.[1] !== 1 || !multiplying) {
        throw new OffsetUnitCalculusError();
      }
    }
    return new Quantity(q.magnitude * factor, q.units);
  }

  power(base: Quantity | Unit, exp: number): Value {
    this.checkLog(base);
    if (base instanceof Unit) return base.pow(exp);
    if (exp === 1) return base;
    const q = this.offsetNames(base.units).length ? this.forMulDiv(base) : base;
    if (q.magnitude < 0 && !Number.isInteger(exp)) throw new EvaluationError('Result is not a real number');
    return new Quantity(q.magnitude ** exp, q.units.pow(exp));
  }

  /** a % b for two quantities (b converted to a's units). */
  modulo(a: Quantity, b: Quantity): Quantity {
    this.checkLog(a, b);
    const divisor = this.to(b, a.units).magnitude;
    let r = a.magnitude % divisor;
    if (r !== 0 && r < 0 !== divisor < 0) r += divisor;
    return new Quantity(r, a.units);
  }

  asQuantity(x: Value): Quantity {
    if (x instanceof Quantity) return x;
    if (x instanceof Unit) return new Quantity(1, x);
    return new Quantity(toFloat(x), Unit.none);
  }

  // --------------------------------------------------------------- simplification

  /** Units mentioned in a compound result, plus what they are defined from. */
  private candidates(units: Unit): Unit[] {
    const names: string[] = [];
    for (const name of units.names()) {
      names.push(name);
      const triplets = this.reg.parseUnitName(name);
      if (triplets.length) names.push(...this.reg.def(triplets[0][1]).reference);
    }
    return names.map((n) => Unit.of(n));
  }

  /** A x h and W x h have everyday names that beat coulombs and joules. */
  private namedProduct(units: Unit): Unit | null {
    if (units.size !== 2 || [...units.items.values()].some((e) => e !== 1)) return null;
    const bases = new Set<string>();
    for (const name of units.names()) {
      const triplets = this.reg.parseUnitName(name);
      if (!triplets.length) return null;
      bases.add(triplets[0][1]);
    }
    const has = (x: string, y: string) => bases.size === 2 && bases.has(x) && bases.has(y);
    if (has('ampere', 'hour')) return Unit.of('ampere_hour');
    if (has('watt', 'hour')) return Unit.of('watt_hour');
    return null;
  }

  /** Merge units of the same dimension into the largest one: m*cm -> m², ft*in -> ft². */
  private reduce(q: Quantity): Quantity {
    const groups = new Map<string, [number, string]>();
    const keyOf = (unit: Unit) =>
      `${this.dimensionality(unit)}|${[...this.rootUnits(unit).items]
        .map(([n, e]) => `${n}^${e}`)
        .sort()
        .join(',')}`;
    for (const name of q.units.names()) {
      const unit = Unit.of(name);
      const scale = Math.abs(this.reg.rootOf(unit).factor);
      const key = keyOf(unit);
      const current = groups.get(key);
      if (!current || scale > current[0]) groups.set(key, [scale, name]);
    }
    let target = Unit.none;
    for (const [name, exp] of q.units.items) {
      const keep = (groups.get(keyOf(Unit.of(name))) as [number, string])[1];
      target = target.mul(Unit.of(keep).pow(exp));
    }
    return this.to(q, target);
  }

  /** Tidy a computed quantity: mph*h -> mi, V/kohm -> A, m/m -> plain number. */
  simplify(q: Quantity): Value {
    const units = q.units;
    if (units.size === 0) return q.magnitude;
    if (units.size === 1 && units.only()?.[1] === 1) return q;
    try {
      const dim = this.dimensionality(units);
      if (!dim) {
        const root = this.toRootUnits(q);
        return root.units.size === 0 ? root.magnitude : this.reduce(q);
      }
      const rootNames = this.rootUnits(units).names();
      if (rootNames.includes('bit') || rootNames.includes('radian')) {
        // Data rates and angular rates are not hertz, whatever their dimension says.
        return this.reduce(q);
      }
      const named = this.namedProduct(units);
      if (named !== null) return this.to(q, named);
      for (const candidate of this.candidates(units)) {
        if (this.dimensionality(candidate) === dim) return this.to(q, candidate);
      }
      const preferred = this.preferred.get(dim);
      if (preferred) return this.to(q, preferred);
      return this.reduce(q);
    } catch {
      return q;
    }
  }

  // ------------------------------------------------------------------ SI prefixes

  /** [base unit name, lowest exponent, highest exponent] if `units` is a single SI unit that
   * may be re-prefixed for display, else null. */
  prefixInfo(units: Unit): [string, number, number] | null {
    const only = units.only();
    if (only === null || only[1] !== 1) return null;
    const triplets = this.reg.parseUnitName(only[0]);
    if (!triplets.length) return null;
    const [prefix, base, suffix] = triplets[0];
    if (suffix || !Object.hasOwn(PREFIXABLE, base) || !PREFIX_EXPONENTS.has(prefix)) return null;
    const [low, high] = PREFIXABLE[base];
    return [base, low, high];
  }

  withPrefix(base: string, exponent: number): Unit {
    const name = this.reg.getName((PREFIX_NAMES.get(exponent) ?? '') + base);
    return Unit.of(name ?? base);
  }

  /** Pick the SI prefix that puts the magnitude in [1, 1000): 0.001915 A -> 1.915 mA. */
  reprefix(q: Quantity, sig: number): Quantity {
    const info = this.prefixInfo(q.units);
    if (info === null || q.magnitude === 0) return q;
    const [base, low, high] = info;
    try {
      const inBase = this.to(q, this.withPrefix(base, 0));
      const [, exp] = significantDigits(inBase.magnitude, sig);
      const exp3 = Math.max(low, Math.min(high, 3 * Math.floor(exp / 3)));
      const target = this.withPrefix(base, exp3);
      return target.equals(q.units) ? q : this.to(inBase, target);
    } catch {
      return q;
    }
  }
}
