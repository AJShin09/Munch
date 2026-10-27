// src/engine/regexToAutomaton.ts
import { Automaton, AutomatonTransition } from '../types';
import { EPSILON, computeDefaultLayout, convertNfaToDfa, minimizeDfa } from './automaton';

/** A class element: a fixed char set, optionally negated (\D, \W, \S inside [...]).
 *  Semantics of the whole node: allowed = (∪ elements) then complemented if inverted.
 */
export interface ClassElement {
  set: Set<string>;
  negated: boolean;
}

/** AST Node types for regular expressions */
export type RegexNode =
  | { type: 'EMPTY' }
  | { type: 'EPSILON' }
  | { type: 'LITERAL'; char: string }
  | { type: 'CHAR_CLASS'; elements: ClassElement[]; inverted?: boolean; label: string }
  | { type: 'CONCAT'; left: RegexNode; right: RegexNode }
  | { type: 'UNION'; left: RegexNode; right: RegexNode }
  | { type: 'STAR'; child: RegexNode }
  | { type: 'PLUS'; child: RegexNode }
  | { type: 'OPTIONAL'; child: RegexNode };

/** Named escapes understood by the parser */
const ESCAPE_CHARS: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  f: '\f',
  v: '\v',
  '0': '\0',
};

const DIGIT_CHARS = new Set('0123456789'.split(''));
const WORD_CHARS = new Set(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')
);
const SPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f', '\v']);

/** Finite universe used to expand inverted character classes and '.'.
 *  Inverting a class over an infinite alphabet is impossible for an FA, so we
 *  use printable ASCII plus common whitespace plus every character that
 *  literally appears in the regex. This matches real lexer behavior for
 *  source text in that range. */
export function computeUniverse(ast: RegexNode): Set<string> {
  const mentioned = new Set<string>();
  const walk = (n: RegexNode): void => {
    switch (n.type) {
      case 'LITERAL':
        mentioned.add(n.char);
        break;
      case 'CHAR_CLASS':
        n.elements.forEach(el => {
          if (!el.negated) el.set.forEach(c => mentioned.add(c));
        });
        break;
      case 'CONCAT':
      case 'UNION':
        walk(n.left);
        walk(n.right);
        break;
      case 'STAR':
      case 'PLUS':
      case 'OPTIONAL':
        walk(n.child);
        break;
    }
  };
  walk(ast);

  const universe = new Set<string>();
  for (let code = 0x20; code <= 0x7e; code++) {
    universe.add(String.fromCharCode(code));
  }
  ['\t', '\n', '\r', '\f', '\v'].forEach(c => universe.add(c));
  mentioned.forEach(c => universe.add(c));
  return universe;
}

/** Simple Tokenizer and Recursive Descent Parser for Regular Expressions */
export class RegexParser {
  private input: string;
  private pos: number = 0;

  constructor(regex: string) {
    // Strip external start/end anchors if present (^, $)
    this.input = regex.replace(/^\^/, '').replace(/\$$/, '');
  }

  private peek(): string | null {
    return this.pos < this.input.length ? this.input[this.pos] : null;
  }

  private next(): string | null {
    return this.pos < this.input.length ? this.input[this.pos++] : null;
  }

  public parse(): RegexNode {
    if (this.input.length === 0) {
      return { type: 'EPSILON' };
    }
    const expression = this.parseUnion();
    if (this.peek() !== null) {
      throw new Error(`Unexpected '${this.peek()}' at position ${this.pos + 1}.`);
    }
    return expression;
  }

  // Union: Expr ('|' Expr)*
  private parseUnion(): RegexNode {
    let node = this.parseConcat();
    while (this.peek() === '|') {
      this.next(); // consume '|'
      const right = this.parseConcat();
      node = { type: 'UNION', left: node, right };
    }
    return node;
  }

  // Concat: Factor+
  private parseConcat(): RegexNode {
    const nodes: RegexNode[] = [];
    while (this.pos < this.input.length && this.peek() !== ')' && this.peek() !== '|') {
      nodes.push(this.parsePostfix());
    }
    if (nodes.length === 0) {
      return { type: 'EPSILON' };
    }
    return nodes.reduce((acc, curr) => ({ type: 'CONCAT', left: acc, right: curr }));
  }

  // Postfix: Atom (* | + | ? | {n,m})*
  private parsePostfix(): RegexNode {
    let node = this.parseAtom();
    while (true) {
      const c = this.peek();
      if (c === '*') {
        this.next();
        node = { type: 'STAR', child: node };
      } else if (c === '+') {
        this.next();
        node = { type: 'PLUS', child: node };
      } else if (c === '?') {
        this.next();
        node = { type: 'OPTIONAL', child: node };
      } else if (c === '{') {
        const quant = this.tryParseRepetition();
        if (!quant) break; // malformed {…} → treat as a literal atom in parseConcat
        node = this.applyRepetition(node, quant.min, quant.max);
      } else {
        break;
      }
    }
    return node;
  }

  /** Parse {n}, {n,} or {n,m}. Returns null (without consuming) if malformed. */
  private tryParseRepetition(): { min: number; max: number | null } | null {
    const start = this.pos;
    this.next(); // consume '{'
    const minStr = this.readDigits();
    if (minStr === null) {
      this.pos = start;
      return null;
    }
    const min = parseInt(minStr, 10);
    let max: number | null = min;
    if (this.peek() === ',') {
      this.next();
      const maxStr = this.readDigits();
      max = maxStr === null ? null : parseInt(maxStr, 10);
    }
    if (this.peek() !== '}') {
      this.pos = start;
      return null;
    }
    this.next();
    // Reject invalid or explosively large bounds – treat as literal text.
    if (max !== null && (max < min || max > 100) || min > 100) {
      this.pos = start;
      return null;
    }
    return { min, max };
  }

  private readDigits(): string | null {
    let s = '';
    while (this.peek() !== null && DIGIT_CHARS.has(this.peek()!)) {
      s += this.next();
    }
    return s.length > 0 ? s : null;
  }

  /**
   * Expand a bounded repetition into concat/optional/star nodes.
   * a{n}   → n copies,  a{n,} → n copies + a*,  a{n,m} → n copies + (m-n) optional copies.
   */
  private applyRepetition(node: RegexNode, min: number, max: number | null): RegexNode {
    const concat = (xs: RegexNode[]): RegexNode =>
      xs.reduce((acc, curr) => ({ type: 'CONCAT' as const, left: acc, right: curr }));

    if (max === null) {
      if (min === 0) return { type: 'STAR', child: node };
      const copies: RegexNode[] = [];
      for (let i = 0; i < min; i++) copies.push(node);
      return concat([...copies, { type: 'STAR', child: node }]);
    }

    const copies: RegexNode[] = [];
    for (let i = 0; i < min; i++) copies.push(node);
    for (let i = min; i < max; i++) copies.push({ type: 'OPTIONAL', child: node });
    if (copies.length === 0) return { type: 'EPSILON' };
    return copies.length === 1 ? copies[0] : concat(copies);
  }

  /** Read a backslash escape. The backslash must already be consumed. */
  private readEscape(): RegexNode {
    const esc = this.next();
    if (esc === null) return { type: 'LITERAL', char: '\\' };
    if (esc === 'd') {
      return { type: 'CHAR_CLASS', elements: [{ set: new Set(DIGIT_CHARS), negated: false }], label: '\\d' };
    }
    if (esc === 'D') {
      return { type: 'CHAR_CLASS', elements: [{ set: new Set(DIGIT_CHARS), negated: true }], label: '\\D' };
    }
    if (esc === 'w') {
      return { type: 'CHAR_CLASS', elements: [{ set: new Set(WORD_CHARS), negated: false }], label: '\\w' };
    }
    if (esc === 'W') {
      return { type: 'CHAR_CLASS', elements: [{ set: new Set(WORD_CHARS), negated: true }], label: '\\W' };
    }
    if (esc === 's') {
      return { type: 'CHAR_CLASS', elements: [{ set: new Set(SPACE_CHARS), negated: false }], label: '\\s' };
    }
    if (esc === 'S') {
      return { type: 'CHAR_CLASS', elements: [{ set: new Set(SPACE_CHARS), negated: true }], label: '\\S' };
    }
    if (esc === 'b') {
      // Word boundary in standard lexer regexes can be treated as epsilon for finite automaton
      return { type: 'EPSILON' };
    }
    if (esc in ESCAPE_CHARS) {
      return { type: 'LITERAL', char: ESCAPE_CHARS[esc] };
    }
    return { type: 'LITERAL', char: esc };
  }

  /** Read a single character-class element (literal or escape). */
  private readClassChar(): string {
    if (this.peek() === '\\') {
      this.next(); // consume '\'
      const esc = this.next() ?? '\\';
      if (esc in ESCAPE_CHARS) return ESCAPE_CHARS[esc];
      return esc;
    }
    return this.next()!;
  }

  // Atom: Char | Escape | CharClass | ( Expr )
  private parseAtom(): RegexNode {
    const c = this.peek();
    if (!c) {
      return { type: 'EPSILON' };
    }

    if (c === '(') {
      const groupStart = this.pos;
      this.next(); // consume '('
      if (this.peek() === '?') {
        this.next(); // consume '?'
        const mode = this.peek();
        if (mode === '=' || mode === '!') {
          throw new Error('Lookahead assertions (?=...) and (?!...) are not supported by finite automata.');
        }
        // Skip group prefixes: (?: non-capturing, (?<name> named, (?imsx-imsx: flags.
        while (this.pos < this.input.length) {
          const ch = this.peek();
          if (ch === ':') {
            this.next();
            break;
          }
          if (ch === ')') break;
          this.next();
        }
      }
      const node = this.parseUnion();
      if (this.peek() !== ')') {
        throw new Error(`Unclosed group starting at position ${groupStart + 1}.`);
      }
      this.next();
      return node;
    }

    if (c === '*' || c === '+' || c === '?') {
      throw new Error(`Unexpected quantifier '${c}' at position ${this.pos + 1}.`);
    }

    if (c === '[') {
      return this.parseCharClass();
    }

    if (c === '\\') {
      this.next(); // consume '\'
      return this.readEscape();
    }

    if (c === '.') {
      this.next();
      // JS-style '.': any character except line terminators
      return {
        type: 'CHAR_CLASS',
        elements: [{ set: new Set(['\n', '\r']), negated: false }],
        inverted: true,
        label: '.',
      };
    }

    // Regular literal character
    this.next();
    return { type: 'LITERAL', char: c };
  }

  private parseCharClass(): RegexNode {
    this.next(); // consume '['
    let inverted = false;
    if (this.peek() === '^') {
      inverted = true;
      this.next();
    }

    const elements: ClassElement[] = [];
    const contentStart = this.pos;

    while (this.pos < this.input.length && this.peek() !== ']') {
      let el: ClassElement | null = null;

      // Predefined class shorthands: \d \D \w \W \s \S
      if (this.peek() === '\\') {
        const save = this.pos;
        el = this.tryReadPredefinedClass();
        if (!el) this.pos = save;
      }

      if (!el) {
        const c = this.readClassChar();
        if (
          this.peek() === '-' &&
          this.pos + 1 < this.input.length &&
          this.input[this.pos + 1] !== ']' &&
          this.input[this.pos + 1] !== '\\'
        ) {
          this.next(); // consume '-'
          const endC = this.readClassChar();
          const set = new Set<string>();
          const startCode = c.charCodeAt(0);
          const endCode = endC.charCodeAt(0);
          if (startCode <= endCode) {
            for (let code = startCode; code <= endCode; code++) {
              set.add(String.fromCharCode(code));
            }
          } else {
            set.add(c);
            set.add(endC);
          }
          el = { set, negated: false };
        } else {
          el = { set: new Set([c]), negated: false };
        }
      }

      elements.push(el);
    }

    const rawLabel = this.input.slice(contentStart, this.pos);

    if (this.peek() !== ']') {
      throw new Error(`Unclosed character class starting at position ${contentStart}.`);
    }
    this.next(); // consume ']'

    if (elements.length === 0) {
      // Empty class [] matches nothing
      return { type: 'EMPTY' };
    }

    return {
      type: 'CHAR_CLASS',
      elements,
      inverted,
      label: `[${inverted ? '^' : ''}${rawLabel}]`,
    };
  }

  /** If positioned on `\` followed by d/D/w/W/s/S, consume it and return the element. */
  private tryReadPredefinedClass(): ClassElement | null {
    const save = this.pos;
    this.next(); // consume '\'
    const esc = this.peek();
    switch (esc) {
      case 'd':
      case 'D':
        this.next();
        return { set: new Set(DIGIT_CHARS), negated: esc === 'D' };
      case 'w':
      case 'W':
        this.next();
        return { set: new Set(WORD_CHARS), negated: esc === 'W' };
      case 's':
      case 'S':
        this.next();
        return { set: new Set(SPACE_CHARS), negated: esc === 'S' };
      default:
        this.pos = save;
        return null;
    }
  }
}

/** Thompson Construction Fragment */
interface Fragment {
  start: string;
  accept: string;
  states: string[];
  transitions: AutomatonTransition[];
  alphabet: Set<string>;
}

export class ThompsonBuilder {
  private stateCounter = 0;
  private universe: Set<string>;

  constructor(universe?: Set<string>) {
    this.universe = universe ?? new Set<string>();
  }

  private newState(): string {
    return `q${this.stateCounter++}`;
  }

  public buildFromAST(node: RegexNode): Fragment {
    switch (node.type) {
      case 'EMPTY': {
        const s = this.newState();
        const a = this.newState();
        return {
          start: s,
          accept: a,
          states: [s, a],
          transitions: [],
          alphabet: new Set(),
        };
      }

      case 'EPSILON': {
        const s = this.newState();
        const a = this.newState();
        return {
          start: s,
          accept: a,
          states: [s, a],
          transitions: [{ from: s, symbol: EPSILON, to: a }],
          alphabet: new Set(),
        };
      }

      case 'LITERAL': {
        const s = this.newState();
        const a = this.newState();
        return {
          start: s,
          accept: a,
          states: [s, a],
          transitions: [{ from: s, symbol: node.char, to: a }],
          alphabet: new Set([node.char]),
        };
      }

      case 'CHAR_CLASS': {
        const s = this.newState();
        const a = this.newState();
        const transitions: AutomatonTransition[] = [];
        const alphabet = new Set<string>();

        // allowed = union(elements), where negated elements contribute universe \ set,
        // then complemented over the universe when the class itself is inverted.
        const allowed = new Set<string>();
        for (const el of node.elements) {
          if (el.negated) {
            this.universe.forEach(char => {
              if (!el.set.has(char)) allowed.add(char);
            });
          } else {
            el.set.forEach(char => allowed.add(char));
          }
        }

        const finalSet = new Set<string>();
        if (node.inverted) {
          this.universe.forEach(char => {
            if (!allowed.has(char)) finalSet.add(char);
          });
        } else {
          allowed.forEach(char => {
            if (this.universe.has(char)) finalSet.add(char);
          });
        }

        finalSet.forEach(char => {
          transitions.push({ from: s, symbol: char, to: a });
          alphabet.add(char);
        });

        return {
          start: s,
          accept: a,
          states: [s, a],
          transitions,
          alphabet,
        };
      }

      case 'CONCAT': {
        const leftFrag = this.buildFromAST(node.left);
        const rightFrag = this.buildFromAST(node.right);

        // Connect left accept to right start via epsilon
        const transitions = [
          ...leftFrag.transitions,
          ...rightFrag.transitions,
          { from: leftFrag.accept, symbol: EPSILON, to: rightFrag.start },
        ];

        return {
          start: leftFrag.start,
          accept: rightFrag.accept,
          states: [...leftFrag.states, ...rightFrag.states],
          transitions,
          alphabet: new Set([...leftFrag.alphabet, ...rightFrag.alphabet]),
        };
      }

      case 'UNION': {
        const leftFrag = this.buildFromAST(node.left);
        const rightFrag = this.buildFromAST(node.right);
        const s = this.newState();
        const a = this.newState();

        const transitions: AutomatonTransition[] = [
          ...leftFrag.transitions,
          ...rightFrag.transitions,
          { from: s, symbol: EPSILON, to: leftFrag.start },
          { from: s, symbol: EPSILON, to: rightFrag.start },
          { from: leftFrag.accept, symbol: EPSILON, to: a },
          { from: rightFrag.accept, symbol: EPSILON, to: a },
        ];

        return {
          start: s,
          accept: a,
          states: [s, a, ...leftFrag.states, ...rightFrag.states],
          transitions,
          alphabet: new Set([...leftFrag.alphabet, ...rightFrag.alphabet]),
        };
      }

      case 'STAR': {
        const inner = this.buildFromAST(node.child);
        const s = this.newState();
        const a = this.newState();

        const transitions: AutomatonTransition[] = [
          ...inner.transitions,
          { from: s, symbol: EPSILON, to: inner.start },
          { from: s, symbol: EPSILON, to: a },
          { from: inner.accept, symbol: EPSILON, to: inner.start },
          { from: inner.accept, symbol: EPSILON, to: a },
        ];

        return {
          start: s,
          accept: a,
          states: [s, a, ...inner.states],
          transitions,
          alphabet: inner.alphabet,
        };
      }

      case 'PLUS': {
        const inner = this.buildFromAST(node.child);
        const s = this.newState();
        const a = this.newState();

        const transitions: AutomatonTransition[] = [
          ...inner.transitions,
          { from: s, symbol: EPSILON, to: inner.start },
          { from: inner.accept, symbol: EPSILON, to: inner.start },
          { from: inner.accept, symbol: EPSILON, to: a },
        ];

        return {
          start: s,
          accept: a,
          states: [s, a, ...inner.states],
          transitions,
          alphabet: inner.alphabet,
        };
      }

      case 'OPTIONAL': {
        const inner = this.buildFromAST(node.child);
        const s = this.newState();
        const a = this.newState();

        const transitions: AutomatonTransition[] = [
          ...inner.transitions,
          { from: s, symbol: EPSILON, to: inner.start },
          { from: s, symbol: EPSILON, to: a },
          { from: inner.accept, symbol: EPSILON, to: a },
        ];

        return {
          start: s,
          accept: a,
          states: [s, a, ...inner.states],
          transitions,
          alphabet: inner.alphabet,
        };
      }
    }
  }
}

export interface CompileOptions {
  /** Mirror letter transitions in both cases, matching RegExp's `i` flag */
  ignoreCase?: boolean;
}

/**
 * Add the opposite-case variant of every single ASCII letter transition.
 * Applied to the NFA before subset construction so the resulting DFA accepts
 * every case variant the JavaScript RegExp engine with the `i` flag accepts.
 */
function expandIgnoreCase(nfa: Automaton): Automaton {
  const present = new Set(nfa.transitions.map(t => `${t.from}||${t.symbol}||${t.to}`));
  const extra: AutomatonTransition[] = [];
  for (const t of nfa.transitions) {
    const sym = t.symbol;
    if (!sym || sym === EPSILON || sym.length !== 1 || !/[a-zA-Z]/.test(sym)) continue;
    const alt = sym === sym.toLowerCase() ? sym.toUpperCase() : sym.toLowerCase();
    const key = `${t.from}||${alt}||${t.to}`;
    if (present.has(key)) continue;
    present.add(key);
    extra.push({ from: t.from, symbol: alt, to: t.to });
  }
  if (extra.length === 0) return nfa;
  const alphabet = new Set(nfa.alphabet);
  for (const t of extra) alphabet.add(t.symbol!);
  return {
    ...nfa,
    transitions: [...nfa.transitions, ...extra],
    alphabet: Array.from(alphabet).sort(),
  };
}

/** Compile any regular expression into an ε-NFA via Thompson's Construction */
export function compileRegexToNfa(name: string, regexStr: string, opts?: CompileOptions): Automaton {
  const parser = new RegexParser(regexStr);
  const ast = parser.parse();
  const universe = computeUniverse(ast);
  const builder = new ThompsonBuilder(universe);
  const frag = builder.buildFromAST(ast);

  const states = Array.from(new Set(frag.states));
  const alphabet = Array.from(frag.alphabet).sort();

  const nfa: Automaton = {
    id: `nfa_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: `${name} (NFA)`,
    type: 'EPSILON_NFA',
    states,
    alphabet,
    transitions: frag.transitions,
    startState: frag.start,
    acceptingStates: [frag.accept],
    layout: computeDefaultLayout(states, frag.start),
  };

  return opts?.ignoreCase ? expandIgnoreCase(nfa) : nfa;
}

/** Memo table for compiled DFAs. Re-analysing the source after every keystroke
 *  would otherwise recompile every enabled rule's automaton from scratch, which
 *  dominates the whole analysis. Keyed by rule identity (name + flags + pattern);
 *  bounded so editing rule definitions cannot grow it without limit. */
const DFA_CACHE_LIMIT = 256;
const dfaCache = new Map<string, Automaton>();

/** Compile a regular expression directly to a minimized DFA (memoized).
 *  The returned automaton is treated as immutable/shared by all callers. */
export function compileRegexToDfa(name: string, regexStr: string, opts?: CompileOptions): Automaton {
  const key = `${name}\u0000${opts?.ignoreCase ? 'i' : ''}\u0000${regexStr}`;
  const cached = dfaCache.get(key);
  if (cached) return cached;

  const nfa = compileRegexToNfa(name, regexStr, opts);
  const dfa = minimizeDfa(convertNfaToDfa(nfa));

  if (dfaCache.size >= DFA_CACHE_LIMIT) {
    const oldest = dfaCache.keys().next().value;
    if (oldest !== undefined) dfaCache.delete(oldest);
  }
  dfaCache.set(key, dfa);
  return dfa;
}
