/** The calculator session: parses a line, evaluates it, remembers `ans` and variables. */

import {
  CalcError,
  CalcSyntaxError,
  DomainError,
  EvaluationError,
  NestingError,
  OverflowError,
  UnitMismatchError,
  ZeroDivisionError,
} from './errors';
import { DEFAULT_FLAGS, Evaluator, type Flags, GLUED_UNIT_LETTERS } from './evaluator';
import { type FormatSettings, formatSettings, formatValue } from './formatter';
import { type Node, type Statement, parse, walk } from './parser';
import { Quantity, Unit, type Value } from './quantity';
import { type CustomUnitsSource, Units } from './units';

/** Outcome of one input line. `ok` is false when `error` is set. */
export class Result {
  constructor(
    readonly expr: string,
    readonly ok: boolean,
    readonly text = '',
    readonly alt: string | null = null,
    readonly error: string | null = null,
    readonly value: Value | null = null,
    /** Variable that was assigned, if any. */
    readonly name: string | null = null,
    /** The input didn't parse (as opposed to failing to evaluate). */
    readonly incomplete = false,
    readonly locked = false,
    readonly base: string | null = null,
  ) {}

  get display(): string {
    return this.ok ? this.text : (this.error ?? '');
  }
}

interface Computed {
  value: Value;
  locked: boolean;
  base: string | null;
}

export interface EngineOptions {
  customUnits?: CustomUnitsSource | null;
  format?: FormatSettings;
  degrees?: boolean;
}

function isStackOverflow(exc: unknown): boolean {
  return exc instanceof RangeError && /call stack/i.test(exc.message);
}

/** Evaluate lines of text. Safe to call with anything; never throws. */
export class Engine {
  format: FormatSettings;
  degrees: boolean;
  readonly variables = new Map<string, Value>();
  ans: Value | null = null;
  readonly units: Units;

  constructor(options: EngineOptions = {}) {
    this.units = new Units(options.customUnits ?? null);
    this.format = options.format ?? formatSettings();
    this.degrees = options.degrees ?? false;
  }

  /** Problems found while loading the custom units file. */
  get warnings(): string[] {
    return this.units.warnings;
  }

  // ------------------------------------------------------------------- public API

  /** Evaluate and commit: updates `ans` and any assigned variable. */
  evaluate(text: string): Result {
    const result = this.run(text);
    if (result.ok) {
      this.ans = result.value;
      if (result.name) this.variables.set(result.name, result.value as Value);
    }
    return result;
  }

  /** Evaluate without side effects. null if the text isn't a valid expression (yet). */
  preview(text: string): Result | null {
    const result = this.run(text);
    return result.ok ? result : null;
  }

  /** Re-format an earlier result, e.g. without thousands separators for the clipboard. */
  formatResult(result: Result, settings?: FormatSettings): string {
    if (!result.ok) return result.display;
    return formatValue(result.value as Value, settings ?? this.format, this.units, result.locked, result.base)[0];
  }

  clear(): void {
    this.variables.clear();
    this.ans = null;
  }

  // -------------------------------------------------------------------- internals

  private run(text: string): Result {
    const expr = text.trim();
    let statement: Statement;
    try {
      statement = parse(expr);
    } catch (exc) {
      if (exc instanceof CalcSyntaxError) return new Result(expr, false, '', null, exc.message, null, null, true);
      if (exc instanceof NestingError || isStackOverflow(exc)) {
        return new Result(expr, false, '', null, 'Expression is too deeply nested', null, null, true);
      }
      return new Result(expr, false, '', null, `Couldn't read that (${(exc as Error)?.name ?? 'error'})`, null, null, true);
    }
    try {
      const computed = this.compute(statement);
      const [shown, alt] = formatValue(computed.value, this.format, this.units, computed.locked, computed.base);
      return new Result(expr, true, shown, alt, null, computed.value, statement.assign, false, computed.locked, computed.base);
    } catch (exc) {
      return new Result(expr, false, '', null, this.message(exc));
    }
  }

  private message(exc: unknown): string {
    if (exc instanceof CalcError) return exc.message;
    if (exc instanceof ZeroDivisionError) return 'Division by zero';
    if (exc instanceof OverflowError) return 'Result is too large';
    if (exc instanceof NestingError || isStackOverflow(exc)) return 'Expression is too deeply nested';
    if (exc instanceof RangeError) return 'Result is too large'; // BigInt beyond the engine's limits
    if (exc instanceof DomainError) return 'Not defined for that input';
    // Last line of defence: the app must never crash on input.
    return `Couldn't calculate that (${(exc as Error)?.name ?? 'error'})`;
  }

  /** Evaluate, trying the alternative readings of ambiguous symbols on a unit mismatch. */
  private compute(statement: Statement): Computed {
    const nodes: Node[] = [...walk(statement.expr)];
    for (const conversion of statement.conversions) {
      if (conversion.unit !== null) nodes.push(...walk(conversion.unit));
    }

    const probe = new Evaluator(this.units, this.variables, this.ans, this.degrees);
    const idents = nodes.filter((n): n is Extract<Node, { type: 'ident' }> => n.type === 'ident').map((n) => n.name);
    const hasTemp = idents.some((name) => (name === 'F' || name === 'C') && !this.variables.has(name));
    const hasGlued = nodes.some((n) => n.type === 'num' && n.suffix !== null && GLUED_UNIT_LETTERS.has(n.suffix));
    const unitsPresent =
      idents.some((name) => probe.isUnitName(name)) ||
      idents.some((name) => name === 'ans' && this.ans instanceof Quantity);

    const glued = hasGlued && unitsPresent;
    const attempts: Flags[] = [{ temperatureLetters: false, gluedUnits: glued }];
    if (hasTemp) attempts.push({ temperatureLetters: true, gluedUnits: glued });
    if (hasGlued) {
      attempts.push({ temperatureLetters: false, gluedUnits: !glued });
      if (hasTemp) attempts.push({ temperatureLetters: true, gluedUnits: !glued });
    }

    let firstError: UnitMismatchError | null = null;
    for (const flags of attempts) {
      try {
        return this.computeWith(statement, flags);
      } catch (exc) {
        if (!(exc instanceof UnitMismatchError)) throw exc;
        firstError ??= exc;
      }
    }
    throw firstError as UnitMismatchError;
  }

  private computeWith(statement: Statement, flags: Flags): Computed {
    const evaluator = new Evaluator(this.units, this.variables, this.ans, this.degrees, flags);
    let value = evaluator.eval(statement.expr);
    if (value instanceof Unit) value = this.units.quantity(1, value);

    let locked = false;
    let base: string | null = null;
    for (const conversion of statement.conversions) {
      if (conversion.base !== null) {
        if (value instanceof Quantity) {
          throw new EvaluationError(`Only plain whole numbers can be shown in ${conversion.base}`);
        }
        value = evaluator.int(value);
        base = conversion.base;
        locked = false;
      } else {
        const target = this.targetUnit(conversion.unit as Node, flags);
        value = this.units.convert(value, target);
        base = null;
        locked = true;
      }
    }

    if (value instanceof Quantity && !locked) value = this.units.simplify(value);
    Engine.checkFinite(value);
    return { value, locked, base };
  }

  private targetUnit(node: Node, flags: Flags = DEFAULT_FLAGS): Unit {
    const evaluator = new Evaluator(this.units, new Map(), null, this.degrees, flags, true);
    let target = evaluator.eval(node);
    if (target instanceof Quantity && target.magnitude === 1) target = target.units;
    if (!(target instanceof Unit)) throw new EvaluationError('Expected a unit to convert to');
    return target;
  }

  private static checkFinite(value: Value): void {
    const magnitude = value instanceof Quantity ? value.magnitude : value;
    if (typeof magnitude === 'number') {
      if (Number.isNaN(magnitude)) throw new EvaluationError('Result is undefined');
      if (!Number.isFinite(magnitude)) throw new EvaluationError('Result is too large');
    }
  }
}
