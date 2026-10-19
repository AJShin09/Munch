// src/engine/syntaxHighlight.ts
// Usage-based syntax highlighting for the source editor.
//
// The workbench recolors the source editor from the *same* token stream the
// lexer produces, so the highlighted roles always agree with the Token Stream,
// the diagnostics and the DFA panels. The lexer only knows rule names and
// categories; this module maps those to a small, closed set of semantic roles
// (SynClass) that the CSS layer renders. No HTML is produced here — the caller
// renders plain text segments, so source text is inserted as text nodes only.

import { Token, TokenRule } from '../types';

/** Role a stretch of source text plays, used to pick a syntax color. */
export type SynClass =
  | 'comment'
  | 'keyword'
  | 'control'
  | 'string'
  | 'number'
  | 'variable'
  | 'function'
  | 'type'
  | 'operator'
  | 'punct'
  | 'error'
  /** No styling — whitespace and inter-token gaps. */
  | '';

/** A contiguous run of source text sharing one role. Offsets are absolute. */
export interface SynSegment {
  text: string;
  cls: SynClass;
  /** Absolute start offset (inclusive) in the source string. */
  start: number;
  /** Absolute end offset (exclusive) in the source string. */
  end: number;
}

/**
 * Keywords that denote control flow / branching rather than declarations.
 * Matched case-insensitively so presets with `caseInsensitive` rules work.
 */
export const CONTROL_KEYWORDS: ReadonlySet<string> = new Set([
  'if', 'else', 'elseif', 'elsif', 'elif', 'while', 'for', 'foreach', 'do',
  'break', 'continue', 'return', 'switch', 'case', 'default', 'when', 'yield',
  'await', 'try', 'catch', 'finally', 'throw', 'goto', 'repeat', 'until',
  'then', 'loop', 'and', 'or', 'not', 'xor',
]);

/** True for a lexeme that is entirely whitespace (used to skip between tokens). */
function isWhitespaceLexeme(lexeme: string): boolean {
  return /^\s*$/.test(lexeme);
}

/** The next token's lexeme, ignoring intervening whitespace tokens. */
function nextSignificantLexeme(tokens: Token[], index: number): string | undefined {
  for (let j = index + 1; j < tokens.length; j++) {
    if (!isWhitespaceLexeme(tokens[j].lexeme)) return tokens[j].lexeme;
  }
  return undefined;
}

/** Decide whether an identifier lexeme reads as a function, type, or variable. */
function identifierClass(lexeme: string, nextLexeme: string | undefined): SynClass {
  if (nextLexeme !== undefined && nextLexeme.startsWith('(')) return 'function';
  if (/^[A-Z]/.test(lexeme)) return 'type';
  return 'variable';
}

/** Classify a `literal`-category token as a string or a number. */
function literalClass(lexeme: string, rule: TokenRule | undefined): SynClass {
  const first = lexeme[0];
  if (first === '"' || first === "'" || first === '`') return 'string';
  if (/^[0-9]/.test(lexeme) || /^\.\d/.test(lexeme)) return 'number';
  if (rule && /STRING|CHAR|TEXT/i.test(rule.name)) return 'string';
  return 'number';
}

/**
 * Best-effort role for a token whose rule carries no (or an unknown) category.
 * Falls back to the lexeme's shape so custom rules still get sensible colors.
 */
function inferClass(lexeme: string, nextLexeme: string | undefined): SynClass {
  if (isWhitespaceLexeme(lexeme)) return '';
  const first = lexeme[0];
  if (first === '"' || first === "'" || first === '`') return 'string';
  if (/^[0-9]/.test(lexeme) || /^\.\d/.test(lexeme)) return 'number';
  if (/^[A-Za-z_$]/.test(lexeme)) return identifierClass(lexeme, nextLexeme);
  if (/^[(){}\[\],.;:]$/.test(lexeme)) return 'punct';
  return 'operator';
}

/**
 * Resolve the syntax role for one token, given its rule and the next
 * significant lexeme (used to distinguish `foo(` calls from bare variables).
 * Exported for direct unit-testing.
 */
export function classForToken(
  token: Token,
  rule: TokenRule | undefined,
  nextLexeme: string | undefined
): SynClass {
  if (token.diagnostic && token.diagnostic.severity === 'error') return 'error';

  switch (rule?.category) {
    case 'comment':
      return 'comment';
    case 'whitespace':
      return '';
    case 'operator':
      return 'operator';
    case 'separator':
      return 'punct';
    case 'keyword':
      return CONTROL_KEYWORDS.has(token.lexeme.toLowerCase()) ? 'control' : 'keyword';
    case 'literal':
      return literalClass(token.lexeme, rule);
    case 'identifier':
      return identifierClass(token.lexeme, nextLexeme);
    default:
      return inferClass(token.lexeme, nextLexeme);
  }
}

/**
 * Build a complete, gap-free list of syntax segments covering `[0, source.length)`.
 *
 * Tokens come from the lexer with absolute offsets. Any characters the lexer did
 * not cover become a gap: whitespace-only gaps are left unstyled, everything
 * else is marked `error` (an unrecognized character the lexer skipped). Segments
 * are clamped to the source bounds and adjacent equal roles are merged.
 */
export function buildSyntaxSegments(
  source: string,
  tokens: Token[],
  rules: TokenRule[]
): SynSegment[] {
  const rulesByName = new Map<string, TokenRule>();
  for (const rule of rules) rulesByName.set(rule.name, rule);

  const segments: SynSegment[] = [];
  const push = (text: string, cls: SynClass, start: number) => {
    if (text.length === 0) return;
    const last = segments[segments.length - 1];
    if (last && last.cls === cls) {
      last.text += text;
      last.end = start + text.length;
      return;
    }
    segments.push({ text, cls, start, end: start + text.length });
  };

  const length = source.length;
  let cursor = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const start = Math.max(cursor, Math.min(token.start.offset, length));
    const end = Math.max(start, Math.min(token.end.offset, length));

    if (start > cursor) {
      const gap = source.slice(cursor, start);
      push(gap, isWhitespaceLexeme(gap) ? '' : 'error', cursor);
    }
    if (end <= start) continue;

    const text = source.slice(start, end);
    const rule = token.ruleName ? rulesByName.get(token.ruleName) : undefined;
    const cls = classForToken(token, rule, nextSignificantLexeme(tokens, i));
    push(text, cls, start);
    cursor = end;
  }

  if (cursor < length) {
    const tail = source.slice(cursor);
    push(tail, isWhitespaceLexeme(tail) ? '' : 'error', cursor);
  }

  return segments;
}
