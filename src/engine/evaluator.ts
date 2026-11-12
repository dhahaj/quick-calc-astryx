/** Walks the AST and computes a value: an exact int (bigint), a float, a quantity or a unit. */

import { EvaluationError, OverflowError, UnitMismatchError } from './errors';
import * as num from './numeric';
import { type Scalar, isInt, isScalar, toFloat } from './numeric';
import { FUNCTION_NAMES, type Node, SI_PREFIXES } from './parser';
import { Quantity, Unit, type Value } from './quantity';
import {
  DimensionalityError,
  LogarithmicUnitCalculusError,
  OffsetUnitCalculusError,
  type Units,
} from './units';

/** Prefix letters that are also unit symbols: metre, gauss, tesla. */
export const GLUED_UNIT_LETTERS: ReadonlySet<string> = new Set(['m', 'G', 'T']);

const MAX_INT_BITS = 20_000;
const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI, e: Math.E };
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** How to read the genuinely ambiguous symbols on this attempt. */
export interface Flags {
  /** F and C are °F and °C rather than farad and coulomb. */
  readonly temperatureLetters: boolean;
  /** 10m is ten metres rather than ten milli. */
  readonly gluedUnits: boolean;
}

export const DEFAULT_FLAGS: Flags = { temperatureLetters: false, gluedUnits: false };

type Fn = (...args: Value[]) => Value;

const ARITY: Readonly<Record<string, readonly [number, number | null]>> = {
  sqrt: [1, 1], cbrt: [1, 1], abs: [1, 1], round: [1, 2], floor: [1, 1],
  ceil: [1, 1], log: [1, 2], ln: [1, 1], log2: [1, 1], exp: [1, 1],
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1],
  atan: [1, 1], atan2: [2, 2], min: [1, null], max: [1, null],
};

/** Kill float residue from cancellation, so 0.3 - 0.1 - 0.2 is 0 and not -2.8e-17. */
function snap(result: Scalar, a: Scalar, b: Scalar): Scalar {
  if (typeof result === 'number' && result !== 0) {
    const scale = Math.max(Math.abs(toFloat(a)), Math.abs(toFloat(b)));
    if (Math.abs(result) < scale * 1e-14) return 0;
  }
  return result;
}

export class Evaluator {
  constructor(
    private readonly units: Units,
    private readonly variables: ReadonlyMap<string, Value>,
    private readonly ans: Value | null,
    private readonly degrees: boolean,
    private readonly flags: Flags = DEFAULT_FLAGS,
    private readonly unitOnly = false,
  ) {}

  // --------------------------------------------------------------------- dispatch

  eval(node: Node): Value {
    switch (node.type) {
      case 'num':
        return this.number_(node);
      case 'ident':
        return this.resolve(node.name);
      case 'implicit':
        return this.implicit(node.factors);
      case 'binary':
        return this.binary(node.op, node.left, node.right);
      case 'unary': {
        const value = this.eval(node.operand);
        if (node.op === '+') return value;
        if (node.op === '-') {
          // Negate the magnitude directly so -40 °F stays -40 °F.
          if (value instanceof Quantity) return new Quantity(-value.magnitude, value.units);
          return this.mul(-1n, value);
        }
        return ~this.int(value);
      }
      case 'percent':
        return this.div(this.eval(node.operand), 100n);
      case 'call':
        return this.call(node.name, node.args);
      default:
        throw new EvaluationError("Couldn't understand that expression");
    }
  }

  /** True if `name` would resolve to a unit (not a variable or constant). */
  isUnitName(name: string): boolean {
    if (this.variables.has(name) || name === 'ans' || Object.hasOwn(CONSTANTS, name)) return false;
    return this.units.lookup(name, this.flags.temperatureLetters) !== null;
  }

  resolve(name: string): Value {
    if (this.unitOnly) {
      const unit = this.units.lookup(name, this.flags.temperatureLetters);
      if (unit === null) throw new EvaluationError(`Unknown unit '${name}'`);
      return unit;
    }
    const variable = this.variables.get(name);
    if (variable !== undefined) return variable;
    if (name === 'ans') {
      if (this.ans === null) throw new EvaluationError('No previous result yet');
      return this.ans;
    }
    if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name];
    const unit = this.units.lookup(name, this.flags.temperatureLetters);
    if (unit !== null) return unit;
    if (FUNCTION_NAMES.has(name)) throw new EvaluationError(`${name} needs parentheses, as in ${name}(...)`);
    throw new EvaluationError(`Unknown name '${name}'`);
  }

  private number_(node: Extract<Node, { type: 'num' }>): Value {
    if (node.suffix === null || this.unitOnly) return node.value;
    if (this.flags.gluedUnits && GLUED_UNIT_LETTERS.has(node.suffix)) {
      const unit = this.units.lookup(node.suffix);
      if (unit !== null) return this.units.quantity(node.value, unit);
    }
    const exp = SI_PREFIXES[node.suffix];
    if (isInt(node.value)) {
      if (exp >= 0) return node.value * 10n ** BigInt(exp);
      return Number(`${node.value}e${exp}`);
    }
    // Scaled as decimal text, not by float multiplication, so no stray digits appear.
    return num.scaleDecimal(node.value, exp);
  }

  private implicit(factors: readonly Node[]): Value {
    const compound = this.compound(factors);
    if (compound !== null) return compound;
    let result = this.eval(factors[0]);
    for (const factor of factors.slice(1)) result = this.mul(result, this.eval(factor));
    return result;
  }

  /** `5 ft 3 in` style input: number/unit pairs of one kind are added up. */
  private compound(factors: readonly Node[]): Value | null {
    if (factors.length < 4 || factors.length % 2) return null;
    const parts: Quantity[] = [];
    for (let i = 0; i < factors.length; i += 2) {
      const number = factors[i];
      const ident = factors[i + 1];
      if (!(number.type === 'num' && number.suffix === null && ident.type === 'ident')) return null;
      if (!this.isUnitName(ident.name)) return null;
      const unit = this.resolve(ident.name) as Unit;
      if (parts.length && !this.units.sameKind(parts[0].units, unit)) return null;
      parts.push(this.units.quantity(number.value, unit));
    }
    let total: Value = parts[0];
    for (const part of parts.slice(1)) total = this.add(total, part, 1);
    return total;
  }

  private binary(op: string, leftNode: Node, rightNode: Node): Value {
    const left = this.eval(leftNode);
    if (op === '+' || op === '-') {
      const sign = op === '+' ? 1 : -1;
      if (rightNode.type === 'percent') {
        // Calculator-style: 200 + 10% is 200 plus 10% of 200.
        const pct = this.number(this.eval(rightNode.operand), 'A percentage');
        return this.add(left, this.div(this.mul(left, pct), 100n), sign);
      }
      return this.add(left, this.eval(rightNode), sign);
    }
    const right = this.eval(rightNode);
    switch (op) {
      case '*':
        return this.mul(left, right);
      case '/':
        return this.div(left, right);
      case '^':
        return this.power(left, right);
      case '||':
        return this.parallel(left, right);
      case 'mod':
        return this.modulo(left, right);
      default:
        break;
    }
    const a = this.int(left);
    const b = this.int(right);
    if (op === '&') return a & b;
    if (op === '|') return a | b;
    if (op === 'xor') return a ^ b;
    if (b < 0n) throw new EvaluationError("Can't shift by a negative amount");
    if (op === '>>') {
      if (b > BigInt(num.bitLength(a) + 1)) return a < 0n ? -1n : 0n;
      return a >> b;
    }
    if (b + BigInt(num.bitLength(a)) > BigInt(MAX_INT_BITS)) throw new EvaluationError('Result is too large');
    return a << b;
  }

  // ------------------------------------------------------------------- arithmetic

  /** Unit -> Quantity(1, unit); anything else unchanged. */
  private q(x: Value): Scalar | Quantity {
    return x instanceof Unit ? new Quantity(1, x) : x;
  }

  private pint<T>(fn: () => T, verb: string, a: Value, b: Value): T {
    if (this.units.isLog(a) || this.units.isLog(b)) {
      throw new EvaluationError("Can't do arithmetic on dB values; convert to linear units first");
    }
    try {
      return fn();
    } catch (exc) {
      if (exc instanceof DimensionalityError) {
        throw new UnitMismatchError(`Can't ${verb} ${this.units.dimensionName(a)} and ${this.units.dimensionName(b)}`);
      }
      if (exc instanceof OffsetUnitCalculusError) {
        throw new EvaluationError("Can't do that with °C/°F directly; convert to K first");
      }
      if (exc instanceof LogarithmicUnitCalculusError) {
        throw new EvaluationError("Can't do arithmetic on dB values; convert to linear units first");
      }
      throw exc;
    }
  }

  /** Coerce to a plain number; angles and pure ratios are accepted. */
  number(x: Value, what = 'This'): Scalar {
    const value = this.q(x);
    if (isScalar(value)) return value;
    if (!this.units.dimensionality(value.units)) {
      const root = this.units.toRootUnits(value);
      if (root.units.names().every((n) => n === 'radian')) return root.magnitude;
    }
    throw new UnitMismatchError(`${what} must be a plain number, not ${this.units.dimensionName(value)}`);
  }

  int(x: Value): bigint {
    if (typeof x === 'bigint') return x;
    if (typeof x === 'number' && Number.isInteger(x) && Math.abs(x) < 2 ** 63) return BigInt(x);
    throw new EvaluationError('Bitwise and base operations need whole numbers');
  }

  add(x: Value, y: Value, sign: 1 | -1): Value {
    const a = this.q(x);
    const b = this.q(y);
    const verb = sign > 0 ? 'add' : 'subtract';
    if (isScalar(a) && isScalar(b)) {
      return snap(sign > 0 ? num.add(a, b) : num.sub(a, b), a, b);
    }
    const mismatch = () =>
      new UnitMismatchError(`Can't ${verb} ${this.units.dimensionName(a)} and ${this.units.dimensionName(b)}`);
    if (isScalar(a) || isScalar(b)) throw mismatch();
    if (!this.units.sameKind(a.units, b.units)) throw mismatch();
    if (this.units.isOffset(a.units) && this.units.isOffset(b.units)) {
      // 20 °C + 5 °C: read the second value as a difference, not a second thermometer.
      if (!a.units.equals(b.units)) throw new EvaluationError('Use the same temperature unit on both sides');
      if (sign > 0) return new Quantity(a.magnitude + b.magnitude, a.units);
      return new Quantity(a.magnitude - b.magnitude, Unit.of(`delta_${a.units.names()[0]}`));
    }
    return this.pint(() => this.units.addQuantities(a, b, sign), verb, a, b);
  }

  mul(a: Value, b: Value): Value {
    if (isScalar(a) && isScalar(b)) return num.mul(a, b);
    if (isScalar(a) && b instanceof Unit) return this.units.quantity(a, b);
    if (a instanceof Unit && isScalar(b)) return this.units.quantity(b, a);
    return this.pint(() => this.units.multiply(a, b), 'multiply', a, b);
  }

  div(a: Value, b: Value): Value {
    const divisor = b instanceof Quantity ? b.magnitude : b;
    if (isScalar(divisor) && num.isZero(divisor)) throw new EvaluationError('Division by zero');
    if (isScalar(a) && isScalar(b)) {
      if (isInt(a) && isInt(b) && a % b === 0n) return a / b;
      return num.trueDiv(a, b);
    }
    return this.pint(() => this.units.divide(a, b), 'divide', a, b);
  }

  modulo(x: Value, y: Value): Value {
    const a = this.q(x);
    const b = this.q(y);
    const divisor = b instanceof Quantity ? b.magnitude : b;
    if (num.isZero(divisor)) throw new EvaluationError('Division by zero');
    if (isScalar(a) !== isScalar(b)) {
      throw new UnitMismatchError(
        `Can't take the remainder of ${this.units.dimensionName(a)} and ${this.units.dimensionName(b)}`,
      );
    }
    if (isScalar(a) && isScalar(b)) return num.mod(a, b);
    return this.pint(() => this.units.modulo(a as Quantity, b as Quantity), 'take the remainder of', a, b);
  }

  power(base: Value, exponent: Value): Value {
    const exp = this.number(exponent, 'An exponent');
    if (!isScalar(base)) {
      return this.pint(() => this.units.power(base, toFloat(exp)), 'raise', base, exp);
    }
    if (isInt(base) && isInt(exp) && exp >= 0n) {
      const big = base < 0n ? -base : base;
      if (big > 1n && exp * BigInt(num.bitLength(base)) > BigInt(MAX_INT_BITS)) {
        return num.pow(toFloat(base), toFloat(exp)); // overflows to "Result is too large"
      }
      return base ** exp;
    }
    if (num.isZero(base) && num.isNegative(exp)) throw new EvaluationError('Division by zero');
    const b = toFloat(base);
    const e = toFloat(exp);
    if (b < 0 && !Number.isInteger(e)) throw new EvaluationError('Result is not a real number');
    return num.pow(b, e);
  }

  parallel(x: Value, y: Value): Value {
    const a = this.q(x);
    const b = this.q(y);
    if (isScalar(a) && isScalar(b)) {
      const total = num.add(a, b);
      if (num.isZero(total)) throw new EvaluationError('Division by zero');
      return num.trueDiv(num.mul(a, b), total);
    }
    if (isScalar(a) || isScalar(b) || !this.units.sameKind(a.units, b.units)) {
      throw new UnitMismatchError(
        `Can't put ${this.units.dimensionName(a)} and ${this.units.dimensionName(b)} in parallel`,
      );
    }
    const am = a.magnitude;
    const bm = this.pint(() => this.units.to(b, a.units), 'combine', a, b).magnitude;
    if (am + bm === 0) throw new EvaluationError('Division by zero');
    return new Quantity((am * bm) / (am + bm), a.units);
  }

  // -------------------------------------------------------------------- functions

  private call(name: string, argNodes: readonly Node[]): Value {
    const [low, high] = ARITY[name];
    const count = argNodes.length;
    if (count < low || (high !== null && count > high)) {
      let expected: string;
      if (high === null) expected = `at least ${low}`;
      else if (low === high) expected = String(low);
      else expected = `${low} or ${high}`;
      const noun = expected === '1' ? 'argument' : 'arguments';
      throw new EvaluationError(`${name} takes ${expected} ${noun}`);
    }
    const args = argNodes.map((arg) => this.q(this.eval(arg)));
    const fn = this.functions[name];
    return fn(...args);
  }

  private onMagnitude(x: Value, scalarFn: (m: Scalar) => Scalar, floatFn: (m: number) => number): Value {
    if (x instanceof Quantity) return new Quantity(floatFn(x.magnitude), x.units);
    return scalarFn(x as Scalar);
  }

  private positive(x: Value, name: string): Scalar {
    const value = this.number(x, `The argument of ${name}`);
    if (!num.isNegative(value) && !num.isZero(value)) return value;
    throw new EvaluationError(`${name} needs a positive number`);
  }

  private angle(x: Value, name: string): number {
    if (x instanceof Quantity) {
      if (!this.units.isAngle(x.units)) {
        throw new UnitMismatchError(`${name} needs an angle or a plain number, not ${this.units.dimensionName(x)}`);
      }
      return this.units.to(x, this.units.radian).magnitude;
    }
    const value = toFloat(x as Scalar);
    return this.degrees ? value * DEG_TO_RAD : value;
  }

  private fromRadians(value: number): number {
    return this.degrees ? num.roundFloat(value * RAD_TO_DEG, 12) : value;
  }

  private unitInterval(x: Value, name: string): number {
    const value = toFloat(this.number(x, `The argument of ${name}`));
    if (!(value >= -1 && value <= 1)) throw new EvaluationError(`${name} needs a value between -1 and 1`);
    return value;
  }

  private extreme(args: Value[], pickMax: boolean, name: string): Value {
    const better = (a: Scalar, b: Scalar) => (pickMax ? num.compare(a, b) > 0 : num.compare(a, b) < 0);
    if (args.every(isScalar)) {
      let best = args[0] as Scalar;
      for (const a of args.slice(1) as Scalar[]) if (better(a, best)) best = a;
      return best;
    }
    if (args.some(isScalar)) throw new UnitMismatchError(`${name} can't mix plain numbers and units`);
    const first = args[0] as Quantity;
    const keyed = args.map((a) => this.pint(() => this.units.to(a as Quantity, first.units), 'compare', first, a).magnitude);
    let index = 0;
    keyed.forEach((k, i) => {
      if (better(k, keyed[index])) index = i;
    });
    return args[index];
  }

  private readonly functions: Readonly<Record<string, Fn>> = {
    sqrt: (x) => {
      if (x instanceof Quantity) {
        if (x.magnitude < 0) throw new EvaluationError("Can't take the square root of a negative number");
        return this.pint(() => this.units.power(x, 0.5), 'take the root of', x, 2n);
      }
      const v = x as Scalar;
      if (num.isNegative(v)) throw new EvaluationError("Can't take the square root of a negative number");
      if (isInt(v)) {
        const root = num.isqrt(v);
        if (root * root === v) return root;
      }
      return Math.sqrt(toFloat(v));
    },
    cbrt: (x) => {
      if (x instanceof Quantity) return this.pint(() => this.units.power(x, 1 / 3), 'take the root of', x, 3n);
      const v = x as Scalar;
      const result = Math.cbrt(toFloat(v));
      if (isInt(v)) {
        const r = BigInt(Math.round(result));
        if (r ** 3n === v) return r;
      }
      return result;
    },
    abs: (x) => this.onMagnitude(x, num.absScalar, Math.abs),
    floor: (x) => this.onMagnitude(x, (m) => (isInt(m) ? m : num.floatToInt(Math.floor(m))), Math.floor),
    ceil: (x) => this.onMagnitude(x, (m) => (isInt(m) ? m : num.floatToInt(Math.ceil(m))), Math.ceil),
    round: (x, digits = 0n) => {
      const big = this.int(this.number(digits, 'The number of decimals'));
      const places = Number(big < -1000n ? -1000n : big > 1000n ? 1000n : big);
      if (places <= 0) {
        return this.onMagnitude(
          x,
          (m) => (isInt(m) ? num.roundInt(m, places) : num.floatToInt(num.roundFloat(m, places))),
          (m) => Number(num.floatToInt(num.roundFloat(m, places))),
        );
      }
      return this.onMagnitude(x, (m) => (isInt(m) ? m : num.roundFloat(m, places)), (m) => num.roundFloat(m, places));
    },
    log: (x, base = 10n) => {
      const value = this.positive(x, 'log');
      const b = this.positive(base, 'log');
      if (num.compare(b, 10) === 0) {
        return isInt(value) && !Number.isFinite(Number(value)) ? num.lnScalar(value) / Math.LN10 : Math.log10(toFloat(value));
      }
      if (num.compare(b, 1) === 0) throw new EvaluationError("log base can't be 1");
      return num.lnScalar(value) / num.lnScalar(b);
    },
    ln: (x) => num.lnScalar(this.positive(x, 'ln')),
    log2: (x) => {
      const value = this.positive(x, 'log2');
      return isInt(value) && !Number.isFinite(Number(value)) ? num.lnScalar(value) / Math.LN2 : Math.log2(toFloat(value));
    },
    exp: (x) => checkedExp(toFloat(this.number(x, 'The argument of exp'))),
    sin: (x) => num.roundFloat(Math.sin(this.angle(x, 'sin')), 15),
    cos: (x) => num.roundFloat(Math.cos(this.angle(x, 'cos')), 15),
    tan: (x) => {
      const angle = this.angle(x, 'tan');
      if (Math.abs(Math.cos(angle)) < 1e-15) throw new EvaluationError('tan is undefined at that angle');
      return num.roundFloat(Math.tan(angle), 15);
    },
    asin: (x) => this.fromRadians(Math.asin(this.unitInterval(x, 'asin'))),
    acos: (x) => this.fromRadians(Math.acos(this.unitInterval(x, 'acos'))),
    atan: (x) => this.fromRadians(Math.atan(toFloat(this.number(x, 'The argument of atan')))),
    atan2: (y, x) => {
      let yv: Value = y;
      let xv: Value = x;
      if (y instanceof Quantity && x instanceof Quantity) {
        xv = this.pint(() => this.units.to(x, y.units), 'compare', y, x).magnitude;
        yv = y.magnitude;
      }
      const a = toFloat(this.number(yv, 'The argument of atan2'));
      const b = toFloat(this.number(xv, 'The argument of atan2'));
      return this.fromRadians(Math.atan2(a, b));
    },
    min: (...args) => this.extreme(args, false, 'min'),
    max: (...args) => this.extreme(args, true, 'max'),
  };
}

function checkedExp(value: number): number {
  const result = Math.exp(value);
  if (!Number.isFinite(result) && Number.isFinite(value)) throw new OverflowError('math range error');
  return result;
}
