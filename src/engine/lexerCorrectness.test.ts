// src/engine/lexerCorrectness.test.ts
// Focused correctness + consistency suite for the lexer, DFA compiler and
// per-character simulator. Every assertion pins explicit token types,
// lexemes, offsets or acceptance results — no "returns something" checks.
import { SteppedLexer } from './steppedLexer';
import { Lexer } from '../lexer';
import { compileRegexToDfa } from './regexToAutomaton';
import { simulateAutomaton } from './automaton';
import { RICH_JAVASCRIPT_RULES } from '../defaultRules';

const rules = RICH_JAVASCRIPT_RULES;
const stepped = new SteppedLexer(rules);

const tokensOf = (src: string) => stepped.analyze(src).tokens;
const typed = (src: string) =>
  tokensOf(src).map(t => `${t.type}(${t.lexeme})`);

const identifierDfa = compileRegexToDfa('IDENTIFIER', '[A-Za-z_$][A-Za-z0-9_$]*');
const accepts = (input: string): boolean => {
  const steps = simulateAutomaton(identifierDfa, input);
  return steps[steps.length - 1].isAccepted === true;
};

describe('lexer correctness: keyword vs identifier', () => {
  test('identifiers that begin with a keyword are not split', () => {
    expect(typed('functionality')).toEqual(['IDENTIFIER(functionality)']);
    expect(typed('letletter')).toEqual(['IDENTIFIER(letletter)']);
    expect(typed('let2')).toEqual(['IDENTIFIER(let2)']);
  });

  test('the bare keyword is still a keyword', () => {
    expect(typed('let')).toEqual(['KEYWORD(let)']);
    expect(typed('function')).toEqual(['KEYWORD(function)']);
    expect(typed('const')).toEqual(['KEYWORD(const)']);
  });

  test('identifier start/continue characters', () => {
    expect(typed('taxRate')).toEqual(['IDENTIFIER(taxRate)']);
    expect(typed('_counter')).toEqual(['IDENTIFIER(_counter)']);
    expect(typed('$value')).toEqual(['IDENTIFIER($value)']);
    expect(typed('item2')).toEqual(['IDENTIFIER(item2)']);
  });

  test('a digit cannot start an identifier: "2items" is a number then an identifier', () => {
    const tokens = tokensOf('2items');
    expect(tokens.map(t => [t.type, t.lexeme, t.start.offset, t.end.offset])).toEqual([
      ['INTEGER_LITERAL', '2', 0, 1],
      ['IDENTIFIER', 'items', 1, 6],
    ]);
  });
});

describe('lexer correctness: operator maximal munch', () => {
  test.each([
    ['>=', 'COMPARISON_OPERATOR'],
    ['<=', 'COMPARISON_OPERATOR'],
    ['===', 'COMPARISON_OPERATOR'],
    ['!==', 'COMPARISON_OPERATOR'],
    ['=>', 'ASSIGNMENT_OPERATOR'],
    ['&&', 'LOGICAL_OPERATOR'],
    ['||', 'LOGICAL_OPERATOR'],
    ['??', 'LOGICAL_OPERATOR'],
    ['?.', 'LOGICAL_OPERATOR'],
    ['++', 'ARITHMETIC_OPERATOR'],
    ['--', 'ARITHMETIC_OPERATOR'],
    ['+=', 'ASSIGNMENT_OPERATOR'],
    ['-=', 'ASSIGNMENT_OPERATOR'],
    ['*=', 'ASSIGNMENT_OPERATOR'],
    ['/=', 'ASSIGNMENT_OPERATOR'],
    ['%=', 'ASSIGNMENT_OPERATOR'],
  ])('%s is one token', (src, type) => {
    const tokens = tokensOf(src);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type, lexeme: src, });
    expect(tokens[0].start.offset).toBe(0);
    expect(tokens[0].end.offset).toBe(src.length);
  });

  test('"===" is not emitted as "==" + "="', () => {
    expect(tokensOf('===').map(t => t.lexeme)).toEqual(['===']);
  });

  test('a multi-character operator inside an expression keeps its operands', () => {
    expect(typed('a<=b')).toEqual([
      'IDENTIFIER(a)',
      'COMPARISON_OPERATOR(<=)',
      'IDENTIFIER(b)',
    ]);
  });

  test('a lone "/" stays an operator while "//" and "/*" start comments', () => {
    expect(typed('/')).toEqual(['ARITHMETIC_OPERATOR(/)']);
    expect(typed('//x')).toEqual(['LINE_COMMENT(//x)']);
    expect(typed('/*x*/')).toEqual(['BLOCK_COMMENT(/*x*/)']);
  });
});

describe('lexer correctness: numeric literals', () => {
  test.each([
    ['42', 'INTEGER_LITERAL'],
    ['0', 'INTEGER_LITERAL'],
    ['0xFF', 'INTEGER_LITERAL'],
    ['3.14', 'DECIMAL_LITERAL'],
    ['.5', 'DECIMAL_LITERAL'],
    ['1e10', 'DECIMAL_LITERAL'],
    ['2.5E-3', 'DECIMAL_LITERAL'],
  ])('%s is one %s consumed in full', (src, type) => {
    const tokens = tokensOf(src);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe(type);
    expect(tokens[0].lexeme).toBe(src);
    expect(tokens[0].end.offset).toBe(src.length);
  });

  test('a trailing dot is not part of the number (documented limitation)', () => {
    expect(typed('1.')).toEqual(['INTEGER_LITERAL(1)', 'DOT(.)']);
  });

  test('a malformed exponent is diagnosed but still tokenized', () => {
    const result = stepped.analyze('1e');
    expect(result.tokens.map(t => `${t.type}(${t.lexeme})`)).toEqual([
      'INTEGER_LITERAL(1)',
      'IDENTIFIER(e)',
    ]);
    expect(result.diagnostics.map(d => d.code)).toEqual(['LEX_INVALID_NUMBER']);
  });
});

describe('lexer correctness: comments and strings', () => {
  test('single-line comment stops before the newline', () => {
    const tokens = tokensOf('// hi\nx');
    expect(tokens.map(t => [t.type, t.lexeme, t.start.offset, t.end.offset])).toEqual([
      ['LINE_COMMENT', '// hi', 0, 5],
      ['WHITESPACE', '\n', 5, 6],
      ['IDENTIFIER', 'x', 6, 7],
    ]);
  });

  test('multiline block comment spans lines and reports its end position', () => {
    const tokens = tokensOf('/* a\nb */');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: 'BLOCK_COMMENT',
      lexeme: '/* a\nb */',
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 1, column: 4, offset: 9 },
    });
  });

  test('single, double and template strings are single tokens with escapes', () => {
    expect(typed(`'it\\'s'`)).toEqual([`STRING_LITERAL('it\\'s')`]);
    expect(typed('"a\\"b"')).toEqual(['STRING_LITERAL("a\\"b")']);
    expect(typed('`a ${x} b`')).toEqual(['STRING_LITERAL(`a ${x} b`)']);
  });

  test('unterminated strings are diagnosed at the opening quote', () => {
    for (const [src, quoteOffset] of [['let s = "abc', 8], ['"abc', 0], ['`abc', 0], ["'abc", 0]] as const) {
      const result = stepped.analyze(src);
      const diag = result.diagnostics.find(d => d.code === 'LEX_UNTERMINATED_STRING');
      expect(diag).toBeDefined();
      expect(diag!.pos.offset).toBe(quoteOffset);
      expect(result.tokens.some(t => t.type === 'UNKNOWN' && t.start.offset === quoteOffset)).toBe(true);
    }
  });

  test('an unterminated block comment is a warning and does not hide following characters', () => {
    const result = stepped.analyze('/* open\nlet x');
    const diag = result.diagnostics.find(d => d.code === 'LEX_UNTERMINATED_BLOCK_COMMENT');
    expect(diag).toMatchObject({ severity: 'warning', pos: { line: 0, column: 0, offset: 0 } });
    // The '/' still tokenizes; the rest of the input is not swallowed.
    expect(result.tokens.some(t => t.type === 'KEYWORD' && t.lexeme === 'let')).toBe(true);
    expect(result.tokens.some(t => t.type === 'IDENTIFIER' && t.lexeme === 'x')).toBe(true);
  });

  test('comment-opening text inside a string is not diagnosed as a comment', () => {
    const result = stepped.analyze('"/* not a comment"');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map(t => t.type)).toEqual(['STRING_LITERAL']);
  });
});

describe('lexer correctness: whitespace, line endings and positions', () => {
  test('CRLF is one whitespace token and the next line starts at column 0', () => {
    const tokens = tokensOf('ab\r\ncd');
    expect(tokens.map(t => [t.type, t.lexeme, t.start.line, t.start.column, t.start.offset, t.end.offset])).toEqual([
      ['IDENTIFIER', 'ab', 0, 0, 0, 2],
      ['WHITESPACE', '\r\n', 0, 2, 2, 4],
      ['IDENTIFIER', 'cd', 1, 0, 4, 6],
    ]);
  });

  test('LF-only and CRLF-only sources agree on line/column', () => {
    const lf = tokensOf('a\nb');
    const crlf = tokensOf('a\r\nb');
    const bLf = lf.find(t => t.lexeme === 'b')!;
    const bCrlf = crlf.find(t => t.lexeme === 'b')!;
    expect(bLf.start).toEqual({ line: 1, column: 0, offset: 2 });
    expect(bCrlf.start).toEqual({ line: 1, column: 0, offset: 3 });
  });

  test('tabs count as one column and remain in the token stream', () => {
    const tokens = tokensOf('a\tb');
    expect(tokens.map(t => [t.type, t.lexeme])).toEqual([
      ['IDENTIFIER', 'a'],
      ['WHITESPACE', '\t'],
      ['IDENTIFIER', 'b'],
    ]);
    expect(tokens[2].start).toEqual({ line: 0, column: 2, offset: 2 });
  });

  test('whitespace-only input yields one whitespace token and no diagnostics', () => {
    const result = stepped.analyze(' \t\r\n ');
    expect(result.tokens.map(t => t.type)).toEqual(['WHITESPACE']);
    expect(result.tokens[0].lexeme).toBe(' \t\r\n ');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.traceSteps).toHaveLength(1);
  });

  test('empty input yields no tokens, diagnostics or trace steps', () => {
    const result = stepped.analyze('');
    expect(result.tokens).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.traceSteps).toEqual([]);
  });

  test('unknown characters are isolated and reported once each', () => {
    const result = stepped.analyze('@€');
    expect(result.tokens.map(t => [t.type, t.lexeme, t.start.offset])).toEqual([
      ['UNKNOWN', '@', 0],
      ['UNKNOWN', '€', 1],
    ]);
    expect(result.diagnostics.map(d => [d.code, d.pos.offset])).toEqual([
      ['LEX_UNRECOGNIZED_CHAR', 0],
      ['LEX_UNRECOGNIZED_CHAR', 1],
    ]);
  });

  test('an astral character is reported once, not as two surrogate halves', () => {
    const result = stepped.analyze('😀a');
    expect(result.tokens.map(t => [t.type, t.lexeme, t.start.offset, t.end.offset])).toEqual([
      ['UNKNOWN', '😀', 0, 2],
      ['IDENTIFIER', 'a', 2, 3],
    ]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: 'LEX_UNRECOGNIZED_CHAR', pos: { offset: 0 } });
    expect(result.traceSteps[0].char).toBe('😀');
    expect(result.traceSteps[0].tokenEmitted!.lexeme).toBe('😀');
  });
});

describe('DFA: identifier acceptance', () => {
  test('start state is non-accepting and exactly one state is accepting', () => {
    const start = simulateAutomaton(identifierDfa, '')[0];
    expect(start.symbol).toBeNull();
    expect(start.isAccepted).toBe(false);
    expect(start.activeStates.size).toBe(1);
    expect(identifierDfa.acceptingStates).toHaveLength(1);
    expect(identifierDfa.acceptingStates).not.toContain(identifierDfa.startState);
  });

  test.each(['taxRate', '_counter', 'item2', 'functionality', 'a', '$x9'])(
    '%s is accepted',
    input => {
      expect(accepts(input)).toBe(true);
    }
  );

  test.each(['', '2items', 'a-b', 'a b', '-x'])('%s is rejected', input => {
    expect(accepts(input)).toBe(false);
  });

  test('the simulation consumes exactly one symbol per step', () => {
    const input = 'item2';
    const steps = simulateAutomaton(identifierDfa, input);
    expect(steps).toHaveLength(input.length + 1);
    steps.slice(1).forEach((s, i) => {
      expect(s.symbol).toBe(input[i]);
      expect(s.inputIndex).toBe(i + 1);
    });
    expect(steps[steps.length - 1].isAccepted).toBe(true);
  });

  test('a dead transition leaves the machine in the empty state set', () => {
    const steps = simulateAutomaton(identifierDfa, 'a-');
    expect(steps[2].activeStates.size).toBe(0);
    expect(steps[2].isAccepted).toBe(false);
  });
});

describe('regex to automaton conversion', () => {
  const dfa = compileRegexToDfa('abc-star', 'a(b|c)*');
  const run = (s: string) => simulateAutomaton(dfa, s);

  test('produces a DFA with a start state and accepting states', () => {
    expect(dfa.type).toBe('DFA');
    expect(dfa.states).toContain(dfa.startState);
    expect(dfa.acceptingStates.length).toBeGreaterThan(0);
    for (const t of dfa.transitions) {
      expect(dfa.states).toContain(t.from);
      expect(dfa.states).toContain(t.to);
    }
  });

  test('accepts the intended language and rejects near misses', () => {
    for (const s of ['a', 'ab', 'abc', 'acbcc']) {
      expect(run(s).slice(-1)[0].isAccepted).toBe(true);
    }
    for (const s of ['', 'b', 'abx', 'ba']) {
      expect(run(s).slice(-1)[0].isAccepted).toBe(false);
    }
  });

  test('word-boundary assertions are compiled as zero-width (epsilon)', () => {
    const keyword = compileRegexToDfa('KEYWORD', '(let|var|const)\\b');
    expect(simulateAutomaton(keyword, 'let').slice(-1)[0].isAccepted).toBe(true);
    expect(simulateAutomaton(keyword, 'const').slice(-1)[0].isAccepted).toBe(true);
  });

  test('unsupported lookahead fails loudly instead of producing a wrong DFA', () => {
    expect(() => compileRegexToDfa('LOOK', '(?=a)a')).toThrow(/Lookahead/);
  });
});

describe('execution trace consistency', () => {
  const source = 'let x = 42; // note';
  const result = stepped.analyze(source);

  test('one trace step per emitted token, in source order', () => {
    expect(result.traceSteps).toHaveLength(result.tokens.length);
    result.traceSteps.forEach((step, i) => {
      expect(step.stepIndex).toBe(i + 1);
      expect(step.tokenEmitted).toBe(result.tokens[i]);
      expect(step.pos).toBe(result.tokens[i].start.offset);
      expect(step.char).toBe(result.tokens[i].lexeme[0]);
      expect(step.action).toBe('EMIT_TOKEN');
    });
  });

  test('candidate rules are the rules that actually matched at that offset', () => {
    const eq = stepped.analyze('=').traceSteps[0];
    const names = eq.activeCandidateRules.map(c => c.ruleName).sort();
    expect(names).toEqual(['ASSIGNMENT_OPERATOR']);
    expect(eq.activeCandidateRules.filter(c => c.isBest)).toHaveLength(1);
    expect(eq.activeCandidateRules[0].matchedText).toBe('=');
  });

  test('the winning candidate is the longest match, not the first rule', () => {
    const step = stepped.analyze('===').traceSteps[0];
    const best = step.activeCandidateRules.find(c => c.isBest)!;
    expect(best.matchedText).toBe('===');
    expect(best.ruleName).toBe('COMPARISON_OPERATOR');
  });

  test('every emitted token is accepted by the DFA attached to it', () => {
    for (const token of result.tokens) {
      expect(token.automaton).toBeDefined();
      const steps = simulateAutomaton(token.automaton!, token.lexeme);
      expect(`${token.type}("${token.lexeme}") accepted=${steps[steps.length - 1].isAccepted}`)
        .toBe(`${token.type}("${token.lexeme}") accepted=true`);
    }
  });
});

describe('source edits invalidate previous results', () => {
  const lexer = new SteppedLexer(rules);

  test('re-lexing a changed source produces fresh offsets and no shared tokens', () => {
    const before = lexer.analyze('let x = 1;');
    const after = lexer.analyze('let xy = 12;');

    expect(before.tokens[2].lexeme).toBe('x');
    expect(after.tokens[2].lexeme).toBe('xy');
    expect(before.tokens[2].start.offset).toBe(4);
    expect(after.tokens[2].start.offset).toBe(4);
    expect(after.tokens[2].end.offset).toBe(6);
    expect(after.tokens[2]).not.toBe(before.tokens[2]);
    expect(before.tokens[2].lexeme).toBe('x');
    expect(before.tokens[6].lexeme).toBe('1');
    expect(after.tokens[6].lexeme).toBe('12');
  });

  test('analysing the same source twice returns independent, identical results', () => {
    const a = lexer.analyze('const n = 0x1f;');
    const b = lexer.analyze('const n = 0x1f;');
    expect(b.tokens.map(t => `${t.type}:${t.lexeme}:${t.start.offset}:${t.end.offset}`))
      .toEqual(a.tokens.map(t => `${t.type}:${t.lexeme}:${t.start.offset}:${t.end.offset}`));
    expect(b.tokens[0]).not.toBe(a.tokens[0]);
    expect(b.diagnostics).toHaveLength(0);
  });

  test('the plain Lexer and the SteppedLexer agree on the token stream', () => {
    const plain = new Lexer(rules).tokenize('let y = a <= 2.5;');
    const tracked = lexer.analyze('let y = a <= 2.5;').tokens;
    expect(tracked.map(t => `${t.type}:${t.lexeme}:${t.start.offset}:${t.end.offset}`))
      .toEqual(plain.map(t => `${t.type}:${t.lexeme}:${t.start.offset}:${t.end.offset}`));
  });
});
