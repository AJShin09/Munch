// src/engine/lexerAudit.test.ts
// Functional audit regression suite for the Munch lexer engine.
import { SteppedLexer, computeSourcePos, describeRuleProblems } from './steppedLexer';
import { RICH_JAVASCRIPT_RULES } from '../defaultRules';
import { simulateAutomaton } from './automaton';
import { TokenRule } from '../types';

const stepped = new SteppedLexer(RICH_JAVASCRIPT_RULES);
const analyzed = (src: string) => stepped.analyze(src);
const types = (src: string) => analyzed(src).tokens.map(t => t.type);

const rule = (name: string, regex: string, priority: number): TokenRule => ({
  name, regex, priority, enabled: true, category: 'other',
});

describe('audit: maximal munch and priority (section 2)', () => {
  test.each([
    ['//hello', ['LINE_COMMENT']],
    ['/', ['ARITHMETIC_OPERATOR']],
    ['/* hello */', ['BLOCK_COMMENT']],
    ['=', ['ASSIGNMENT_OPERATOR']],
    ['==', ['COMPARISON_OPERATOR']],
    ['===', ['COMPARISON_OPERATOR']],
    ['let', ['KEYWORD']],
    ['letter', ['IDENTIFIER']],
    ['123', ['INTEGER_LITERAL']],
    ['12.5', ['DECIMAL_LITERAL']],
  ])('%s tokenizes as %j', (src, expected) => {
    expect(types(src)).toEqual(expected);
  });

  test('longest match wins over a shorter same-prefix match', () => {
    expect(types('12.5')).toEqual(['DECIMAL_LITERAL']);
    expect(analyzed('12.5').tokens[0].lexeme).toBe('12.5');
  });

  test('equal-length matches are broken by rule priority (lower number wins)', () => {
    const l = new SteppedLexer([rule('SECOND', 'ab', 2), rule('FIRST', 'ab', 1)]);
    expect(l.analyze('ab').tokens[0].type).toBe('FIRST');
  });

  test('the longest match wins even when its priority number is worse', () => {
    const l = new SteppedLexer([rule('SHORT_HIGH', 'a', 1), rule('LONG_LOW', 'ab', 99)]);
    expect(l.analyze('ab').tokens[0].type).toBe('LONG_LOW');
  });

  test('keyword vs identifier: word boundary keeps "letter" an identifier', () => {
    expect(types('let')).toEqual(['KEYWORD']);
    expect(types('letletter')).toEqual(['IDENTIFIER']);
  });

  test('comment vs division at the same "/" prefix', () => {
    expect(types('a / b')).toEqual(['IDENTIFIER', 'WHITESPACE', 'ARITHMETIC_OPERATOR', 'WHITESPACE', 'IDENTIFIER']);
    expect(types('//x')).toEqual(['LINE_COMMENT']);
    expect(types('/* c */')).toEqual(['BLOCK_COMMENT']);
  });
});

describe('audit: source positions (section 4)', () => {
  test('token offsets and line:column are zero-based and correct', () => {
    const { tokens } = analyzed('let x\n  y');
    const y = tokens.find(t => t.lexeme === 'y')!;
    expect(y.start).toEqual({ line: 1, column: 2, offset: 8 });
    expect(y.end).toEqual({ line: 1, column: 3, offset: 9 });

    const letTok = tokens[0];
    expect(letTok.start).toEqual({ line: 0, column: 0, offset: 0 });
    expect(letTok.end).toEqual({ line: 0, column: 3, offset: 3 });
  });

  test('computeSourcePos handles \\n and \\r\\n', () => {
    const src = 'ab\ncd\r\nef';
    expect(computeSourcePos(src, 3)).toEqual({ line: 1, column: 0, offset: 3 });
    expect(computeSourcePos(src, 7)).toEqual({ line: 2, column: 0, offset: 7 });
    expect(computeSourcePos(src, src.length)).toEqual({ line: 2, column: 2, offset: 9 });
  });

  test('trace rows carry the offset used for line:column lookup', () => {
    const { traceSteps } = analyzed('let x');
    expect(traceSteps.map(s => s.pos)).toEqual([0, 3, 4]);
  });
});

describe('audit: diagnostics (section 5)', () => {
  test('a character matching no rule is emitted as UNKNOWN with an error', () => {
    const r = analyzed('@');
    expect(r.tokens.map(t => t.type)).toEqual(['UNKNOWN']);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0].code).toBe('LEX_UNRECOGNIZED_CHAR');
    expect(r.diagnostics[0].severity).toBe('error');
    expect(r.diagnostics[0].pos.offset).toBe(0);
  });

  test('unterminated string literal is diagnosed at its opening quote', () => {
    const r = analyzed('let s = "abc');
    const d = r.diagnostics.find(x => x.code === 'LEX_UNTERMINATED_STRING');
    expect(d).toBeDefined();
    expect(d!.pos.offset).toBe(8);
  });

  test('unterminated block comment is a warning, not an error', () => {
    const r = analyzed('/* forever');
    const d = r.diagnostics.find(x => x.code === 'LEX_UNTERMINATED_BLOCK_COMMENT');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('warning');
    expect(r.diagnostics.filter(x => x.severity === 'error')).toHaveLength(0);
  });

  test('invalid custom rule regex is reported, not silently discarded', () => {
    const rules = [rule('BROKEN', '(unclosed', 1), rule('A', 'a', 2)];
    expect(describeRuleProblems(rules).map(d => d.code)).toEqual(['LEX_INVALID_RULE_REGEX']);

    const l = new SteppedLexer(rules);
    const r = l.analyze('a');
    expect(r.diagnostics.some(d => d.code === 'LEX_INVALID_RULE_REGEX')).toBe(true);
    expect(r.tokens.map(t => t.type)).toEqual(['A']);
  });

  test('a rule that matches but cannot build a DFA yields a warning (still tokenizes)', () => {
    const rules = [rule('LOOKAHEAD', '(?=a)a', 1)];
    const l = new SteppedLexer(rules);
    const r = l.analyze('a');
    const d = r.diagnostics.find(x => x.code === 'LEX_UNSUPPORTED_RULE_AUTOMATON');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('warning');
    expect(r.tokens.map(t => t.type)).toEqual(['LOOKAHEAD']);
    expect(r.tokens[0].automaton).toBeUndefined();
  });

  test('incomplete numeric exponent is diagnosed, valid exponents are not', () => {
    const bad = analyzed('1e');
    const warn = bad.diagnostics.find(x => x.code === 'LEX_INVALID_NUMBER');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(bad.tokens.map(t => t.type)).toEqual(['INTEGER_LITERAL', 'IDENTIFIER']);

    expect(analyzed('1e+').diagnostics.some(x => x.code === 'LEX_INVALID_NUMBER')).toBe(true);
    expect(analyzed('1e10').diagnostics.some(x => x.code === 'LEX_INVALID_NUMBER')).toBe(false);
    expect(analyzed('2.5E-3').diagnostics.some(x => x.code === 'LEX_INVALID_NUMBER')).toBe(false);
  });
});

describe('audit: token / recognizer consistency (section 3 & 6)', () => {
  const source = 'let x = 42; // note\nif (x >= 12.5) { y++; } "s"';

  test('every emitted token is accepted by its own rule DFA', () => {
    const { tokens } = analyzed(source);
    expect(tokens.length).toBeGreaterThan(0);
    const rejected: string[] = [];
    for (const t of tokens) {
      if (!t.automaton) { rejected.push(`${t.type} (no automaton)`); continue; }
      const steps = simulateAutomaton(t.automaton, t.lexeme);
      if (!steps[steps.length - 1].isAccepted) rejected.push(`${t.type}("${t.lexeme}")`);
    }
    expect(rejected).toEqual([]);
  });

  test('line-comment DFA accepts a comment and rejects a lone slash', () => {
    const dfa = analyzed('//x').tokens[0].automaton!;
    const accepts = (s: string) => simulateAutomaton(dfa, s).slice(-1)[0].isAccepted;
    expect(accepts('//x')).toBe(true);
    expect(accepts('/')).toBe(false);
  });

  test('keyword DFA does not accept a keyword-prefixed identifier', () => {
    const dfa = analyzed('let').tokens[0].automaton!;
    const accepts = (s: string) => simulateAutomaton(dfa, s).slice(-1)[0].isAccepted;
    expect(accepts('let')).toBe(true);
    expect(accepts('letx')).toBe(false);
  });
});

describe('audit: empty input and end-of-input (section 1 & 4)', () => {
  test('empty source yields no tokens, diagnostics or trace steps', () => {
    const r = analyzed('');
    expect(r.tokens).toHaveLength(0);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.traceSteps).toHaveLength(0);
  });

  test('a trailing token at EOF without a newline is still scanned', () => {
    expect(types('let x')).toEqual(['KEYWORD', 'WHITESPACE', 'IDENTIFIER']);
  });
});
