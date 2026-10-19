// src/lexer.ts
import { Token, TokenRule } from './types';
import { buildSourcePositionIndex, offsetToSourcePos } from './engine/sourcePosition';

/** Compile a rule regex into a sticky ("y") matcher: it can only match exactly
 *  at `regex.lastIndex`, which the scanner sets to the current offset. This is
 *  equivalent to the old `^(?:…)` + `source.slice(pos)` approach but avoids
 *  copying the source at every position (an O(n²) cost). The pattern is wrapped
 *  in a non-capturing group so top-level alternations stay anchored. */
export function compileRuleRegex(rule: TokenRule): RegExp | null {
  try {
    return new RegExp(`(?:${rule.regex})`, (rule.caseInsensitive ? 'i' : '') + 'y');
  } catch {
    return null;
  }
}

export class Lexer {
  private rules: { rule: TokenRule; regex: RegExp | null }[];

  constructor(rules: TokenRule[]) {
    this.rules = rules
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map(rule => ({ rule, regex: compileRuleRegex(rule) }));
  }

  /** Tokenize the source string.
   *  Returns an array of tokens in source order.
   *  Uses maximal munch (longest match wins); equal-length matches are
   *  resolved by deterministic rule priority.
   */
  tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    const positions = buildSourcePositionIndex(source);
    let pos = 0;
    const length = source.length;

    while (pos < length) {
      let bestMatch: { rule: TokenRule; text: string } | null = null;

      for (const { rule, regex } of this.rules) {
        if (!regex) continue;
        regex.lastIndex = pos;
        const match = regex.exec(source);
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
        const startPos = offsetToSourcePos(positions, pos);
        const endPos = offsetToSourcePos(positions, pos + bestMatch.text.length);
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
      const startPos = offsetToSourcePos(positions, pos);
      const endPos = offsetToSourcePos(positions, pos + 1);
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
