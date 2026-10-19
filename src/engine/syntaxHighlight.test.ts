// src/engine/syntaxHighlight.test.ts
// Unit tests for usage-based source syntax highlighting.
import { SteppedLexer } from './steppedLexer';
import { RICH_JAVASCRIPT_RULES, defaultTokenRules } from '../defaultRules';
import { Token, TokenRule } from '../types';
import {
  buildSyntaxSegments,
  classForToken,
  CONTROL_KEYWORDS,
  SynSegment,
} from './syntaxHighlight';

const segs = (src: string, rules: TokenRule[] = RICH_JAVASCRIPT_RULES): SynSegment[] => {
  const tokens = new SteppedLexer(rules).analyze(src).tokens;
  return buildSyntaxSegments(src, tokens, rules);
};

const pairs = (src: string, rules: TokenRule[] = RICH_JAVASCRIPT_RULES) =>
  segs(src, rules).map(s => [s.text, s.cls]);

/** Assert segments exactly tile the source with no gaps or overlaps. */
const assertCovers = (src: string, rules: TokenRule[] = RICH_JAVASCRIPT_RULES) => {
  const ss = segs(src, rules);
  expect(ss.map(s => s.text).join('')).toBe(src);
  let cursor = 0;
  for (const s of ss) {
    expect(s.text.length).toBeGreaterThan(0);
    expect(s.start).toBe(cursor);
    cursor = s.end;
  }
  expect(cursor).toBe(src.length);
};

const pos = (offset: number) => ({ line: 0, column: offset, offset });
const fakeToken = (lexeme: string, start: number, end = start + lexeme.length): Token => ({
  type: 'X',
  lexeme,
  start: pos(start),
  end: pos(end),
});

describe('classForToken', () => {
  it('distinguishes control-flow keywords from declaration keywords', () => {
    expect(pairs('if')).toEqual([['if', 'control']]);
    expect(pairs('return')).toEqual([['return', 'control']]);
    expect(pairs('for')).toEqual([['for', 'control']]);
    expect(pairs('let')).toEqual([['let', 'keyword']]);
    expect(pairs('class')).toEqual([['class', 'keyword']]);
  });

  it('matches control keywords case-insensitively', () => {
    expect(CONTROL_KEYWORDS.has('if')).toBe(true);
    expect(CONTROL_KEYWORDS.has('WHILE')).toBe(false);
    const rule: TokenRule = { name: 'KEYWORD', regex: 'x', priority: 1, enabled: true, category: 'keyword' };
    const tok = fakeToken('IF', 0);
    expect(classForToken(tok, rule, undefined)).toBe('control');
  });

  it('lets an error diagnostic win over the rule category', () => {
    const tok: Token = {
      ...fakeToken('if', 0),
      ruleName: 'KEYWORD',
      diagnostic: { severity: 'error', message: 'bad', pos: pos(0) },
    };
    const rule: TokenRule = { name: 'KEYWORD', regex: 'if', priority: 1, enabled: true, category: 'keyword' };
    expect(classForToken(tok, rule, undefined)).toBe('error');
  });
});

describe('literals', () => {
  it('colors strings and numbers by lexeme shape', () => {
    expect(pairs('"hi"')).toEqual([['"hi"', 'string']]);
    expect(pairs("'hi'")).toEqual([["'hi'", 'string']]);
    expect(pairs('42')).toEqual([['42', 'number']]);
    expect(pairs('3.14')).toEqual([['3.14', 'number']]);
    expect(pairs('0xFF')).toEqual([['0xFF', 'number']]);
  });

  it('falls back to the rule name for a literal that is not obviously a number', () => {
    const rule: TokenRule = { name: 'STRING_LITERAL', regex: 'x', priority: 1, enabled: true, category: 'literal' };
    expect(classForToken(fakeToken('weird', 0), rule, undefined)).toBe('string');
  });
});

describe('identifiers', () => {
  it('marks a call as a function, an uppercase name as a type, otherwise a variable', () => {
    expect(pairs('foo(1)')[0]).toEqual(['foo', 'function']);
    expect(pairs('Foo')).toEqual([['Foo', 'type']]);
    expect(pairs('bar')).toEqual([['bar', 'variable']]);
  });

  it('treats an uppercase call as a function (call check precedes type check)', () => {
    expect(pairs('Foo()')[0]).toEqual(['Foo', 'function']);
  });

  it('skips whitespace when looking for the following token', () => {
    expect(pairs('foo (1)')[0]).toEqual(['foo', 'function']);
    expect(pairs('items.length')[0]).toEqual(['items', 'variable']);
  });
});

describe('operators, punctuation, comments, whitespace', () => {
  it('classifies comments', () => {
    expect(pairs('// hi')).toEqual([['// hi', 'comment']]);
  });

  it('classifies operators and separators distinctly', () => {
    expect(pairs('a + b;')).toEqual([
      ['a', 'variable'],
      [' ', ''],
      ['+', 'operator'],
      [' ', ''],
      ['b', 'variable'],
      [';', 'punct'],
    ]);
  });

  it('leaves whitespace unstyled', () => {
    expect(pairs('  ')).toEqual([['  ', '']]);
  });

  it('marks an unrecognized character as an error', () => {
    expect(pairs('@')).toEqual([['@', 'error']]);
  });
});

describe('buildSyntaxSegments — gap handling', () => {
  it('marks a non-whitespace gap between tokens as an error', () => {
    const src = 'ab@cd';
    const tokens = [fakeToken('ab', 0), fakeToken('cd', 3)];
    expect(buildSyntaxSegments(src, tokens, [])).toEqual([
      { text: 'ab', cls: 'variable', start: 0, end: 2 },
      { text: '@', cls: 'error', start: 2, end: 3 },
      { text: 'cd', cls: 'variable', start: 3, end: 5 },
    ]);
  });

  it('leaves a whitespace-only gap unstyled', () => {
    const src = 'ab cd';
    const tokens = [fakeToken('ab', 0), fakeToken('cd', 3)];
    expect(buildSyntaxSegments(src, tokens, [])).toEqual([
      { text: 'ab', cls: 'variable', start: 0, end: 2 },
      { text: ' ', cls: '', start: 2, end: 3 },
      { text: 'cd', cls: 'variable', start: 3, end: 5 },
    ]);
  });

  it('appends a trailing gap so the whole source is covered', () => {
    const src = 'ab??';
    const tokens = [fakeToken('ab', 0)];
    expect(buildSyntaxSegments(src, tokens, [])).toEqual([
      { text: 'ab', cls: 'variable', start: 0, end: 2 },
      { text: '??', cls: 'error', start: 2, end: 4 },
    ]);
  });

  it('skips zero-length tokens without stalling coverage', () => {
    const src = 'ab';
    const tokens = [fakeToken('', 0, 0), fakeToken('ab', 0)];
    expect(buildSyntaxSegments(src, tokens, [])).toEqual([
      { text: 'ab', cls: 'variable', start: 0, end: 2 },
    ]);
  });

  it('merges adjacent segments of the same class', () => {
    const tokens = [fakeToken('ab', 0), fakeToken('cd', 2)];
    expect(buildSyntaxSegments('abcd', tokens, [])).toEqual([
      { text: 'abcd', cls: 'variable', start: 0, end: 4 },
    ]);
  });

  it('returns nothing for empty source', () => {
    expect(buildSyntaxSegments('', [], [])).toEqual([]);
  });
});

describe('integration with the real lexer', () => {
  it('classifies the default 5-rule preset', () => {
    expect(pairs('let total = 25 + count;', defaultTokenRules)).toEqual([
      ['let', 'keyword'],
      [' ', ''],
      ['total', 'variable'],
      [' ', ''],
      ['=', 'operator'],
      [' ', ''],
      ['25', 'number'],
      [' ', ''],
      ['+', 'operator'],
      [' ', ''],
      ['count', 'variable'],
      [';', 'operator'],
    ]);
  });

  it('covers a full multi-line JavaScript sample with no gaps', () => {
    const src = [
      '// demo',
      'function add(a, b) {',
      '  return a + b;',
      '}',
      '',
    ].join('\n');
    assertCovers(src);
  });

  it('covers sources ending in a newline and the empty string', () => {
    assertCovers('const x = 1;\n');
    assertCovers('');
  });
});
