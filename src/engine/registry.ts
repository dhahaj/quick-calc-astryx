/**
 * A small unit registry modelled on Pint: definitions are read from Pint-style lines,
 * any prefix combines with any plain unit, a trailing "s" is accepted as a plural, and an
 * unambiguous case-insensitive match is available as a fallback.
 *
 * Root units are meter, gram, second, ampere, kelvin, mole, candela, plus the
 * dimensionless radian, bit and count, which are kept apart from plain numbers.
 */

import { CalcError } from './errors';
import { tokenize } from './lexer';
import { SI_PREFIXES, type Node, parseTokens } from './parser';
import { Unit } from './quantity';
import { scaleDecimal, toFloat } from './numeric';

export class DefinitionError extends Error {}

export interface LogInfo {
  readonly base: number;
  readonly factor: number;
}

export interface UnitDef {
  readonly name: string;
  readonly symbol: string | null;
  readonly aliases: readonly string[];
  /** Size of one of this unit in root units. For log units: the reference level. */
  readonly factor: number;
  /** Root value = magnitude × factor + offset (°C and °F). */
  readonly offset: number;
  readonly root: ReadonlyMap<string, number>;
  /** Unit names the definition was written in terms of (used to pick tidy result units). */
  readonly reference: readonly string[];
  readonly log: LogInfo | null;
  readonly isDelta: boolean;
}

interface PrefixDef {
  readonly name: string;
  readonly symbol: string;
  readonly value: number;
}

export type Triplet = readonly [prefix: string, unit: string, suffix: string];

const NAME = /^[\p{L}_°Å][\p{L}\p{N}_]*$/u;

function addRoot(target: Map<string, number>, root: ReadonlyMap<string, number>, times: number): void {
  for (const [name, exp] of root) {
    const total = (target.get(name) ?? 0) + exp * times;
    if (total === 0) target.delete(name);
    else target.set(name, total);
  }
}

export class UnitRegistry {
  private readonly units = new Map<string, UnitDef>();
  private readonly casei = new Map<string, Set<string>>();
  private readonly prefixes = new Map<string, PrefixDef>([['', { name: '', symbol: '', value: 1 }]]);
  private readonly prefixKeys: string[] = [''];
  private readonly prefixed = new Map<string, UnitDef>();
  /** Root unit name -> its dimension, or null for the dimensionless roots. */
  private readonly rootDims = new Map<string, string | null>();

  // ------------------------------------------------------------------ definitions

  /** Read several definition lines; throws on the first bad one. */
  defineAll(text: string): void {
    for (const raw of text.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (line) this.define(line);
    }
  }

  /** Define one Pint-style line. A name that already exists is silently kept as it was. */
  define(line: string): void {
    const parts = line.split('=').map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new DefinitionError(`"${line}" is not a definition (expected name = value)`);
    }
    const [name, value, ...rest] = parts;
    if (name.endsWith('-')) {
      this.definePrefix(name, value, rest);
      return;
    }
    if (!NAME.test(name)) throw new DefinitionError(`"${name}" is not a valid unit name`);
    if (this.units.has(name)) return; // redefinitions are ignored, as Pint does when told to

    const symbol = rest[0] && rest[0] !== '_' ? rest[0] : null;
    const aliases = rest.slice(1).filter((a) => a && a !== '_');
    for (const extra of [symbol, ...aliases]) {
      if (extra !== null && /\s/.test(extra)) throw new DefinitionError(`"${extra}" is not a valid unit symbol`);
    }

    const [expr, ...modifiers] = value.split(';').map((p) => p.trim());
    const base = /^\[(\w*)\]$/.exec(expr);
    if (base) {
      const def: UnitDef = {
        name, symbol, aliases, factor: 1, offset: 0, root: new Map([[name, 1]]),
        reference: [], log: null, isDelta: false,
      };
      this.rootDims.set(name, base[1] ? `[${base[1]}]` : null);
      this.register(def);
      return;
    }

    let offset = 0;
    let logBase: number | null = null;
    let logFactor: number | null = null;
    for (const modifier of modifiers) {
      const m = /^(\w+)\s*:\s*(.+)$/.exec(modifier);
      if (!m) throw new DefinitionError(`Can't read "${modifier}"`);
      const number = this.evaluateNumber(m[2]);
      if (m[1] === 'offset') offset = number;
      else if (m[1] === 'logbase') logBase = number;
      else if (m[1] === 'logfactor') logFactor = number;
      else throw new DefinitionError(`Unknown modifier "${m[1]}"`);
    }

    const { magnitude, unit } = this.evaluateExpression(expr);
    const { factor, root } = this.rootOf(unit);
    const log = logBase !== null || logFactor !== null ? { base: logBase ?? 10, factor: logFactor ?? 10 } : null;
    const def: UnitDef = {
      name, symbol, aliases, factor: magnitude * factor, offset, root,
      reference: unit.names(), log, isDelta: false,
    };
    this.register(def);
    if (offset !== 0) {
      // Differences between two readings of an offset scale: 25 °C - 20 °C = 5 Δ°C.
      this.register({
        name: `delta_${name}`,
        symbol: `Δ${symbol ?? name}`,
        aliases: aliases.map((a) => `delta_${a}`),
        factor: def.factor, offset: 0, root, reference: def.reference, log: null, isDelta: true,
      });
    }
  }

  private definePrefix(name: string, value: string, rest: string[]): void {
    const clean = (s: string) => s.replace(/-$/, '');
    const prefix: PrefixDef = {
      name: clean(name),
      symbol: rest[0] && rest[0] !== '_' ? clean(rest[0]) : clean(name),
      value: this.evaluateNumber(value),
    };
    for (const key of [name, ...rest].filter((k) => k && k !== '_').map(clean)) {
      if (!this.prefixes.has(key)) {
        this.prefixes.set(key, prefix);
        this.prefixKeys.push(key);
      }
    }
  }

  private register(def: UnitDef): void {
    for (const key of [def.name, def.symbol, ...def.aliases]) {
      if (key === null || this.units.has(key)) continue;
      this.units.set(key, def);
      const lower = key.toLowerCase();
      const names = this.casei.get(lower) ?? new Set<string>();
      names.add(def.name);
      this.casei.set(lower, names);
    }
  }

  // ------------------------------------------------------------ expression values

  private evaluateNumber(text: string): number {
    const { magnitude, unit } = this.evaluateExpression(text);
    if (unit.size !== 0) throw new DefinitionError(`"${text}" should be a plain number`);
    return magnitude;
  }

  /** Evaluate a unit expression such as `1.37 * thou` or `kilogram * meter / second ** 2`. */
  evaluateExpression(text: string): { magnitude: number; unit: Unit } {
    let node: Node;
    try {
      node = parseTokens(tokenize(text));
    } catch (exc) {
      if (exc instanceof CalcError) throw new DefinitionError(`Can't read "${text}": ${exc.message}`);
      throw exc;
    }
    return this.evaluateNode(node);
  }

  private evaluateNode(node: Node): { magnitude: number; unit: Unit } {
    switch (node.type) {
      case 'num': {
        let magnitude = toFloat(node.value);
        if (node.suffix !== null) magnitude = scaleDecimal(magnitude, SI_PREFIXES[node.suffix]);
        return { magnitude, unit: Unit.none };
      }
      case 'ident': {
        if (node.name === 'pi') return { magnitude: Math.PI, unit: Unit.none };
        const canonical = this.getName(node.name);
        if (canonical === null) throw new DefinitionError(`'${node.name}' is not defined in the unit registry`);
        return { magnitude: 1, unit: Unit.of(canonical) };
      }
      case 'unary': {
        const value = this.evaluateNode(node.operand);
        if (node.op === '-') return { magnitude: -value.magnitude, unit: value.unit };
        if (node.op === '+') return value;
        break;
      }
      case 'implicit': {
        let result = { magnitude: 1, unit: Unit.none };
        for (const factor of node.factors) {
          const value = this.evaluateNode(factor);
          result = { magnitude: result.magnitude * value.magnitude, unit: result.unit.mul(value.unit) };
        }
        return result;
      }
      case 'binary': {
        const a = this.evaluateNode(node.left);
        const b = this.evaluateNode(node.right);
        if (node.op === '*') return { magnitude: a.magnitude * b.magnitude, unit: a.unit.mul(b.unit) };
        if (node.op === '/') {
          if (b.magnitude === 0) throw new DefinitionError('Division by zero');
          return { magnitude: a.magnitude / b.magnitude, unit: a.unit.div(b.unit) };
        }
        if (node.op === '^') {
          if (b.unit.size !== 0) throw new DefinitionError('An exponent must be a plain number');
          return { magnitude: a.magnitude ** b.magnitude, unit: a.unit.pow(b.magnitude) };
        }
        if ((node.op === '+' || node.op === '-') && a.unit.size === 0 && b.unit.size === 0) {
          return { magnitude: node.op === '+' ? a.magnitude + b.magnitude : a.magnitude - b.magnitude, unit: Unit.none };
        }
        break;
      }
      default:
        break;
    }
    throw new DefinitionError("Definitions can only multiply, divide and raise units to powers");
  }

  // ---------------------------------------------------------------------- lookup

  has(key: string): boolean {
    return this.units.has(key);
  }

  /** All (prefix, unit, suffix) readings of a name, in Pint's order. */
  parseUnitName(name: string, caseSensitive = true): Triplet[] {
    const out: Triplet[] = [];
    const seen = new Set<string>();
    const push = (prefix: PrefixDef, def: UnitDef, suffix: string) => {
      if (prefix.name !== '' && (def.offset !== 0 || def.log !== null || def.isDelta)) return;
      const key = `${prefix.name}|${def.name}|${suffix}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push([prefix.name, def.name, suffix]);
      }
    };
    for (const suffix of ['', 's']) {
      if (suffix && !name.endsWith(suffix)) continue;
      for (const key of this.prefixKeys) {
        if (!name.startsWith(key)) continue;
        const rest = name.slice(key.length, name.length - suffix.length);
        if (!rest || (suffix && Array.from(rest).length === 1)) continue;
        const prefix = this.prefixes.get(key) as PrefixDef;
        if (caseSensitive) {
          const def = this.units.get(rest);
          if (def) push(prefix, def, suffix);
        } else {
          for (const real of this.casei.get(rest.toLowerCase()) ?? []) {
            push(prefix, this.units.get(real) as UnitDef, suffix);
          }
        }
      }
    }
    return out;
  }

  /** Canonical name for a name, symbol, alias or prefixed form; null if unknown. */
  getName(name: string): string | null {
    const exact = this.units.get(name);
    if (exact) return exact.name;
    const candidates = this.parseUnitName(name);
    if (candidates.length === 0) return null;
    const [prefix, unit] = candidates[0];
    return prefix ? this.ensurePrefixed(prefix, unit).name : unit;
  }

  private ensurePrefixed(prefixName: string, unitName: string): UnitDef {
    const name = prefixName + unitName;
    const known = this.units.get(name) ?? this.prefixed.get(name);
    if (known) return known;
    const prefix = this.prefixes.get(prefixName) as PrefixDef;
    const unit = this.units.get(unitName) as UnitDef;
    const def: UnitDef = {
      name,
      symbol: prefix.symbol + (unit.symbol ?? unit.name),
      aliases: [],
      factor: prefix.value * unit.factor,
      offset: 0,
      root: unit.root,
      reference: [unitName],
      log: null,
      isDelta: false,
    };
    this.prefixed.set(name, def);
    return def;
  }

  /** The definition behind a canonical (possibly prefixed) name. */
  def(name: string): UnitDef {
    const def = this.units.get(name) ?? this.prefixed.get(name);
    if (def) return def;
    const canonical = this.getName(name);
    if (canonical === null) throw new DefinitionError(`'${name}' is not defined in the unit registry`);
    return (this.units.get(canonical) ?? this.prefixed.get(canonical)) as UnitDef;
  }

  /** Display symbol: prefix symbol + unit symbol, falling back to names. */
  getSymbol(name: string): string {
    const candidates = this.parseUnitName(name);
    if (candidates.length === 0) return name;
    const [prefix, unit] = candidates[0];
    const prefixDef = this.prefixes.get(prefix) as PrefixDef;
    const unitDef = this.units.get(unit) as UnitDef;
    return prefixDef.symbol + (unitDef.symbol ?? unitDef.name);
  }

  // -------------------------------------------------------------- root and dimension

  /** Scale and root units of a whole container. */
  rootOf(unit: Unit): { factor: number; root: Map<string, number> } {
    let factor = 1;
    const root = new Map<string, number>();
    for (const [name, exp] of unit.items) {
      const def = this.def(name);
      factor *= def.factor ** exp;
      addRoot(root, def.root, exp);
    }
    return { factor, root };
  }

  /** Dimensionality as a stable key, e.g. "[length]^1 [time]^-1"; "" for dimensionless. */
  dimensionKey(unit: Unit): string {
    const dims = new Map<string, number>();
    for (const [name, exp] of this.rootOf(unit).root) {
      const dim = this.rootDims.get(name);
      if (dim) dims.set(dim, (dims.get(dim) ?? 0) + exp);
    }
    return [...dims]
      .filter(([, e]) => e !== 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([d, e]) => `${d}^${e}`)
      .join(' ');
  }
}
