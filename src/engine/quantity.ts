/** Unit containers and quantities: the value types the evaluator works with besides plain numbers. */

import type { Scalar } from './numeric';

/**
 * A product of named units raised to powers, e.g. {kilometer: 1, hour: -1}.
 * Keys are canonical unit names; insertion order is kept for display, as in Pint.
 */
export class Unit {
  readonly items: ReadonlyMap<string, number>;

  constructor(entries: Iterable<readonly [string, number]> = []) {
    const map = new Map<string, number>();
    for (const [name, exp] of entries) {
      const total = (map.get(name) ?? 0) + exp;
      if (total === 0) map.delete(name);
      else map.set(name, total);
    }
    this.items = map;
  }

  static of(name: string, exp = 1): Unit {
    return new Unit([[name, exp]]);
  }

  static readonly none = new Unit();

  get size(): number {
    return this.items.size;
  }

  names(): string[] {
    return [...this.items.keys()];
  }

  /** The single [name, exponent] pair, or null if there isn't exactly one. */
  only(): [string, number] | null {
    if (this.items.size !== 1) return null;
    return this.items.entries().next().value as [string, number];
  }

  mul(other: Unit): Unit {
    return new Unit([...this.items, ...other.items]);
  }

  div(other: Unit): Unit {
    return new Unit([...this.items, ...[...other.items].map(([n, e]) => [n, -e] as const)]);
  }

  pow(exp: number): Unit {
    if (exp === 0) return Unit.none;
    return new Unit([...this.items].map(([n, e]) => [n, e * exp] as const));
  }

  equals(other: Unit): boolean {
    if (this.items.size !== other.items.size) return false;
    for (const [name, exp] of this.items) {
      if (other.items.get(name) !== exp) return false;
    }
    return true;
  }
}

/** A magnitude with units. Magnitudes are always floats here. */
export class Quantity {
  constructor(
    readonly magnitude: number,
    readonly units: Unit,
  ) {}
}

/** Anything an expression can evaluate to. */
export type Value = Scalar | Quantity | Unit;
