/** Error types raised by the engine. Every message is meant to be shown to the user as-is. */

/** Base class for all user-facing calculation errors. */
export class CalcError extends Error {
  readonly pos: number | null;

  constructor(message: string, pos: number | null = null) {
    super(message);
    this.name = new.target.name;
    this.pos = pos;
  }
}

/** The input could not be tokenized or parsed (often just incomplete). */
export class CalcSyntaxError extends CalcError {}

/** The input parsed fine but could not be evaluated. */
export class EvaluationError extends CalcError {}

/** Units did not line up. The engine may retry with another reading of ambiguous symbols. */
export class UnitMismatchError extends EvaluationError {}

// Internal arithmetic failures, mirroring the Python exceptions the original engine relied on.
// The engine turns each of them into a fixed message.

/** A float result left the double range ("Result is too large"). */
export class OverflowError extends Error {}

/** Division by zero inside an arithmetic helper ("Division by zero"). */
export class ZeroDivisionError extends Error {}

/** A math function was called outside its domain ("Not defined for that input"). */
export class DomainError extends Error {}

/** Expression nesting exceeded the parser's limit ("Expression is too deeply nested"). */
export class NestingError extends Error {}
