import { expect } from 'vitest';

import { Engine, Quantity, type Result, formatSettings } from '../src/engine';
import type { FormatSettings } from '../src/engine';

/** Thin test helper around one shared Engine, reset before each use. */
export class Calc {
  constructor(readonly engine: Engine) {}

  run(text: string): Result {
    return this.engine.evaluate(text);
  }

  ok(text: string): Result {
    const result = this.engine.evaluate(text);
    if (!result.ok) throw new Error(`${JSON.stringify(text)} failed: ${result.error}`);
    return result;
  }

  /** Magnitude of the result, whatever its unit. */
  num(text: string): number | bigint {
    const value = this.ok(text).value;
    if (value instanceof Quantity) return value.magnitude;
    return value as number | bigint;
  }

  text(text: string): string {
    return this.ok(text).text;
  }

  err(text: string): string {
    const result = this.engine.evaluate(text);
    if (result.ok) throw new Error(`${JSON.stringify(text)} unexpectedly gave ${JSON.stringify(result.text)}`);
    expect(result.error).toBeTruthy();
    return result.error as string;
  }

  fmt(overrides: Partial<FormatSettings>): void {
    this.engine.format = formatSettings(overrides);
  }
}

const shared = new Engine();

export function calc(): Calc {
  shared.clear();
  shared.format = formatSettings();
  shared.degrees = false;
  return new Calc(shared);
}

/** pytest.approx: relative 1e-6 or absolute 1e-12 by default. */
export function approx(actual: number | bigint, expected: number, opts: { rel?: number; abs?: number } = {}): void {
  const a = Number(actual);
  const rel = opts.rel ?? (opts.abs !== undefined ? 0 : 1e-6);
  const abs = opts.abs ?? 1e-12;
  const tolerance = Math.max(rel * Math.abs(expected), abs);
  if (!(Math.abs(a - expected) <= tolerance)) {
    throw new Error(`expected ${a} to be approximately ${expected} (±${tolerance})`);
  }
}
