// src/engine/dfaPanelModel.test.ts
//
// Regression tests for the single canonical DFA-panel simulation model:
// the graph highlight, the character strip, the counter, the transition
// readout and the accept/reject badges must all derive from one trace and
// one index — reproducing the exact class of desync where the panel showed
// position 0 with the graph on the start state while the transition readout
// reported a transition from a later state.
import { deriveDfaPanelModel } from './dfaPanelModel';
import { simulateAutomaton, stepAutomaton, epsilonClosure } from './automaton';
import { compileRegexToDfa } from './regexToAutomaton';
import { SteppedLexer } from './steppedLexer';
import { RICH_JAVASCRIPT_RULES, LANGUAGE_PRESETS } from '../defaultRules';
import { TokenRule, Automaton } from '../types';

const finalStep = (steps: ReturnType<typeof simulateAutomaton>) => steps[steps.length - 1];

const setOf = (xs: Iterable<string>) => new Set(xs);

describe('Canonical DFA panel model — index semantics and single-source readouts', () => {
  const lineCommentRule = RICH_JAVASCRIPT_RULES.find(r => r.name === 'LINE_COMMENT')!;
  const dfa = compileRegexToDfa('LINE_COMMENT', lineCommentRule.regex);
  const lexeme = '// Interactive Lexical Analyzer Demo'; // 36 characters

  test('the reported desync cannot occur: at index 0 the graph, counter, strip and readout share one step', () => {
    expect(lexeme).toHaveLength(36);
    const steps = simulateAutomaton(dfa, lexeme);
    const m = deriveDfaPanelModel(steps, 0);

    // Counter and strip position
    expect(m.idx).toBe(0);
    expect(m.chars).toHaveLength(36);
    expect(m.chars[m.idx]).toBe('/'); // the character the readout names

    // Graph highlight IS the readout's "from" state — the same object, not a copy
    expect(m.activeStates).toBe(m.current!.activeStates);
    expect(m.activeStates).toBe(steps[0].activeStates);
    expect(setOf(m.activeStates)).toEqual(setOf(steps[0].activeStates));

    // Readout "from → to" pair
    expect(m.current).toBe(steps[0]);
    expect(m.next).toBe(steps[1]);
    expect(m.current!.symbol).toBeNull(); // nothing consumed yet
    expect(m.complete).toBe(false);
  });

  test('steps[i] is the state after consuming characters 0..i-1 — exact index contract', () => {
    const steps = simulateAutomaton(dfa, lexeme);
    expect(steps).toHaveLength(lexeme.length + 1);

    steps.forEach((s, i) => {
      expect(s.inputIndex).toBe(i);
      expect(s.symbol).toBe(i === 0 ? null : lexeme[i - 1]);
    });

    for (let k = 0; k <= lexeme.length; k++) {
      const m = deriveDfaPanelModel(steps, k);
      expect(m.idx).toBe(k);
      expect(m.current).toBe(steps[k]);
      expect(m.next).toBe(steps[k + 1]);
      expect(m.complete).toBe(k === lexeme.length);
      expect(m.dead).toBe(false);
    }

    // The strip is the simulation's own input — it cannot drift from the lexeme
    const end = deriveDfaPanelModel(steps, lexeme.length);
    expect(end.chars.join('')).toBe(lexeme);
    expect(end.chars).toHaveLength(lexeme.length);
  });

  test('graph highlight equals the independently replayed machine state at every index', () => {
    const steps = simulateAutomaton(dfa, lexeme);
    let replay = epsilonClosure(dfa, setOf([dfa.startState]));
    expect(setOf(deriveDfaPanelModel(steps, 0).activeStates)).toEqual(replay);

    for (let i = 0; i < lexeme.length; i++) {
      replay = stepAutomaton(dfa, replay, lexeme[i]);
      const m = deriveDfaPanelModel(steps, i + 1);
      expect(setOf(m.activeStates)).toEqual(replay);
      expect(m.activeStates).toBe(m.current!.activeStates);
    }
  });

  test('stepping backward is pure: revisiting an index reproduces the identical model', () => {
    const steps = simulateAutomaton(dfa, lexeme);
    const a = deriveDfaPanelModel(steps, 7);
    // visit later indices (as playback would), then step back
    deriveDfaPanelModel(steps, 30);
    deriveDfaPanelModel(steps, 12);
    const b = deriveDfaPanelModel(steps, 7);

    expect(b.idx).toBe(a.idx);
    expect(b.current).toBe(a.current);
    expect(b.next).toBe(a.next);
    expect(setOf(b.activeStates)).toEqual(setOf(a.activeStates));
    expect(b.activeTransition).toEqual(a.activeTransition);
    expect(b.complete).toBe(a.complete);
    expect(b.accepted).toBe(a.accepted);
  });

  test('play-to-the-end and manual stepping agree on the terminal model and acceptance', () => {
    const steps = simulateAutomaton(dfa, lexeme);

    // Manual: click "next character" until there is none left
    let manual = deriveDfaPanelModel(steps, 0);
    while (!manual.complete) manual = deriveDfaPanelModel(steps, manual.idx + 1);

    // Auto-play: the play loop drives the same index to chars.length
    const played = deriveDfaPanelModel(steps, lexeme.length);

    expect(manual.idx).toBe(played.idx);
    expect(manual.current).toBe(played.current);
    expect(manual.accepted).toBe(played.accepted);
    expect(played.complete).toBe(true);
    expect(played.accepted).toBe(true); // full line-comment lexeme
  });

  test('reset returns to the initial state — identical to a fresh simulation', () => {
    const steps = simulateAutomaton(dfa, lexeme);
    deriveDfaPanelModel(steps, 36); // play to the end…
    const afterReset = deriveDfaPanelModel(steps, 0); // …then reset to index 0
    const fresh = deriveDfaPanelModel(simulateAutomaton(dfa, lexeme), 0);

    expect(afterReset.idx).toBe(0);
    expect(afterReset.complete).toBe(false);
    expect(setOf(afterReset.activeStates)).toEqual(setOf(fresh.activeStates));
    expect(afterReset.activeStates).toBe(steps[0].activeStates);
  });

  test('activeTransition derives from the same current/next pair as the readout', () => {
    const steps = simulateAutomaton(dfa, lexeme);
    const m = deriveDfaPanelModel(steps, 1);
    expect(m.current).toBe(steps[1]);
    expect(m.next).toBe(steps[2]);
    expect(m.activeTransition).toEqual({
      from: Array.from(steps[1].activeStates)[0],
      to: Array.from(steps[2].activeStates)[0],
    });

    const atEnd = deriveDfaPanelModel(steps, lexeme.length);
    expect(atEnd.activeTransition).toBeNull(); // end of input — no transition to draw
  });

  test('dead state mid-lexeme: model reports dead while the strip is not complete', () => {
    const steps = simulateAutomaton(dfa, 'a/b'); // no transition on 'a' from the start state
    const m = deriveDfaPanelModel(steps, 1);
    expect(m.dead).toBe(true);
    expect(m.complete).toBe(false);
    expect(m.activeStates.size).toBe(0);
    expect(m.chars).toHaveLength(3);
  });

  test('empty lexeme: one initial step, complete at index 0, rejection', () => {
    const steps = simulateAutomaton(dfa, '');
    expect(steps).toHaveLength(1);
    const m = deriveDfaPanelModel(steps, 0);
    expect(m.chars).toHaveLength(0);
    expect(m.idx).toBe(0);
    expect(m.complete).toBe(true);
    expect(m.accepted).toBe(false); // the empty string is not a line comment
    expect(m.activeTransition).toBeNull();
    expect(m.dead).toBe(false);
  });

  test('out-of-range raw index is clamped into the trace; empty trace is safe', () => {
    const steps = simulateAutomaton(dfa, '//x');
    expect(deriveDfaPanelModel(steps, 999).idx).toBe(steps.length - 1);
    expect(deriveDfaPanelModel(steps, -5).idx).toBe(0);

    const none = deriveDfaPanelModel([], 5);
    expect(none.idx).toBe(0);
    expect(none.complete).toBe(false);
    expect(none.accepted).toBe(false);
    expect(none.activeStates.size).toBe(0);
    expect(none.current).toBeUndefined();
    expect(none.activeTransition).toBeNull();
  });
});

describe('Lexer and DFA simulator agree on every emitted token', () => {
  const expectAgreement = (label: string, rules: TokenRule[], source: string) => {
    const lexer = new SteppedLexer(rules);
    const result = lexer.analyze(source);
    const emitted = result.tokens.filter(t => t.type !== 'UNKNOWN');
    expect(emitted.length).toBeGreaterThan(0);

    for (const tok of emitted) {
      // Every emitted token must carry a compiled rule DFA (the panel's source)
      expect(tok.automaton).toBeDefined();
      const dfa = tok.automaton as Automaton;

      const steps = simulateAutomaton(dfa, tok.lexeme);
      const m = deriveDfaPanelModel(steps, steps.length - 1);

      // The panel's strip is exactly the lexer's lexeme
      expect(m.chars.join('')).toBe(tok.lexeme);
      expect(m.complete).toBe(true);

      // The core agreement: the DFA accepts precisely the lexeme the lexer emitted
      expect({ label, rule: tok.type, lexeme: tok.lexeme, accepted: m.accepted })
        .toEqual({ label, rule: tok.type, lexeme: tok.lexeme, accepted: true });
      expect(finalStep(steps).isAccepted).toBe(true);
    }
    return result;
  };

  test('all language presets: every non-UNKNOWN token is accepted by its own rule DFA', () => {
    for (const [key, preset] of Object.entries(LANGUAGE_PRESETS)) {
      expectAgreement(key, preset.rules, preset.sampleSource);
    }
  });

  test('JavaScript rich rules: line comments, strings, numbers and operators agree', () => {
    const src = [
      '// Interactive Lexical Analyzer Demo',
      'const msg = "hello \\"world\\"";',
      'let count = 42;',
      'count = count + 1; /* block */ end',
      '',
    ].join('\n');
    expectAgreement('javascript_rich', RICH_JAVASCRIPT_RULES, src);
  });

  test('SQL case-insensitive keywords agree despite mixed case in the source', () => {
    const sql = LANGUAGE_PRESETS.sql;
    const result = expectAgreement('sql', sql.rules, sql.sampleSource);
    const keyword = result.tokens.find(t => t.type === 'KEYWORD');
    expect(keyword).toBeDefined();
    expect(keyword!.lexeme).toBe('SELECT'); // uppercase source, pattern is uppercase too
  });

  test('caseInsensitive flag: DFA accepts every case variant, matching RegExp i', () => {
    const rule = LANGUAGE_PRESETS.sql.rules.find(r => r.name === 'KEYWORD')!;
    const ciDfa = compileRegexToDfa('KEYWORD', rule.regex, { ignoreCase: true });
    for (const w of ['SELECT', 'select', 'Select', 'fRoM', 'wHeRe']) {
      expect({
        word: w,
        accepted: finalStep(simulateAutomaton(ciDfa, w)).isAccepted,
      }).toEqual({ word: w, accepted: true });
    }

    // Without the flag the DFA stays case-sensitive for literal patterns
    const csDfa = compileRegexToDfa('KEYWORD', rule.regex);
    expect(finalStep(simulateAutomaton(csDfa, 'SELECT')).isAccepted).toBe(true);
    expect(finalStep(simulateAutomaton(csDfa, 'select')).isAccepted).toBe(false);
  });

  test('line-comment recognizer: DFA accepts the emitted comment and rejects a plain word', () => {
    const lexer = new SteppedLexer(RICH_JAVASCRIPT_RULES);
    const result = lexer.analyze('// note\nabc');
    const comment = result.tokens[0];
    expect(comment.type).toBe('LINE_COMMENT');

    const commentSteps = simulateAutomaton(comment.automaton!, comment.lexeme);
    expect(finalStep(commentSteps).isAccepted).toBe(true);

    const word = result.tokens.find(t => t.type === 'IDENTIFIER')!;
    expect(word.lexeme).toBe('abc');
    // The LINE_COMMENT DFA must reject a plain word even though the lexer
    // emitted it via the IDENTIFIER rule
    expect(finalStep(simulateAutomaton(comment.automaton!, 'abc')).isAccepted).toBe(false);
  });
});

describe('Screenshot state: the highlighted state is the CURRENT state, not the destination', () => {
  const lineCommentRule = RICH_JAVASCRIPT_RULES.find(r => r.name === 'LINE_COMMENT')!;
  const dfa = compileRegexToDfa('LINE_COMMENT', lineCommentRule.regex);
  const lexeme = '// Interactive Lexical Analyzer Demo'; // 36 characters

  test('at counter 0/N: highlight = initial state = start state, readout = {start} → {next}, char = first char', () => {
    expect(lexeme).toHaveLength(36);
    const steps = simulateAutomaton(dfa, lexeme);
    expect(steps).toHaveLength(37); // initial step + one per character

    const m = deriveDfaPanelModel(steps, 0);

    // Consumed-character count and the current (next-to-consume) character
    expect(m.idx).toBe(0);
    expect(m.chars).toHaveLength(36);
    expect(m.chars[m.idx]).toBe('/');
    expect(m.current!.symbol).toBeNull(); // nothing consumed yet
    expect(m.current!.inputIndex).toBe(0);

    // The graph highlight IS the readout's "from" set — the same object:
    // the current state, which at index 0 is the initial/start state.
    expect(m.activeStates).toBe(m.current!.activeStates);
    expect(setOf(m.activeStates)).toEqual(setOf([dfa.startState]));

    // The destination of the next transition is a different state — the
    // highlight is the source, never the "→" target.
    expect(setOf(m.next!.activeStates)).not.toEqual(setOf(m.activeStates));
    expect(m.activeTransition).toEqual({
      from: dfa.startState,
      to: Array.from(m.next!.activeStates)[0],
    });

    // Graph labels (START ring, accepting ring) come from the same automaton:
    // for LINE_COMMENT the start state is not accepting, so the screenshot's
    // "s1 start, s0 accepting" is two distinct nodes — a naming artifact of
    // partition-refinement (accepting partition is named first), not a mislabel.
    expect(dfa.acceptingStates).toHaveLength(1);
    expect(setOf(m.activeStates).has(dfa.acceptingStates[0])).toBe(false);
    expect(dfa.acceptingStates).not.toContain(dfa.startState);

    // After consuming the whole lexeme the current state sits in the accepting one
    const end = deriveDfaPanelModel(steps, 36);
    expect(setOf(end.activeStates)).toEqual(setOf(dfa.acceptingStates));
    expect(end.accepted).toBe(true);
  });

  test('at a mid-lexeme index highlight, current char, transition status and count agree', () => {
    const steps = simulateAutomaton(dfa, lexeme);
    const k = 5;
    const m = deriveDfaPanelModel(steps, k);

    expect(m.idx).toBe(k); // counter: characters consumed
    expect(m.chars[m.idx]).toBe(lexeme[k]); // strip/readout: next char to consume
    expect(m.activeStates).toBe(m.current!.activeStates); // graph highlight = "from"
    expect(m.current).toBe(steps[k]);
    expect(m.next).toBe(steps[k + 1]);
    expect(m.activeTransition).toEqual({
      from: Array.from(steps[k].activeStates)[0],
      to: Array.from(steps[k + 1].activeStates)[0],
    });
    // consumed prefix in the strip is exactly idx characters
    expect(m.chars.slice(0, k).join('')).toBe(lexeme.slice(0, k));
  });
});

describe('LINE_COMMENT recognizer: acceptance table', () => {
  const lineCommentRule = RICH_JAVASCRIPT_RULES.find(r => r.name === 'LINE_COMMENT')!;
  const dfa = compileRegexToDfa('LINE_COMMENT', lineCommentRule.regex);

  // [input, expected acceptance, expected final state empty (dead)]
  const cases: Array<[string, boolean, boolean]> = [
    ['// hello', true, false],
    ['// Interactive Lexical Analyzer Demo', true, false],
    ['/', false, false],
    ['abc', false, true],
  ];

  test.each(cases)('input %s → accepted=%s dead=%s', (input, expectedAccept, expectedDead) => {
    const steps = simulateAutomaton(dfa, input);
    const last = finalStep(steps);

    expect(last.isAccepted).toBe(expectedAccept);
    expect(last.activeStates.size === 0).toBe(expectedDead);

    const m = deriveDfaPanelModel(steps, steps.length - 1);
    expect(m.complete).toBe(true);
    expect(m.accepted).toBe(expectedAccept);
    expect(m.dead).toBe(false); // a simulation that consumed everything is never "dead mid-lexeme"
  });
});

describe('Control paths: forward, backward, play and reset move one index over one trace', () => {
  const lineCommentRule = RICH_JAVASCRIPT_RULES.find(r => r.name === 'LINE_COMMENT')!;
  const dfa = compileRegexToDfa('LINE_COMMENT', lineCommentRule.regex);
  const lexeme = '// Interactive Lexical Analyzer Demo';

  test('all four control sequences agree on terminal and intermediate models', () => {
    const steps = simulateAutomaton(dfa, lexeme); // the one transition engine
    const len = lexeme.length;
    const next = (i: number) => Math.min(len, i + 1); // "▶" button / play tick
    const prev = (i: number) => Math.max(0, i - 1); // "◀" button

    // Forward: click next until the end
    let fwd = 0;
    while (fwd < len) fwd = next(fwd);

    // Play: identical increments, same trace
    let played = 0;
    for (let t = 0; t < len; t++) played = next(played);

    // Backward from the end all the way to 0, then forward again
    let back = len;
    while (back > 0) back = prev(back);
    const resetModel = deriveDfaPanelModel(steps, 0);
    let forwardAgain = back;
    while (forwardAgain < len) forwardAgain = next(forwardAgain);

    expect(fwd).toBe(len);
    expect(played).toBe(len);
    expect(back).toBe(0);

    const fwdModel = deriveDfaPanelModel(steps, fwd);
    const playModel = deriveDfaPanelModel(steps, played);
    const againModel = deriveDfaPanelModel(steps, forwardAgain);

    // Play parity and forward/backward/forward parity — same terminal state objects
    expect(fwdModel.current).toBe(playModel.current);
    expect(fwdModel.current).toBe(againModel.current);
    expect(fwdModel.accepted).toBe(true);
    expect(playModel.accepted).toBe(true);

    // Reset returns to the exact initial state of the same trace
    expect(resetModel.idx).toBe(0);
    expect(resetModel.current).toBe(steps[0]);
    expect(resetModel.activeStates).toBe(steps[0].activeStates);
    expect(resetModel.activeTransition?.from).toBe(dfa.startState);

    // Reversing from a higher index down to a mid position reproduces the
    // forward model at that same position (pure index move, no re-simulation)
    const midForward = deriveDfaPanelModel(steps, 10);
    let backToMid = 20;
    while (backToMid > 10) backToMid = prev(backToMid);
    const viaBackward = deriveDfaPanelModel(steps, backToMid);
    expect(backToMid).toBe(10);
    expect(viaBackward.current).toBe(midForward.current);
    expect(setOf(viaBackward.activeStates)).toEqual(setOf(midForward.activeStates));
  });
});

describe('Lexer token result and DFA recognition agree for the same lexeme', () => {
  const accept = (dfa: Automaton, input: string) => finalStep(simulateAutomaton(dfa, input)).isAccepted;

  test('"// hello" comment, "/" operator and "abc" identifier each agree with their own rule DFA', () => {
    const lexer = new SteppedLexer(RICH_JAVASCRIPT_RULES);
    const result = lexer.analyze('// hello\n/ abc');

    expect(result.tokens.map(t => t.type)).toEqual([
      'LINE_COMMENT', 'WHITESPACE', 'ARITHMETIC_OPERATOR', 'WHITESPACE', 'IDENTIFIER',
    ]);

    for (const tok of result.tokens) {
      // Agreement for the same lexeme: the lexer emitted tok because its rule
      // matched — the rule's DFA must accept that exact lexeme.
      expect(tok.automaton).toBeDefined();
      expect({
        rule: tok.type,
        lexeme: tok.lexeme,
        dfaAccepts: accept(tok.automaton!, tok.lexeme),
      }).toEqual({ rule: tok.type, lexeme: tok.lexeme, dfaAccepts: true });
    }

    const comment = result.tokens[0];
    const operator = result.tokens[2];
    const identifier = result.tokens[4];
    expect(comment.lexeme).toBe('// hello');
    expect(operator.lexeme).toBe('/');
    expect(identifier.lexeme).toBe('abc');

    // The LINE_COMMENT recognizer classifies exactly the comment lexeme —
    // it rejects the two lexemes the lexer attributed to other rules.
    expect(accept(comment.automaton!, comment.lexeme)).toBe(true);
    expect(accept(comment.automaton!, operator.lexeme)).toBe(false);
    expect(accept(comment.automaton!, identifier.lexeme)).toBe(false);
  });
});
