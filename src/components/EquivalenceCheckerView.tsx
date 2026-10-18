// src/components/EquivalenceCheckerView.tsx
import React, { useState } from 'react';
import { checkRegexEquivalence, EquivalenceResult } from '../engine/equivalenceChecker';
import { AutomatonGraph } from './AutomatonGraph';

export const EquivalenceCheckerView: React.FC = () => {
  const [regex1, setRegex1] = useState('(a|b)*');
  const [regex2, setRegex2] = useState('(b|a)*');

  const EQUIVALENCE_PRESETS = [
    { label: 'Identical: (a|b)* vs (b|a)*', r1: '(a|b)*', r2: '(b|a)*' },
    { label: 'Shift: a(ba)* vs (ab)*a', r1: 'a(ba)*', r2: '(ab)*a' },
    { label: 'Different: a*b vs b*a', r1: 'a*b', r2: 'b*a' },
    { label: 'Different: (a|b)+ vs (a|b)*', r1: '(a|b)+', r2: '(a|b)*' },
    { label: 'De Morgan Dual: (a|b)*abb vs (a|b)*', r1: '(a|b)*abb', r2: '(a|b)*' },
  ];

  let result: EquivalenceResult | null = null;
  let errorMsg = '';

  try {
    result = checkRegexEquivalence(regex1, regex2);
  } catch (err: any) {
    errorMsg = err.message || 'Equivalence check failed';
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Input Specifications & Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflowY: 'auto', padding: '16px', gap: 14 }}>
        <div style={{ background: 'var(--panel-header)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>AUTOMATA & REGEX EQUIVALENCE CHECKER</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Determines whether two language definitions accept precisely the same set of strings
            </div>
          </div>
        </div>

        {/* Presets */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
            LOAD PRESET PAIR
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EQUIVALENCE_PRESETS.map((p, i) => (
              <button
                key={i}
                className="btn btn-secondary"
                onClick={() => {
                  setRegex1(p.r1);
                  setRegex2(p.r2);
                }}
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Regex 1 Input */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--sapphire)', marginBottom: 6 }}>
            REGULAR EXPRESSION 1 (R1)
          </div>
          <input
            type="text"
            value={regex1}
            onChange={e => setRegex1(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
          />
        </div>

        {/* Regex 2 Input */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--amethyst)', marginBottom: 6 }}>
            REGULAR EXPRESSION 2 (R2)
          </div>
          <input
            type="text"
            value={regex2}
            onChange={e => setRegex2(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
          />
        </div>

        {/* Equivalence Verdict Banner */}
        {errorMsg ? (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--ruby)', borderRadius: 6 }}>
            {errorMsg}
          </div>
        ) : result ? (
          <div
            style={{
              padding: '16px',
              borderRadius: 8,
              background: result.areEquivalent ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${result.areEquivalent ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: '1.2rem',
                  color: result.areEquivalent ? 'var(--emerald)' : 'var(--ruby)',
                }}
              >
                {result.areEquivalent ? '✓' : '✕'}
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: result.areEquivalent ? 'var(--emerald)' : 'var(--ruby)' }}>
                {result.areEquivalent ? 'LANGUAGES ARE EQUIVALENT' : 'LANGUAGES ARE NOT EQUIVALENT'}
              </span>
            </div>

            {result.areEquivalent ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Both expressions generate the exact same regular language $L(R_1) = L(R_2)$. The symmetric difference automaton has no reachable accepting states.
              </div>
            ) : (
              result.counterexample && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                    <strong>Shortest Counterexample String:</strong>{' '}
                    <code style={{ background: '#121212', padding: '2px 6px', borderRadius: 4, color: 'var(--topaz)' }}>
                      "{result.counterexample.string || 'ε'}"
                    </code>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ruby)', lineHeight: '1.4' }}>
                    {result.counterexample.explanation}
                  </div>
                </div>
              )
            )}
          </div>
        ) : null}
      </div>

      {/* Right: Symmetric Difference Product Automaton */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            SYMMETRIC DIFFERENCE AUTOMATON (L1 ⊕ L2)
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            L(Diff) = ∅ ⟺ Equivalent
          </span>
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <AutomatonGraph automaton={result?.symmetricDifferenceDfa} interactive={true} />
        </div>
      </div>
    </div>
  );
};
