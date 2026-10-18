// src/lexer.ts
import { Token, TokenRule, SourcePos } from './types';

/** Helper to compute line/column from offset */
function computeSourcePos(source: string, offset: number): SourcePos {
  const before = source.slice(0, offset);
  const lines = before.split(/\r?\n/);
  const line = lines.length - 1; // zero‑based
  const column = lines[lines.length - 1].length; // zero‑based column in current line
  return { line, column, offset };
}

/** Compile a rule regex so it only ever matches at the start of the subject string.
 *  The pattern is wrapped in a non-capturing group before anchoring so that a
 *  top-level alternation such as `a|b` cannot match unanchored on the right branch.
 */
export function compileRuleRegex(rule: TokenRule): RegExp | null {
  try {
    return new RegExp(`^(?:${rule.regex})`, rule.caseInsensitive ? 'i' : '');
  } catch {
    return null; // malformed rule regex – treated as "never matches"
  }
}

export class Lexer {
  private rules: { rule: TokenRule; regex: RegExp | null }[];

  constructor(rules: TokenRule[]) {
    // sort by priority (lower number = higher priority) for tie‑breaking
    this.rules = rules
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map(rule => ({ rule, regex: compileRuleRegex(rule) }));
  }

  /** Tokenize the given source string.
   *  Returns an array of tokens in source order.
   *  Uses maximal munch (longest match wins); equal-length matches are
   *  resolved by deterministic rule priority.
   */
  tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;
    const length = source.length;

    while (pos < length) {
      let bestMatch: { rule: TokenRule; text: string } | null = null;

      for (const { rule, regex } of this.rules) {
        if (!regex) continue;
        const match = regex.exec(source.slice(pos));
        // Ignore failed and zero-length matches (a zero-length match would
        // otherwise stall the scanner forever).
        if (match && match[0].length > 0) {
          const matched = match[0];
          if (!bestMatch || matched.length > bestMatch.text.length) {
            bestMatch = { rule, text: matched };
            // maximal munch: continue checking for longer matches
          }
          // equal length → keep earlier (higher-priority) rule
        }
      }

      if (bestMatch) {
        const startPos = computeSourcePos(source, pos);
        const endPos = computeSourcePos(source, pos + bestMatch.text.length);
        tokens.push({
          type: bestMatch.rule.name,
          lexeme: bestMatch.text,
          start: startPos,
          end: endPos,
          ruleName: bestMatch.rule.name,
          priority: bestMatch.rule.priority,
        });
        pos += bestMatch.text.length;
        continue;
      }

      // No rule matched – emit UNKNOWN token for a single character
      const startPos = computeSourcePos(source, pos);
      const endPos = computeSourcePos(source, pos + 1);
      tokens.push({
        type: 'UNKNOWN',
        lexeme: source[pos],
        start: startPos,
        end: endPos,
        ruleName: undefined,
      });
      pos += 1;
    }

    return tokens;
  }
}
