/** Tokenizer: turns a line of text into a flat list of tokens. */

import { CalcSyntaxError } from './errors';
import type { Scalar } from './numeric';

export type TokenKind = 'NUM' | 'IDENT' | 'OP' | 'KW' | 'LP' | 'RP' | 'COMMA' | 'END';

export const KEYWORDS: ReadonlySet<string> = new Set(['to', 'xor', 'mod']);

// Characters people paste or type from other tools, mapped onto the plain grammar.
const TRANSLATE: ReadonlyArray<[string, string]> = [
  ['×', '*'],
  ['·', '*'],
  ['⋅', '*'],
  ['÷', '/'],
  ['−', '-'],
  ['–', '-'],
  ['→', '->'],
  ['²', '^2'],
  ['³', '^3'],
  ['Ω', 'Ω'], // OHM SIGN -> GREEK CAPITAL OMEGA
  ['μ', 'µ'], // GREEK SMALL MU -> MICRO SIGN
];

const HEX = /0[xX][0-9a-fA-F][0-9a-fA-F_]*/y;
const BIN = /0[bB][01][01_]*/y;
const OCT = /0[oO][0-7][0-7_]*/y;
const DEC = /(?:[0-9][0-9_]*\.?(?:[0-9][0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9]+)?/y;
const OPS = ['**', '||', '<<', '>>', '->', '+', '-', '*', '/', '^', '%', '&', '|', '~', '=', '√'];

const LETTER = /\p{L}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const SPACE = /\s/u;

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly pos: number;
  readonly value: Scalar | null;
  readonly spaceBefore: boolean;
}

export function token(kind: TokenKind, text: string, pos: number, value: Scalar | null = null, spaceBefore = false): Token {
  return { kind, text, pos, value, spaceBefore };
}

function isIdentStart(ch: string): boolean {
  return ch !== 'π' && (LETTER.test(ch) || ch === '_' || ch === '°');
}

function isIdentChar(ch: string): boolean {
  return ch !== 'π' && (LETTER_OR_DIGIT.test(ch) || ch === '_');
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function matchAt(re: RegExp, text: string, i: number): string | null {
  re.lastIndex = i;
  const m = re.exec(text);
  return m ? m[0] : null;
}

/** Split `text` into tokens. The END token is not included. */
export function tokenize(input: string): Token[] {
  let text = input;
  for (const [src, dst] of TRANSLATE) {
    if (text.includes(src)) text = text.split(src).join(dst);
  }

  const tokens: Token[] = [];
  // Iterate by code point so astral characters (emoji) are one unit, like Python str.
  const chars = Array.from(text);
  // Map code-point index -> UTF-16 offset for regex matching.
  const offsets: number[] = [];
  let offset = 0;
  for (const ch of chars) {
    offsets.push(offset);
    offset += ch.length;
  }
  offsets.push(offset);
  const indexAt = (utf16: number) => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] < utf16) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  let i = 0;
  const n = chars.length;
  let space = false;
  while (i < n) {
    const ch = chars[i];
    if (SPACE.test(ch)) {
      space = true;
      i += 1;
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(chars[i + 1]))) {
      const at = offsets[i];
      const based = matchAt(HEX, text, at) ?? matchAt(BIN, text, at) ?? matchAt(OCT, text, at);
      let raw: string;
      let value: Scalar;
      let consumed: string;
      if (based !== null) {
        consumed = based;
        raw = based.replace(/_/g, '');
        value = BigInt(raw);
      } else {
        consumed = matchAt(DEC, text, at) as string;
        raw = consumed.replace(/_/g, '');
        value = /[.eE]/.test(raw) ? Number(raw) : BigInt(raw);
      }
      tokens.push(token('NUM', raw, i, value, space));
      i = indexAt(at + consumed.length);
    } else if (ch === 'π') {
      tokens.push(token('IDENT', 'pi', i, null, space));
      i += 1;
    } else if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentChar(chars[j])) j += 1;
      const word = chars.slice(i, j).join('');
      tokens.push(token(KEYWORDS.has(word) ? 'KW' : 'IDENT', word, i, null, space));
      i = j;
    } else if (ch === '(') {
      tokens.push(token('LP', ch, i, null, space));
      i += 1;
    } else if (ch === ')') {
      tokens.push(token('RP', ch, i, null, space));
      i += 1;
    } else if (ch === ',') {
      tokens.push(token('COMMA', ch, i, null, space));
      i += 1;
    } else {
      const rest = text.slice(offsets[i]);
      const op = OPS.find((o) => rest.startsWith(o));
      if (op === undefined) throw new CalcSyntaxError(`Unexpected character '${ch}'`, i);
      tokens.push(token('OP', op, i, null, space));
      i += Array.from(op).length;
    }
    space = false;
  }
  return tokens;
}
