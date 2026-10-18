// src/engine/engine.test.ts
import { compileRegexToNfa, compileRegexToDfa } from './regexToAutomaton';
import { simulateAutomaton, convertNfaToDfa, minimizeDfa } from './automaton';
import { ArdenSolver } from './ardenSolver';
import { grammarToAutomaton, automatonToGrammar, generateGrammarDerivations } from './grammarEngine';
import { productAutomaton, complementAutomaton } from './languageOperations';
import { pumpingLemmaLanguages } from './pumpingLemma';
import { checkDfaEquivalence, checkRegexEquivalence } from './equivalenceChecker';
import { SteppedLexer } from './steppedLexer';
import { defaultTokenRules, RICH_JAVASCRIPT_RULES } from '../defaultRules';

describe('Formal Language & Automata Engine', () => {
  test('Thompson construction parses and simulates regex', () => {
    // Recognize (a|b)*abb
    const nfa = compileRegexToNfa('TestRegex', '(a|b)*abb');
    expect(nfa.states.length).toBeGreaterThan(0);

    const stepsAccept = simulateAutomaton(nfa, 'abb');
    expect(stepsAccept[stepsAccept.length - 1].isAccepted).toBe(true);

    const stepsAccept2 = simulateAutomaton(nfa, 'aabb');
    expect(stepsAccept2[stepsAccept2.length - 1].isAccepted).toBe(true);

    const stepsReject = simulateAutomaton(nfa, 'ab');
    expect(stepsReject[stepsReject.length - 1].isAccepted).toBe(false);
  });

  test('Subset construction converts NFA to DFA and minimizes', () => {
    const nfa = compileRegexToNfa('Simple', 'a(b|c)*');
    const dfa = convertNfaToDfa(nfa);
    expect(dfa.type).toBe('DFA');

    const minDfa = minimizeDfa(dfa);
    expect(minDfa.states.length).toBeLessThanOrEqual(dfa.states.length);

    const steps = simulateAutomaton(minDfa, 'abc');
    expect(steps[steps.length - 1].isAccepted).toBe(true);
  });

  test("Arden's Theorem derives regular expression from DFA", () => {
    const dfa = compileRegexToDfa('Loop', 'a*b');
    const { steps, finalRegex } = ArdenSolver.solve(dfa);

    expect(steps.length).toBeGreaterThan(0);
    expect(finalRegex).toBeDefined();
    expect(typeof finalRegex).toBe('string');
  });

  test('Grammar conversions and string generation', () => {
    // S -> a S | b
    const grammar = {
      id: 'g1',
      name: 'Test Grammar',
      nonTerminals: ['S'],
      terminals: ['a', 'b'],
      startSymbol: 'S',
      productions: [
        { id: 'p1', lhs: 'S', rhs: ['a', 'S'] },
        { id: 'p2', lhs: 'S', rhs: ['b'] },
      ],
    };

    const aut = grammarToAutomaton(grammar);
    expect(aut.states).toContain('S');

    const backToGrammar = automatonToGrammar(aut);
    expect(backToGrammar.productions.length).toBeGreaterThan(0);

    const derivations = generateGrammarDerivations(grammar, 3);
    expect(derivations.length).toBeGreaterThan(0);
    expect(derivations.map(d => d.string)).toContain('b');
  });

  test('Closure properties: Intersection and Complement', () => {
    // L1: strings starting with 'a'
    const m1 = compileRegexToDfa('StartsWithA', 'a(a|b)*');
    // L2: strings ending with 'a'
    const m2 = compileRegexToDfa('EndsWithA', '(a|b)*a');

    // Intersection: starts with a and ends with a
    const intersection = productAutomaton(m1, m2, 'INTERSECTION');
    expect(simulateAutomaton(intersection, 'aba')[3].isAccepted).toBe(true);
    expect(simulateAutomaton(intersection, 'ab')[2].isAccepted).toBe(false);

    // Complement of StartsWithA: does NOT start with 'a' (e.g. empty or starts with 'b')
    const comp = complementAutomaton(m1);
    expect(simulateAutomaton(comp, 'ba')[2].isAccepted).toBe(true);
    expect(simulateAutomaton(comp, 'ab')[2].isAccepted).toBe(false);
  });

  test('Pumping Lemma explorer validator and contradiction generator', () => {
    const anBn = pumpingLemmaLanguages.find(l => l.id === 'an_bn')!;
    expect(anBn.isInLanguage('aaabbb')).toBe(true);
    expect(anBn.isInLanguage('aabbb')).toBe(false);

    const s = anBn.defaultString(3); // "aaabbb"
    const decomp = anBn.validateDecomposition(s, 3, 'a', 'a', 'abbb');
    expect(decomp.valid).toBe(true);

    const pumpResult = anBn.findPumpingFailure(s, 3, 'a', 'a', 'abbb', 2);
    expect(pumpResult.inLanguage).toBe(false);
  });

  test('Equivalence checker verifies equivalent and non-equivalent automata', () => {
    const resIdentical = checkRegexEquivalence('(a|b)*', '(b|a)*');
    expect(resIdentical.areEquivalent).toBe(true);

    const resDiff = checkRegexEquivalence('a*b', 'b*a');
    expect(resDiff.areEquivalent).toBe(false);
    expect(resDiff.counterexample).toBeDefined();
  });

  test('SteppedLexer produces full execution trace and tokens', () => {
    const lexer = new SteppedLexer(defaultTokenRules);
    const result = lexer.analyze('let x = 42;');

    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.traceSteps.length).toBeGreaterThan(0);
    expect(result.diagnostics).toHaveLength(0);
  });
});

describe('Comment rules: DFA acceptance vs token matching', () => {
  const lineCommentRule = RICH_JAVASCRIPT_RULES.find(r => r.name === 'LINE_COMMENT')!;
  const blockCommentRule = RICH_JAVASCRIPT_RULES.find(r => r.name === 'BLOCK_COMMENT')!;
  const lineCommentDfa = compileRegexToDfa('LINE_COMMENT', lineCommentRule.regex);
  const blockCommentDfa = compileRegexToDfa('BLOCK_COMMENT', blockCommentRule.regex);

  const finalState = (m: ReturnType<typeof simulateAutomaton>) => m[m.length - 1];

  test('simulateAutomaton records one step per character plus the initial state', () => {
    const steps = simulateAutomaton(lineCommentDfa, '// hello');
    expect(steps).toHaveLength('// hello'.length + 1);
    steps.slice(1).forEach((s, i) => {
      expect(s.symbol).toBe('// hello'[i]);
      expect(s.inputIndex).toBe(i + 1);
    });
    expect(steps[0].symbol).toBeNull();
    expect(steps[0].inputIndex).toBe(0);
  });

  test('// hello is accepted by the LINE_COMMENT DFA', () => {
    const steps = simulateAutomaton(lineCommentDfa, '// hello');
    expect(finalState(steps).isAccepted).toBe(true);
    // The accepting state must consume the entire string
    expect(finalState(steps).inputIndex).toBe('// hello'.length);
  });

  test('// Interactive Lexical Analyzer Demo is accepted by the LINE_COMMENT DFA', () => {
    const s = '// Interactive Lexical Analyzer Demo';
    const steps = simulateAutomaton(lineCommentDfa, s);
    expect(finalState(steps).isAccepted).toBe(true);
    expect(finalState(steps).inputIndex).toBe(s.length);
  });

  test('empty input is not accepted by the LINE_COMMENT DFA (requires //)', () => {
    const steps = simulateAutomaton(lineCommentDfa, '');
    expect(steps).toHaveLength(1);
    expect(finalState(steps).isAccepted).toBe(false);
  });

  test('/ alone is not a complete line comment: DFA rejects', () => {
    const steps = simulateAutomaton(lineCommentDfa, '/');
    expect(finalState(steps).isAccepted).toBe(false);
    // The lexer matches '/' as an arithmetic operator, not a comment
    const lexer = new SteppedLexer(RICH_JAVASCRIPT_RULES);
    const result = lexer.analyze('/');
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe('ARITHMETIC_OPERATOR');
    expect(result.tokens[0].lexeme).toBe('/');
  });

  test('/* block comment */ is accepted by the BLOCK_COMMENT DFA', () => {
    const s = '/* block comment */';
    const steps = simulateAutomaton(blockCommentDfa, s);
    expect(finalState(steps).isAccepted).toBe(true);
    expect(finalState(steps).inputIndex).toBe(s.length);
  });

  test('/* without closing */ is not accepted by the BLOCK_COMMENT DFA', () => {
    const steps = simulateAutomaton(blockCommentDfa, '/* forever');
    expect(finalState(steps).isAccepted).toBe(false);
  });

  test('line comment followed by newline and another token', () => {
    const lexer = new SteppedLexer(RICH_JAVASCRIPT_RULES);
    const src = '// note\nlet x;';
    const result = lexer.analyze(src);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.filter(t => t.type === 'UNKNOWN')).toHaveLength(0);
    expect(result.tokens.map(t => t.type)).toEqual([
      'LINE_COMMENT', 'WHITESPACE', 'KEYWORD', 'WHITESPACE', 'IDENTIFIER', 'SEMICOLON',
    ]);

    const comment = result.tokens[0];
    expect(comment.lexeme).toBe('// note');
    expect(comment.start.offset).toBe(0);
    expect(comment.end.offset).toBe(7);

    // The DFA accepts the exact comment lexeme the lexer emitted…
    expect(finalState(simulateAutomaton(lineCommentDfa, comment.lexeme)).isAccepted).toBe(true);
    // …but not the lexeme with the trailing newline glued on: maximal munch
    // stopped exactly where the DFA can no longer extend the match.
    expect(finalState(simulateAutomaton(lineCommentDfa, '// note\n')).isAccepted).toBe(false);

    // Token-level trace: one step per emitted token, in order
    expect(result.traceSteps).toHaveLength(result.tokens.length);
    expect(result.traceSteps[0].action).toBe('EMIT_TOKEN');
    expect(result.traceSteps[0].pos).toBe(0);
    expect(result.traceSteps[1].char).toBe('\n');
  });

  test('a dead state mid-lexeme rejects: "//" followed by an out-of-alphabet char', () => {
    // The DFA alphabet is ASCII-based; '€' has no transition out of the comment body
    const steps = simulateAutomaton(lineCommentDfa, '//x€');
    const last = finalState(steps);
    expect(last.activeStates.size).toBe(0);
    expect(last.isAccepted).toBe(false);
  });
});
