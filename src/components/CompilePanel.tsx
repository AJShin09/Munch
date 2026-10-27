// src/components/CompilePanel.tsx
//
// The construction side of the workbench: for one token rule, show the objects
// the rule goes through — syntax tree, Thompson ε-NFA, powerset DFA, minimized
// DFA, and the right-linear grammar of the same language — plus the reverse
// step (Arden's theorem) that turns the machine back into an expression.

import React, { useMemo, useState } from 'react';
import { Automaton, TokenRule } from '../types';
import { AutomatonGraph } from './AutomatonGraph';
import { RegexParser, compileRegexToNfa } from '../engine/regexToAutomaton';
import { convertNfaToDfa, minimizeDfa } from '../engine/automaton';
import { ArdenSolver } from '../engine/ardenSolver';
import { automatonToGrammar } from '../engine/grammarEngine';

type Stage = 'ast' | 'nfa' | 'dfa' | 'min' | 'grammar';

interface Props {
  rule?: TokenRule;
  /** Lexeme of the selected token, derived from the grammar when supplied. */
  lexeme?: string;
}

type Built =
  | { ok: true; ast: unknown; nfa: Automaton; dfa: Automaton; min: Automaton }
  | { ok: false; error: string };

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'ast', label: '1. Syntax tree' },
  { id: 'nfa', label: '2. ε-NFA' },
  { id: 'dfa', label: '3. DFA' },
  { id: 'min', label: '4. Minimal DFA' },
  { id: 'grammar', label: '5. Grammar' },
];

/** How many production lines are listed before the view switches to a count. */
const PRODUCTION_LIMIT = 40;

/**
 * Present the literal right-linear productions compactly.
 *
 * A state usually has one production per alphabet symbol. Printing 118 lines
 * says nothing that a single bracketed class does not, so transitions that
 * share a source and a target are folded into one line such as
 * `s1 → [A-Za-z0-9_] s0`. The class is shorthand: it stands for one
 * production per symbol, and only plain ASCII letters, digits and underscore
 * are folded, so nothing has to be escaped. Everything else stays literal.
 */
export function productionLines(
  productions: Array<{ id: string; lhs: string; rhs: string[] }>
): string[] {
  const lines: string[] = [];
  const grouped = new Map<string, { lhs: string; target: string; symbols: string[] }>();
  for (const p of productions) {
    const [sym, target] = p.rhs;
    if (p.rhs.length === 2 && /^[A-Za-z0-9_]$/.test(sym)) {
      const key = `${p.lhs}\u0000${target}`;
      const entry = grouped.get(key);
      if (entry) entry.symbols.push(sym);
      else grouped.set(key, { lhs: p.lhs, target, symbols: [sym] });
    } else {
      lines.push(`${p.lhs} → ${p.rhs.join('')}`);
    }
  }
  for (const { lhs, target, symbols } of grouped.values()) {
    if (symbols.length === 1) {
      lines.push(`${lhs} → ${symbols[0]}${target}`);
      continue;
    }
    const sorted = [...symbols].sort();
    const runs: string[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].charCodeAt(0) === sorted[j].charCodeAt(0) + 1) j++;
      runs.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(''));
      i = j + 1;
    }
    lines.push(`${lhs} → [${runs.join('')}]${target}`);
  }
  return lines;
}

export const CompilePanel: React.FC<Props> = ({ rule, lexeme }) => {
  const [stage, setStage] = useState<Stage>('min');
  const [arden, setArden] = useState<
    { ok: true; finalRegex: string; steps: ReturnType<typeof ArdenSolver.solve>['steps'] }
    | { ok: false; error: string }
    | null
  >(null);

  const built = useMemo<Built>(() => {
    if (!rule) {
      return { ok: false, error: 'Select a token in the stream to see how its rule is built.' };
    }
    try {
      const ast = new RegexParser(rule.regex).parse();
      const nfa = compileRegexToNfa(rule.name, rule.regex, { ignoreCase: rule.caseInsensitive });
      const dfa = convertNfaToDfa(nfa);
      const min = minimizeDfa(dfa);
      return { ok: true, ast, nfa, dfa, min };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [rule]);

  const grammar = useMemo(
    () => (built.ok ? automatonToGrammar(built.min) : null),
    [built]
  );

  const productions = useMemo(
    () => (grammar ? productionLines(grammar.productions) : []),
    [grammar]
  );

  // A derivation of the selected lexeme, read straight off the minimized DFA:
  // one grammar production per character, ending in the production that removes
  // the last non-terminal. This is the same path the scanner's model takes.
  const derivation = useMemo(() => {
    if (!built.ok || !grammar || !lexeme) return null;
    const forms: string[] = [grammar.startSymbol];
    let state = built.min.startState;
    const consumed: string[] = [];
    for (const ch of Array.from(lexeme)) {
      const transition = built.min.transitions.find(
        t => t.from === state && t.symbol === ch
      );
      if (!transition) {
        return { forms, ok: false, note: `no transition on '${ch}' from ${state}` };
      }
      consumed.push(ch);
      state = transition.to;
      forms.push(consumed.join('') + state);
    }
    const accepted = built.min.acceptingStates.includes(state);
    if (accepted) forms.push(consumed.join('') + 'ε');
    return { forms, ok: accepted, note: accepted ? null : `state ${state} is not accepting` };
  }, [built, grammar, lexeme]);

  const showArden = () => {
    if (!built.ok) return;
    try {
      const solved = ArdenSolver.solve(built.min);
      setArden({ ok: true, finalRegex: solved.finalRegex, steps: solved.steps });
    } catch (err) {
      setArden({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  if (!built.ok) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
        {built.error}
      </div>
    );
  }

  const automaton = stage === 'nfa' ? built.nfa : stage === 'dfa' ? built.dfa : stage === 'min' ? built.min : null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0 }}>
        {STAGES.map(s => (
          <button
            key={s.id}
            className={`tab-button${stage === s.id ? ' active' : ''}`}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setStage(s.id)}
          >
            {s.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {rule?.name}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {stage === 'ast' && (
          <pre style={{
            margin: 0, padding: 12, height: '100%', overflow: 'auto',
            fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.45,
            color: 'var(--text-muted)', background: 'var(--bg-primary)',
          }}>
            {JSON.stringify(built.ast, null, 2)}
          </pre>
        )}

        {stage === 'grammar' && grammar && (
          <div style={{ height: '100%', overflow: 'auto', padding: '10px 12px', background: 'var(--bg-primary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 5 }}>
              RIGHT-LINEAR PRODUCTIONS
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {productions.slice(0, PRODUCTION_LIMIT).map((line, i) => (
                <div key={i} style={{ whiteSpace: 'pre' }}>{line}</div>
              ))}
              {productions.length > PRODUCTION_LIMIT && (
                <div style={{ color: 'var(--text-dim)', marginTop: 3 }}>
                  … {productions.length - PRODUCTION_LIMIT} more lines
                </div>
              )}
              <div style={{ color: 'var(--text-dim)', marginTop: 5, fontSize: 10.5 }}>
                A bracketed class is shorthand for one production per symbol.
              </div>
            </div>

            <div style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', margin: '12px 0 5px' }}>
              DERIVATION {lexeme ? `OF "${lexeme}"` : ''}
            </div>
            {derivation ? (
              <div style={{ color: derivation.ok ? 'var(--emerald)' : 'var(--ruby)', wordBreak: 'break-all' }}>
                {derivation.forms.join('  ⇒  ')}
                {derivation.note && (
                  <div style={{ color: 'var(--ruby)', marginTop: 4 }}>{derivation.note}</div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>
                Select a token in the stream to derive its lexeme from this grammar.
              </div>
            )}

            <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 10.5 }}>
              {grammar.nonTerminals.length} non-terminals · {grammar.productions.length} productions · terminals are the machine's universe
            </div>
          </div>
        )}

        {(stage === 'nfa' || stage === 'dfa' || stage === 'min') && (
          <AutomatonGraph automaton={automaton} interactive />
        )}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {stage === 'nfa' && `${built.nfa.states.length} states · ${built.nfa.transitions.length} transitions`}
          {stage === 'dfa' && `${built.dfa.states.length} states · ${built.dfa.transitions.length} transitions`}
          {stage === 'min' && `${built.min.states.length} states · ${built.min.transitions.length} transitions`}
          {stage === 'ast' && 'parsed from the rule pattern'}
          {stage === 'grammar' && `${grammar?.productions.length ?? 0} productions · ${productions.length} display lines`}
        </span>
        <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: 11 }} onClick={showArden}>
          Arden: print equivalent expression
        </button>
        {(stage === 'nfa' || stage === 'dfa' || stage === 'min') && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            start {automaton?.startState} · accept {automaton?.acceptingStates.join(', ') || '∅'}
          </span>
        )}
        {stage === 'grammar' && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            start symbol {grammar?.startSymbol} · ε-production from the accepting states
          </span>
        )}
      </div>

      {arden && (
        <div style={{ maxHeight: '45%', overflow: 'auto', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '8px 12px', flexShrink: 0 }}>
          {arden.ok ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                State elimination — the steps below solve the machine's state equations, then Arden's rule R = Q + RP ⇒ R = QP* removes the last loop.
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--emerald)', wordBreak: 'break-all', marginBottom: 6 }}>
                {arden.finalRegex}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {arden.steps.map(step => (
                  <li key={step.stepNumber}>
                    <strong style={{ color: 'var(--text-main)' }}>{step.title}</strong> — {step.description}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--ruby)' }}>{arden.error}</span>
          )}
        </div>
      )}
    </div>
  );
};
