// src/engine/ruleAnalysis.test.ts
//
// The analysis answers set questions about rule languages. Each case below is
// small enough to be verifiable by hand, which is the point: the tests check the
// closure reasoning, not the UI that displays it.

import { TokenRule } from '../types';
import { analyzeRules } from './ruleAnalysis';
import { SteppedLexer } from './steppedLexer';
import { LANGUAGE_PRESETS } from '../defaultRules';

const rule = (name: string, regex: string, priority: number, enabled = true): TokenRule => ({
  name, regex, priority, enabled,
});

const kinds = (rules: TokenRule[]) => analyzeRules(rules).issues.map(i => `${i.kind}:${i.ruleName}`);

describe('analyzeRules — shadowing through subset testing', () => {
  test('a later rule whose language is contained in an earlier one can never match', () => {
    // L(a) ⊆ L(a|b), and the union rule is tried first.
    expect(kinds([rule('ANY', 'a|b', 1), rule('NARROW', 'a', 2)])).toEqual(['shadowed:NARROW']);
  });

  test('the reverse order is fine: the narrow rule is reachable', () => {
    expect(kinds([rule('NARROW', 'a', 1), rule('ANY', 'a|b', 2)])).toEqual([]);
  });

  test('equal languages are reported as duplicates, not plain shadows', () => {
    expect(kinds([rule('A', 'ab', 1), rule('B', 'ab', 2)])).toEqual(['duplicate:B']);
  });

  test('disjoint languages produce no finding', () => {
    expect(kinds([rule('LETTERS', '[a-z]+', 1), rule('DIGITS', '[0-9]+', 2)])).toEqual([]);
  });
});

describe('analyzeRules — emptiness and invalid patterns', () => {
  test('an empty character class matches nothing', () => {
    expect(kinds([rule('NOTHING', '[]', 1)])).toEqual(['empty:NOTHING']);
  });

  test('a malformed pattern is reported and does not stop the analysis', () => {
    const result = analyzeRules([rule('BROKEN', '(a', 1), rule('OK', 'b', 2)]);
    expect(result.issues.map(i => i.kind)).toContain('invalid');
    expect(result.issues.find(i => i.kind === 'invalid')?.ruleName).toBe('BROKEN');
    expect(result.complete).toBe(false);
  });

  test('disabled rules are not analysed', () => {
    expect(kinds([rule('ANY', 'a|b', 1), rule('NARROW', 'a', 2, false)])).toEqual([]);
  });
});

describe('analyzeRules — ties', () => {
  test('equal priorities with overlapping languages are flagged', () => {
    // {ab, b} and {a, b} intersect on "b" without either containing the other.
    const result = analyzeRules([rule('A', 'a|b', 1), rule('B', 'ab|b', 1)]);
    expect(result.issues.map(i => i.kind)).toContain('tie');
  });

  test('equal priorities with disjoint languages are not flagged', () => {
    expect(kinds([rule('A', 'a+', 1), rule('B', 'b+', 1)])).toEqual([]);
  });
});

describe('analyzeRules — summary', () => {
  test('reports DFA sizes and the number of pairs compared', () => {
    const result = analyzeRules([rule('A', 'a', 1), rule('B', 'b', 2), rule('C', 'c', 3)]);
    expect(result.pairs).toBe(3);
    expect(result.complete).toBe(true);
    expect(result.states.A).toBeGreaterThan(0);
  });

  test('the default JavaScript rule set is quiet, and a priority swap is predicted correctly', () => {
    const rules = LANGUAGE_PRESETS.javascript.rules as TokenRule[];
    expect(analyzeRules(rules).issues).toEqual([]);

    // Put IDENTIFIER before KEYWORD. Every keyword is lexically an identifier,
    // so the analysis must now say the KEYWORD rule can never fire.
    const swapped = rules.map(rule => {
      if (rule.name === 'KEYWORD') return { ...rule, priority: 7 };
      if (rule.name === 'IDENTIFIER') return { ...rule, priority: 3 };
      return rule;
    });
    const result = analyzeRules(swapped);
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'shadowed', ruleName: 'KEYWORD', otherRule: 'IDENTIFIER' }),
    ]);

    // The prediction is checked against the scanner itself, not just restated.
    expect(new SteppedLexer(rules).analyze('function x;').tokens[0].type).toBe('KEYWORD');
    expect(new SteppedLexer(swapped).analyze('function x;').tokens[0].type).toBe('IDENTIFIER');
  });
});
