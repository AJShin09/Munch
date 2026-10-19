// src/engine/steppedLexer.ts
import { Token, TokenRule, SourcePos, Diagnostic, LexerTraceStep } from '../types';
import { compileRegexToDfa } from './regexToAutomaton';
import { compileRuleRegex } from '../lexer';
import { buildSourcePositionIndex, offsetToSourcePos } from './sourcePosition';

/** Compute line/column from an offset. Kept for callers that need a one-off
 *  lookup; hot scanning loops use a prebuilt SourcePositionIndex instead. */
export function computeSourcePos(source: string, offset: number): SourcePos {
  const before = source.slice(0, offset);
  const lines = before.split(/\r?\n/);
  const line = lines.length - 1;
  const column = lines[lines.length - 1].length;
  return { line, column, offset };
}

export interface LexerAnalysisResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
  traceSteps: LexerTraceStep[];
}

/** Rule diagnostics that are independent of the source text (bad rule definitions). */
export function describeRuleProblems(rules: TokenRule[]): Diagnostic[] {
  const problems: Diagnostic[] = [];
  const origin = { line: 0, column: 0, offset: 0 };
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const regex = compileRuleRegex(rule);
    if (!regex) {
      problems.push({
        severity: 'error',
        message: `Token rule '${rule.name}' has an invalid regular expression /${rule.regex}/ and was ignored — its characters will be reported as unrecognized.`,
        pos: origin,
        code: 'LEX_INVALID_RULE_REGEX',
      });
      continue;
    }
    try {
      compileRegexToDfa(rule.name, rule.regex, { ignoreCase: rule.caseInsensitive });
    } catch (err) {
      problems.push({
        severity: 'warning',
        message: `Token rule '${rule.name}' tokenizes correctly, but its pattern /${rule.regex}/ cannot be compiled to a DFA for visualization: ${(err as Error).message}`,
        pos: origin,
        code: 'LEX_UNSUPPORTED_RULE_AUTOMATON',
      });
    }
  }
  return problems;
}

/** Heuristic: does this rule emit a numeric literal (so a trailing malformed exponent is suspicious)? */
function isNumericRule(rule: TokenRule): boolean {
  return rule.category === 'literal' && /(INT|DEC|FLOAT|NUMBER|HEX|DIGIT)/i.test(rule.name);
}

export class SteppedLexer {
  private rules: { rule: TokenRule; regex: RegExp | null }[];
  private ruleDiagnostics: Diagnostic[];

  constructor(rules: TokenRule[]) {
    this.rules = rules
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map(rule => ({ rule, regex: compileRuleRegex(rule) }));
    this.ruleDiagnostics = describeRuleProblems(rules);
  }

  public analyze(source: string): LexerAnalysisResult {
    const tokens: Token[] = [];
    const diagnostics: Diagnostic[] = [...this.ruleDiagnostics];
    const traceSteps: LexerTraceStep[] = [];
    const positions = buildSourcePositionIndex(source);

    let pos = 0;
    const length = source.length;
    let stepIndex = 1;

    // Cache compiled DFAs on rules (one per rule, reused for every token)
    const ruleDfaCache = new Map<string, any>();
    for (const { rule } of this.rules) {
      try {
        ruleDfaCache.set(rule.name, compileRegexToDfa(rule.name, rule.regex, { ignoreCase: rule.caseInsensitive }));
      } catch {
        // Fallback if formal regex parsing has special JS constructs
      }
    }

    while (pos < length) {
      const currentChar = source[pos];
      const currentPos = offsetToSourcePos(positions, pos);

      // ── Unterminated block comment: "/*" with no closing "*/" before EOF ──
      if (currentChar === '/' && source[pos + 1] === '*' && source.indexOf('*/', pos + 2) === -1) {
        diagnostics.push({
          severity: 'warning',
          message: 'Unterminated block comment: "/*" has no closing "*/" before the end of the file.',
          pos: currentPos,
          endPos: offsetToSourcePos(positions, Math.min(pos + 2, length)),
          code: 'LEX_UNTERMINATED_BLOCK_COMMENT',
        });
        // Fall through: the '/' will still be tokenized by whichever rule matches.
      }

      const candidateMatches: { ruleName: string; matchedText: string; isBest: boolean }[] = [];
      let bestMatch: { rule: TokenRule; text: string } | null = null;

      for (const { rule, regex } of this.rules) {
        if (!regex) continue;
        try {
          regex.lastIndex = pos;
          const match = regex.exec(source);
          // Ignore failed and zero-length matches (zero-length would stall the scanner)
          if (match && match[0].length > 0) {
            const matched = match[0];
            const isLonger = !bestMatch || matched.length > bestMatch.text.length;
            if (isLonger) {
              bestMatch = { rule, text: matched };
            }
            candidateMatches.push({
              ruleName: rule.name,
              matchedText: matched,
              isBest: false,
            });
          }
        } catch {
          // ignore malformed rule regex during execution
        }
      }

      // Mark best match in candidates
      if (bestMatch) {
        for (const c of candidateMatches) {
          if (c.ruleName === bestMatch.rule.name && c.matchedText === bestMatch.text) {
            c.isBest = true;
            break;
          }
        }

        const startPos = currentPos;
        const endPos = offsetToSourcePos(positions, pos + bestMatch.text.length);

        const token: Token = {
          type: bestMatch.rule.name,
          lexeme: bestMatch.text,
          start: startPos,
          end: endPos,
          ruleName: bestMatch.rule.name,
          priority: bestMatch.rule.priority,
          automaton: ruleDfaCache.get(bestMatch.rule.name),
        };

        tokens.push(token);

        traceSteps.push({
          stepIndex: stepIndex++,
          pos,
          char: currentChar,
          activeCandidateRules: candidateMatches,
          action: 'EMIT_TOKEN',
          tokenEmitted: token,
          explanation: `At offset ${pos} (L${startPos.line + 1}:C${startPos.column + 1}): Selected '${bestMatch.rule.name}' with match "${escapeSpecialChars(bestMatch.text)}" (${bestMatch.text.length} chars, priority ${bestMatch.rule.priority}).`,
        });

        // Incomplete numeric literal: a number immediately followed by an exponent
        // marker that is not followed by exponent digits (e.g. "1e", "1e+", "12E-").
        const afterPos = pos + bestMatch.text.length;
        const expChar = source[afterPos];
        if (
          isNumericRule(bestMatch.rule) &&
          (expChar === 'e' || expChar === 'E') &&
          !/^[+-]?\d/.test(source.slice(afterPos + 1))
        ) {
          diagnostics.push({
            severity: 'warning',
            message: `Incomplete numeric literal: "${bestMatch.text}${expChar}" has no exponent digits after '${expChar}'.`,
            pos: startPos,
            endPos: offsetToSourcePos(positions, Math.min(afterPos + 1, length)),
            code: 'LEX_INVALID_NUMBER',
          });
        }

        pos = afterPos;
      } else {
        // No rule matched: Emit UNKNOWN token & register diagnostic
        const startPos = currentPos;
        const endPos = offsetToSourcePos(positions, pos + 1);

        const isQuote = currentChar === '"' || currentChar === "'" || currentChar === '`';
        const diag: Diagnostic = isQuote
          ? {
              severity: 'error',
              message: `Unterminated string literal: "${currentChar}" has no closing quote before the end of the line.`,
              pos: startPos,
              endPos,
              code: 'LEX_UNTERMINATED_STRING',
            }
          : {
              severity: 'error',
              message: `Unrecognized character '${currentChar}' (code ${currentChar.charCodeAt(0)}) has no matching rule.`,
              pos: startPos,
              endPos,
              code: 'LEX_UNRECOGNIZED_CHAR',
            };

        diagnostics.push(diag);

        const unknownToken: Token = {
          type: 'UNKNOWN',
          lexeme: currentChar,
          start: startPos,
          end: endPos,
          ruleName: undefined,
          diagnostic: diag,
        };
        tokens.push(unknownToken);

        traceSteps.push({
          stepIndex: stepIndex++,
          pos,
          char: currentChar,
          activeCandidateRules: [],
          action: 'EMIT_UNKNOWN',
          tokenEmitted: unknownToken,
          explanation: `At offset ${pos} (L${startPos.line + 1}:C${startPos.column + 1}): No rule matched character '${currentChar}'. Emitted UNKNOWN token and advanced 1 character.`,
        });

        pos += 1;
      }
    }

    return { tokens, diagnostics, traceSteps };
  }
}

function escapeSpecialChars(str: string): string {
  return str
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
