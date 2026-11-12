/**
 * Recursive-descent parser. Produces a small AST; nothing is evaluated here.
 *
 * Precedence, loosest to tightest:
 *
 *     name = ...                assignment (statement level)
 *     to / in / ->              conversion (statement level)
 *     |                         bitwise or
 *     xor                       bitwise xor
 *     &                         bitwise and
 *     << >>                     shifts
 *     + -                       add, subtract
 *     * / mod %                 multiply, divide, modulo
 *     ||                        parallel
 *     - + ~                     unary
 *     (adjacency)               implicit multiplication: 2pi, 2(3+4), 9 V
 *     ^ **                      power (right associative)
 *     %                         postfix percent
 */

import { CalcSyntaxError, NestingError } from './errors';
import { type Token, token, tokenize } from './lexer';
import type { Scalar } from './numeric';

/** Exponent of ten for each single-letter SI prefix accepted directly after a number. */
export const SI_PREFIXES: Readonly<Record<string, number>> = {
  f: -15,
  p: -12,
  n: -9,
  u: -6,
  µ: -6,
  m: -3,
  k: 3,
  M: 6,
  G: 9,
  T: 12,
};

export const FUNCTION_NAMES: ReadonlySet<string> = new Set([
  'sqrt', 'cbrt', 'abs', 'round', 'floor', 'ceil', 'log', 'ln', 'log2', 'exp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'min', 'max',
]);
export const CONSTANT_NAMES: ReadonlySet<string> = new Set(['pi', 'e', 'ans']);
export const BASE_TARGETS: ReadonlySet<string> = new Set(['hex', 'bin', 'oct', 'dec']);
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...FUNCTION_NAMES, ...CONSTANT_NAMES, ...BASE_TARGETS, 'in', 'to', 'xor', 'mod',
]);

// A line starting with one of these is applied to the previous answer.
const LEADING_OPS = new Set(['*', '/', '+', '^', '**', '||', '&', '|', '<<', '>>']);
const LEADING_KWS = new Set(['to', 'xor', 'mod']);
const TARGET_OPS = new Set(['*', '/', '^', '**', '-']);

/** Deeper than this and the expression is refused rather than risking the call stack. */
const MAX_DEPTH = 250;

// ----------------------------------------------------------------------------- AST

export type Node =
  | { readonly type: 'num'; readonly value: Scalar; readonly raw: string; readonly suffix: string | null }
  | { readonly type: 'ident'; readonly name: string }
  | { readonly type: 'unary'; readonly op: string; readonly operand: Node }
  | { readonly type: 'binary'; readonly op: string; readonly left: Node; readonly right: Node }
  | { readonly type: 'percent'; readonly operand: Node }
  | { readonly type: 'call'; readonly name: string; readonly args: readonly Node[] }
  | { readonly type: 'implicit'; readonly factors: readonly Node[] };

/** One `to <target>` step. Exactly one of `base` / `unit` is set. */
export interface Conversion {
  readonly base: string | null;
  readonly unit: Node | null;
}

export interface Statement {
  readonly expr: Node;
  readonly assign: string | null;
  readonly conversions: readonly Conversion[];
}

// -------------------------------------------------------------------------- parsing

function isOp(tok: Token, ...ops: string[]): boolean {
  return tok.kind === 'OP' && ops.includes(tok.text);
}

/** True if `tokens` look like a unit expression such as `km/h` or `m^2`. */
function validTarget(tokens: readonly Token[]): boolean {
  if (tokens.length === 0 || (tokens[0].kind !== 'IDENT' && tokens[0].kind !== 'LP')) return false;
  for (const tok of tokens) {
    if (tok.kind === 'IDENT' || tok.kind === 'NUM' || tok.kind === 'LP' || tok.kind === 'RP') continue;
    if (tok.kind === 'OP' && TARGET_OPS.has(tok.text)) continue;
    return false;
  }
  return true;
}

/**
 * Index of the rightmost top-level conversion keyword, or null.
 *
 * `to` and `->` are always keywords. `in` is a keyword only when something comes before
 * it and a plain unit expression follows it; otherwise it is the inch.
 */
function findConversion(tokens: readonly Token[]): number | null {
  let depth = 0;
  let best: number | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.kind === 'LP') depth += 1;
    else if (tok.kind === 'RP') depth -= 1;
    else if ((tok.kind === 'KW' && tok.text === 'to') || isOp(tok, '->')) {
      if (depth > 0) throw new CalcSyntaxError("Conversions can't go inside parentheses", tok.pos);
      best = i;
    } else if (tok.kind === 'IDENT' && tok.text === 'in' && depth === 0 && i > 0) {
      if (validTarget(tokens.slice(i + 1))) best = i;
    }
  }
  return best;
}

class Parser {
  private readonly toks: Token[];
  private i = 0;
  private depth = 0;

  constructor(tokens: readonly Token[]) {
    const last = tokens[tokens.length - 1];
    const endPos = last ? last.pos + Array.from(last.text).length : 0;
    this.toks = [...tokens, token('END', '', endPos)];
  }

  // -- helpers
  private get tok(): Token {
    return this.toks[this.i];
  }

  private peek(offset = 1): Token {
    return this.toks[Math.max(0, Math.min(this.i + offset, this.toks.length - 1))];
  }

  private advance(): Token {
    const tok = this.toks[this.i];
    if (tok.kind !== 'END') this.i += 1;
    return tok;
  }

  /** Kind check that, unlike `this.tok.kind`, is never narrowed across advance(). */
  private at(kind: Token['kind']): boolean {
    return this.toks[this.i].kind === kind;
  }

  private atOp(...ops: string[]): boolean {
    return isOp(this.tok, ...ops);
  }

  private atKw(word: string): boolean {
    return this.tok.kind === 'KW' && this.tok.text === word;
  }

  private static startsOperand(tok: Token): boolean {
    return tok.kind === 'NUM' || tok.kind === 'IDENT' || tok.kind === 'LP' || isOp(tok, '√');
  }

  private fail(message: string): CalcSyntaxError {
    return new CalcSyntaxError(message, this.tok.pos);
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) throw new NestingError('Expression is too deeply nested');
  }

  // -- grammar
  parseAll(): Node {
    const node = this.expr();
    if (this.tok.kind !== 'END') throw this.fail(`Unexpected '${this.tok.text}'`);
    return node;
  }

  private expr(): Node {
    this.enter();
    try {
      return this.bitOr();
    } finally {
      this.depth -= 1;
    }
  }

  private bitOr(): Node {
    let node = this.bitXor();
    while (this.atOp('|')) {
      this.advance();
      node = { type: 'binary', op: '|', left: node, right: this.bitXor() };
    }
    return node;
  }

  private bitXor(): Node {
    let node = this.bitAnd();
    while (this.atKw('xor')) {
      this.advance();
      node = { type: 'binary', op: 'xor', left: node, right: this.bitAnd() };
    }
    return node;
  }

  private bitAnd(): Node {
    let node = this.shift();
    while (this.atOp('&')) {
      this.advance();
      node = { type: 'binary', op: '&', left: node, right: this.shift() };
    }
    return node;
  }

  private shift(): Node {
    let node = this.additive();
    while (this.atOp('<<', '>>')) {
      const op = this.advance().text;
      node = { type: 'binary', op, left: node, right: this.additive() };
    }
    return node;
  }

  private additive(): Node {
    let node = this.multiplicative();
    while (this.atOp('+', '-')) {
      const op = this.advance().text;
      node = { type: 'binary', op, left: node, right: this.multiplicative() };
    }
    return node;
  }

  private multiplicative(): Node {
    let node = this.parallel();
    for (;;) {
      let op: string;
      if (this.atOp('*', '/')) {
        op = this.advance().text;
      } else if (this.atKw('mod') || this.atOp('%')) {
        this.advance();
        op = 'mod';
      } else {
        return node;
      }
      node = { type: 'binary', op, left: node, right: this.parallel() };
    }
  }

  private parallel(): Node {
    let node = this.unary();
    while (this.atOp('||')) {
      this.advance();
      node = { type: 'binary', op: '||', left: node, right: this.unary() };
    }
    return node;
  }

  private unary(): Node {
    if (this.atOp('-', '+', '~')) {
      const op = this.advance().text;
      this.enter();
      try {
        return { type: 'unary', op, operand: this.unary() };
      } finally {
        this.depth -= 1;
      }
    }
    return this.implicit();
  }

  private implicit(): Node {
    const factors: Node[] = [this.power()];
    while (Parser.startsOperand(this.tok)) {
      if (this.tok.kind === 'NUM' && factors[factors.length - 1].type === 'num' && this.peek(-1).kind !== 'RP') {
        throw this.fail('Missing operator between numbers');
      }
      factors.push(this.power());
    }
    return factors.length === 1 ? factors[0] : { type: 'implicit', factors };
  }

  private power(): Node {
    const base = this.postfix();
    if (this.atOp('^', '**')) {
      this.advance();
      return { type: 'binary', op: '^', left: base, right: this.exponent() };
    }
    return base;
  }

  private exponent(): Node {
    this.enter();
    try {
      if (this.atOp('-', '+')) {
        const op = this.advance().text;
        return { type: 'unary', op, operand: this.exponent() };
      }
      return this.power();
    } finally {
      this.depth -= 1;
    }
  }

  private postfix(): Node {
    let node = this.atom();
    // '%' is percent unless an operand follows it, in which case it is modulo.
    while (this.atOp('%') && !Parser.startsOperand(this.peek())) {
      this.advance();
      node = { type: 'percent', operand: node };
    }
    return node;
  }

  private atom(): Node {
    const tok = this.tok;
    if (tok.kind === 'NUM') {
      this.advance();
      const nxt = this.tok;
      if (nxt.kind === 'IDENT' && !nxt.spaceBefore && Object.hasOwn(SI_PREFIXES, nxt.text)) {
        this.advance();
        return { type: 'num', value: tok.value as Scalar, raw: tok.text, suffix: nxt.text };
      }
      return { type: 'num', value: tok.value as Scalar, raw: tok.text, suffix: null };
    }
    if (tok.kind === 'IDENT') {
      this.advance();
      if (FUNCTION_NAMES.has(tok.text) && this.at('LP')) {
        this.advance();
        const args: Node[] = [];
        if (!this.at('RP')) {
          args.push(this.expr());
          while (this.at('COMMA')) {
            this.advance();
            args.push(this.expr());
          }
        }
        this.closeParen();
        return { type: 'call', name: tok.text, args };
      }
      return { type: 'ident', name: tok.text };
    }
    if (tok.kind === 'LP') {
      this.advance();
      const node = this.expr();
      this.closeParen();
      return node;
    }
    if (isOp(tok, '√')) {
      this.advance();
      this.enter();
      try {
        return { type: 'call', name: 'sqrt', args: [this.power()] };
      } finally {
        this.depth -= 1;
      }
    }
    if (tok.kind === 'END') throw this.fail('Incomplete expression');
    throw this.fail(`Unexpected '${tok.text}'`);
  }

  private closeParen(): void {
    // A missing ')' at the very end is forgiven, like on a pocket calculator.
    if (this.tok.kind === 'RP') this.advance();
    else if (this.tok.kind !== 'END') throw this.fail(`Expected ')' but found '${this.tok.text}'`);
  }
}

/** Parse a token list as one expression. */
export function parseTokens(tokens: readonly Token[]): Node {
  return new Parser(tokens).parseAll();
}

function parseTarget(tokens: readonly Token[], keyword: Token): Conversion {
  if (tokens.length === 0) throw new CalcSyntaxError(`Expected a unit after '${keyword.text}'`, keyword.pos);
  if (tokens.length === 1 && tokens[0].kind === 'IDENT' && BASE_TARGETS.has(tokens[0].text)) {
    return { base: tokens[0].text, unit: null };
  }
  if (!validTarget(tokens)) throw new CalcSyntaxError(`Expected a unit after '${keyword.text}'`, keyword.pos);
  return { base: null, unit: parseTokens(tokens) };
}

/** Parse one line of input into a Statement. */
export function parse(text: string): Statement {
  let tokens = tokenize(text);
  if (tokens.length === 0) throw new CalcSyntaxError('Nothing to calculate', 0);

  let assign: string | null = null;
  if (tokens.length >= 2 && tokens[0].kind === 'IDENT' && isOp(tokens[1], '=')) {
    assign = tokens[0].text;
    if (RESERVED_NAMES.has(assign)) {
      throw new CalcSyntaxError(`'${assign}' is reserved and can't be used as a variable name`, 0);
    }
    tokens = tokens.slice(2);
    if (tokens.length === 0) throw new CalcSyntaxError('Incomplete expression', 0);
  } else {
    const bad = tokens.find((t) => isOp(t, '='));
    if (bad) throw new CalcSyntaxError("'=' can only follow a variable name, as in r1 = 4.7k", bad.pos);
  }

  const first = tokens[0];
  const leading =
    (first.kind === 'OP' && (LEADING_OPS.has(first.text) || first.text === '->')) ||
    (first.kind === 'KW' && LEADING_KWS.has(first.text)) ||
    (first.kind === 'IDENT' && first.text === 'in' && validTarget(tokens.slice(1)));
  if (leading) tokens = [token('IDENT', 'ans', first.pos), ...tokens];

  const conversions: Conversion[] = [];
  for (;;) {
    const split = findConversion(tokens);
    if (split === null) break;
    conversions.push(parseTarget(tokens.slice(split + 1), tokens[split]));
    tokens = tokens.slice(0, split);
    if (tokens.length === 0) throw new CalcSyntaxError('Nothing to convert', 0);
  }
  conversions.reverse();

  if (tokens.some((t) => isOp(t, '='))) throw new CalcSyntaxError("Unexpected '='", 0);
  return { expr: parseTokens(tokens), assign, conversions };
}

/** Every node of a tree, depth first. */
export function* walk(node: Node): Generator<Node> {
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop() as Node;
    yield current;
    switch (current.type) {
      case 'unary':
      case 'percent':
        stack.push(current.operand);
        break;
      case 'binary':
        stack.push(current.right, current.left);
        break;
      case 'call':
        for (let k = current.args.length - 1; k >= 0; k -= 1) stack.push(current.args[k]);
        break;
      case 'implicit':
        for (let k = current.factors.length - 1; k >= 0; k -= 1) stack.push(current.factors[k]);
        break;
      default:
        break;
    }
  }
}
