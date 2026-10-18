// src/lexer.test.ts
import { Lexer, compileRuleRegex } from './lexer';
import { defaultTokenRules, RICH_JAVASCRIPT_RULES, LANGUAGE_PRESETS } from './defaultRules';
import { SteppedLexer } from './engine/steppedLexer';
import { TokenRule } from './types';

describe('Lexer', () => {
  const lexer = new Lexer(defaultTokenRules);

  test('recognizes keywords, identifiers, literals, operators and whitespace', () => {
    const source = `let total = 25 + count;`;
    const tokens = lexer.tokenize(source);
    const types = tokens.map(t => t.type);
    expect(types).toEqual([
      'KEYWORD',
      'WHITESPACE',
      'IDENTIFIER',
      'WHITESPACE',
      'OPERATOR',
      'WHITESPACE',
      'INTEGER_LITERAL',
      'WHITESPACE',
      'OPERATOR',
      'WHITESPACE',
      'IDENTIFIER',
      'OPERATOR',
    ]);
  });

  test('maximal munch prefers longer operator', () => {
    const source = `>=`;
    const tokens = lexer.tokenize(source);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('OPERATOR');
    expect(tokens[0].lexeme).toBe('>=');
  });

  test('keyword vs identifier priority', () => {
    const source = `letletter`;
    const tokens = lexer.tokenize(source);
    // Should be a single IDENTIFIER, not KEYWORD+IDENTIFIER because keyword rule has word boundary \b
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('IDENTIFIER');
    expect(tokens[0].lexeme).toBe('letletter');
  });

  test('unknown character handling', () => {
    const source = `@`;
    const tokens = lexer.tokenize(source);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('UNKNOWN');
    expect(tokens[0].lexeme).toBe('@');
  });

  test('empty input produces no tokens', () => {
    expect(lexer.tokenize('')).toEqual([]);
  });

  test('trailing token at EOF without newline is scanned', () => {
    const tokens = lexer.tokenize('let x');
    expect(tokens.map(t => t.type)).toEqual(['KEYWORD', 'WHITESPACE', 'IDENTIFIER']);
  });

  test('compileRuleRegex anchors top-level alternation', () => {
    // The pattern must only match at offset 0; the `y` branch must not match unanchored.
    const rules: TokenRule[] = [
      { name: 'AB', regex: 'x|y', priority: 1, enabled: true, color: '#fff', category: 'identifier' },
    ];
    const l = new Lexer(rules);
    const tokens = l.tokenize('ay');
    expect(tokens.map(t => t.lexeme)).toEqual(['a', 'y']);
    expect(tokens[1].start.offset).toBe(1);
  });

  test('zero-length-matching rule does not hang the scanner', () => {
    const rules: TokenRule[] = [
      { name: 'A_STAR', regex: 'a*', priority: 1, enabled: true, color: '#fff', category: 'identifier' },
      { name: 'CHAR', regex: '[a-z]', priority: 2, enabled: true, color: '#fff', category: 'identifier' },
    ];
    const l = new Lexer(rules);
    const tokens = l.tokenize('b');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('CHAR');
  });

  test('equal-length matches resolved by rule priority', () => {
    const rules: TokenRule[] = [
      { name: 'SECOND', regex: 'ab', priority: 2, enabled: true, color: '#fff', category: 'identifier' },
      { name: 'FIRST', regex: 'ab', priority: 1, enabled: true, color: '#fff', category: 'identifier' },
    ];
    const l = new Lexer(rules);
    const tokens = l.tokenize('ab');
    expect(tokens[0].type).toBe('FIRST');
  });

  test('disabled rules are ignored', () => {
    const rules: TokenRule[] = [
      { name: 'A', regex: 'a', priority: 1, enabled: false, color: '#fff', category: 'identifier' },
      { name: 'B', regex: 'a', priority: 2, enabled: true, color: '#fff', category: 'identifier' },
    ];
    const l = new Lexer(rules);
    expect(l.tokenize('a')[0].type).toBe('B');
  });

  test('invalid rule regex is ignored instead of crashing', () => {
    const rules: TokenRule[] = [
      { name: 'BROKEN', regex: '(unclosed', priority: 1, enabled: true, color: '#fff', category: 'identifier' },
      { name: 'OK', regex: 'a', priority: 2, enabled: true, color: '#fff', category: 'identifier' },
    ];
    const l = new Lexer(rules);
    const tokens = l.tokenize('a');
    expect(tokens[0].type).toBe('OK');
  });
});

describe('Rich JavaScript rules', () => {
  const lexer = new Lexer(RICH_JAVASCRIPT_RULES);
  const types = (s: string) => lexer.tokenize(s).map(t => t.type);
  const lexemes = (s: string) => lexer.tokenize(s).map(t => t.lexeme);

  test('all JavaScript keywords tokenize as KEYWORD', () => {
    const keywords = RICH_JAVASCRIPT_RULES.find(r => r.name === 'KEYWORD')!
      .regex.replace(/[()]/g, '')
      .replace(/\\b$/, '')
      .split('|');
    expect(keywords.length).toBeGreaterThan(30);
    for (const kw of keywords) {
      const tokens = lexer.tokenize(kw);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(`KEYWORD`);
      expect(tokens[0].lexeme).toBe(kw);
    }
  });

  test('identifiers with underscore and dollar sign', () => {
    expect(types('_x1')).toEqual(['IDENTIFIER']);
    expect(types('$foo')).toEqual(['IDENTIFIER']);
    expect(types('foo$bar9')).toEqual(['IDENTIFIER']);
  });

  test('integer, decimal, exponent and hex literals', () => {
    expect(types('42')).toEqual(['INTEGER_LITERAL']);
    expect(types('3.14')).toEqual(['DECIMAL_LITERAL']);
    expect(types('.5')).toEqual(['DECIMAL_LITERAL']);
    expect(types('1e10')).toEqual(['DECIMAL_LITERAL']);
    expect(types('2.5E-3')).toEqual(['DECIMAL_LITERAL']);
    expect(types('0xFF')).toEqual(['INTEGER_LITERAL']);
    expect(types('0xdeadBEEF')).toEqual(['INTEGER_LITERAL']);
  });

  test('string literals with escapes are single tokens', () => {
    expect(lexemes('"a\\"b"')).toEqual(['"a\\"b"']);
    expect(types('"a\\"b"')).toEqual(['STRING_LITERAL']);
    expect(types("'it\\'s'")).toEqual(['STRING_LITERAL']);
    expect(types('`template ${x} text`')).toEqual(['STRING_LITERAL']);
    expect(types('"no \\\\ backslash"')).toEqual(['STRING_LITERAL']);
  });

  test('line and block comments', () => {
    expect(types('// hello world')).toEqual(['LINE_COMMENT']);
    expect(types('/* multi\nline */')).toEqual(['BLOCK_COMMENT']);
    expect(types('x /* c */ y')).toEqual(['IDENTIFIER', 'WHITESPACE', 'BLOCK_COMMENT', 'WHITESPACE', 'IDENTIFIER']);
  });

  test('comparison, logical, assignment and arithmetic operators', () => {
    expect(types('===')).toEqual(['COMPARISON_OPERATOR']);
    expect(types('!==')).toEqual(['COMPARISON_OPERATOR']);
    expect(types('<=')).toEqual(['COMPARISON_OPERATOR']);
    expect(types('&&')).toEqual(['LOGICAL_OPERATOR']);
    expect(types('||')).toEqual(['LOGICAL_OPERATOR']);
    expect(types('??')).toEqual(['LOGICAL_OPERATOR']);
    expect(types('+=')).toEqual(['ASSIGNMENT_OPERATOR']);
    expect(types('=>')).toEqual(['ASSIGNMENT_OPERATOR']);
    expect(types('++')).toEqual(['ARITHMETIC_OPERATOR']);
    expect(types('--')).toEqual(['ARITHMETIC_OPERATOR']);
    expect(types('%')).toEqual(['ARITHMETIC_OPERATOR']);
  });

  test('punctuation: dot, colon, semicolon, commas, brackets', () => {
    expect(types('.')).toEqual(['DOT']);
    expect(types('...')).toEqual(['DOT']);
    expect(types(':')).toEqual(['COLON']);
    expect(types(';')).toEqual(['SEMICOLON']);
    expect(types(',')).toEqual(['COMMA']);
    expect(types('()')).toEqual(['PARENTHESIS', 'PARENTHESIS']);
    expect(types('{}')).toEqual(['BRACE', 'BRACE']);
    expect(types('[]')).toEqual(['BRACKET', 'BRACKET']);
  });

  test('member access expression tokenizes cleanly', () => {
    const tokens = lexer.tokenize('items[i].price');
    expect(tokens.map(t => t.lexeme)).toEqual(['items', '[', 'i', ']', '.', 'price']);
    expect(tokens.some(t => t.type === 'UNKNOWN')).toBe(false);
  });

  test('line and column tracking across \\n and \\r\\n', () => {
    const source = 'ab\ncd\r\nef';
    const tokens = lexer.tokenize(source);
    const byLexeme = (l: string) => tokens.find(t => t.lexeme === l)!;
    expect(byLexeme('ab').start).toEqual({ line: 0, column: 0, offset: 0 });
    expect(byLexeme('cd').start).toEqual({ line: 1, column: 0, offset: 3 });
    expect(byLexeme('cd').end).toEqual({ line: 1, column: 2, offset: 5 });
    expect(byLexeme('ef').start).toEqual({ line: 2, column: 0, offset: 7 });
    expect(byLexeme('ef').end).toEqual({ line: 2, column: 2, offset: 9 });
  });
});

describe('SteppedLexer diagnostics', () => {
  const stepped = new SteppedLexer(RICH_JAVASCRIPT_RULES);

  test('valid source produces no diagnostics and no UNKNOWN', () => {
    const result = stepped.analyze('let x = 42; // ok');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.filter(t => t.type === 'UNKNOWN')).toHaveLength(0);
  });

  test('unrecognized character produces an error diagnostic', () => {
    const result = stepped.analyze('let @ = 1;');
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0];
    expect(d.severity).toBe('error');
    expect(d.code).toBe('LEX_UNRECOGNIZED_CHAR');
    expect(d.pos.offset).toBe(4);
    expect(d.message).toContain('64');
    const unknown = result.tokens.find(t => t.type === 'UNKNOWN')!;
    expect(unknown.lexeme).toBe('@');
    expect(unknown.diagnostic).toBeDefined();
  });

  test('unterminated string literal produces a string diagnostic', () => {
    const result = stepped.analyze('let s = "abc');
    const d = result.diagnostics.find(x => x.code === 'LEX_UNTERMINATED_STRING');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('error');
    expect(d!.pos.offset).toBe(8);
  });

  test('unterminated block comment produces a warning, not an error', () => {
    const result = stepped.analyze('/* forever');
    const d = result.diagnostics.find(x => x.code === 'LEX_UNTERMINATED_BLOCK_COMMENT');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('warning');
    expect(result.diagnostics.filter(x => x.severity === 'error')).toHaveLength(0);
    expect(result.tokens.some(t => t.type === 'UNKNOWN')).toBe(false);
  });

  test('terminated block comment produces no diagnostic', () => {
    const result = stepped.analyze('/* done */');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.some(t => t.type === 'BLOCK_COMMENT')).toBe(true);
  });

  test('trace steps record candidates, emitted token and char', () => {
    const result = stepped.analyze('let x');
    expect(result.traceSteps).toHaveLength(3);
    const first = result.traceSteps[0];
    expect(first.stepIndex).toBe(1);
    expect(first.char).toBe('l');
    expect(first.activeCandidateRules.some(c => c.isBest)).toBe(true);
    expect(first.tokenEmitted?.lexeme).toBe('let');
    expect(first.action).toBe('EMIT_TOKEN');
    expect(result.traceSteps[2].pos).toBe(4);
  });

  test('trace marks the winner among multiple candidates', () => {
    const result = stepped.analyze('>=');
    const cands = result.traceSteps[0].activeCandidateRules;
    const winners = cands.filter(c => c.isBest);
    expect(winners).toHaveLength(1);
    expect(winners[0].matchedText).toBe('>=');
  });
});

describe('Language presets', () => {
  const presets = Object.entries(LANGUAGE_PRESETS);

  test('every preset sample source lexes with zero UNKNOWN tokens and zero errors', () => {
    for (const [key, preset] of presets) {
      const lexer = new Lexer(preset.rules);
      const stepped = new SteppedLexer(preset.rules);

      const unknowns = lexer.tokenize(preset.sampleSource).filter(t => t.type === 'UNKNOWN');
      expect(`${key}: ${unknowns.map(t => t.lexeme).join(',')}`).toBe(`${key}: `);

      const result = stepped.analyze(preset.sampleSource);
      expect(`${key} errors: ${result.diagnostics.filter(d => d.severity === 'error').length}`).toBe(`${key} errors: 0`);
      expect(result.tokens.filter(t => t.type === 'UNKNOWN')).toHaveLength(0);
    }
  });

  test('SQL keywords are case-insensitive', () => {
    const sql = LANGUAGE_PRESETS.sql;
    const lexer = new Lexer(sql.rules);
    const lower = lexer.tokenize('select id from users');
    expect(lower.filter(t => t.type === 'KEYWORD').map(t => t.lexeme)).toEqual(['select', 'from']);
    const upper = lexer.tokenize('SELECT ID FROM USERS');
    expect(upper.filter(t => t.type === 'KEYWORD').map(t => t.lexeme)).toEqual(['SELECT', 'FROM']);
  });

  test('SQL qualified identifiers and strings', () => {
    const lexer = new Lexer(LANGUAGE_PRESETS.sql.rules);
    const tokens = lexer.tokenize("u.id = 'ACTIVE'").filter(t => t.type !== 'WHITESPACE');
    expect(tokens.map(t => `${t.type}(${t.lexeme})`)).toEqual([
      'IDENTIFIER(u)',
      'OPERATOR(.)',
      'IDENTIFIER(id)',
      'OPERATOR(=)',
      "STRING_LITERAL('ACTIVE')",
    ]);
  });

  test('Python sample tokenizes def and comments', () => {
    const lexer = new Lexer(LANGUAGE_PRESETS.python.rules);
    const tokens = lexer.tokenize('def f(): # note\n  return 1');
    expect(tokens.some(t => t.type === 'KEYWORD' && t.lexeme === 'def')).toBe(true);
    expect(tokens.some(t => t.type === 'COMMENT' && t.lexeme === '# note')).toBe(true);
    expect(tokens.some(t => t.type === 'UNKNOWN')).toBe(false);
  });

  test('C sample tokenizes preprocessor and keywords', () => {
    const lexer = new Lexer(LANGUAGE_PRESETS.c_language.rules);
    const tokens = lexer.tokenize('#include <stdio.h>\nint main() { return 0; }');
    expect(tokens.some(t => t.type === 'PREPROCESSOR' && t.lexeme.startsWith('#include'))).toBe(true);
    expect(tokens.filter(t => t.type === 'KEYWORD').map(t => t.lexeme)).toEqual(['int', 'return']);
    expect(tokens.some(t => t.type === 'UNKNOWN')).toBe(false);
  });
});
