// src/components/LanguageOperationsView.tsx
import React, { useState } from 'react';
import { Automaton } from '../types';
import { AutomatonGraph } from './AutomatonGraph';
import { compileRegexToDfa } from '../engine/regexToAutomaton';
import {
  productAutomaton,
  complementAutomaton,
  concatenateAutomata,
  kleeneStarAutomaton,
} from '../engine/languageOperations';
import { simulateAutomaton } from '../engine/automaton';

export const LanguageOperationsView: React.FC = () => {
  const [regex1, setRegex1] = useState('a(a|b)*');
  const [regex2, setRegex2] = useState('(a|b)*a');
  const [operation, setOperation] = useState<
    'INTERSECTION' | 'UNION' | 'DIFFERENCE' | 'COMPLEMENT' | 'CONCAT' | 'STAR'
  >('INTERSECTION');

  const [testStr, setTestStr] = useState('aba');

  // Compile individual DFAs
  let m1: Automaton | null = null;
  let m2: Automaton | null = null;
  let resultAutomaton: Automaton | null = null;
  let errorMsg = '';

  try {
    m1 = compileRegexToDfa('L1', regex1);
    m2 = compileRegexToDfa('L2', regex2);

    switch (operation) {
      case 'INTERSECTION':
        resultAutomaton = productAutomaton(m1, m2, 'INTERSECTION');
        break;
      case 'UNION':
        resultAutomaton = productAutomaton(m1, m2, 'UNION');
        break;
      case 'DIFFERENCE':
        resultAutomaton = productAutomaton(m1, m2, 'DIFFERENCE');
        break;
      case 'COMPLEMENT':
        resultAutomaton = complementAutomaton(m1);
        break;
      case 'CONCAT':
        resultAutomaton = concatenateAutomata(m1, m2);
        break;
      case 'STAR':
        resultAutomaton = kleeneStarAutomaton(m1);
        break;
    }
  } catch (err: any) {
    errorMsg = err.message || 'Operation failed';
  }

  // Simulation test on result automaton
  let isAccepted = false;
  let traceExplanation = '';
  if (resultAutomaton) {
    const steps = simulateAutomaton(resultAutomaton, testStr);
    const last = steps[steps.length - 1];
    isAccepted = last ? Boolean(last.isAccepted) : false;
    traceExplanation = last ? last.explanation || '' : '';
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Resulting Automaton Display */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>CLOSURE PROPERTIES & LANGUAGE OPERATIONS</span>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Constructive proof that regular languages are closed under Boolean & Kleene operations
            </div>
          </div>
          {resultAutomaton && (
            <span className="badge" style={{ background: 'var(--sapphire)', color: '#fff' }}>
              {resultAutomaton.states.length} states
            </span>
          )}
        </div>

        {errorMsg ? (
          <div style={{ padding: '20px', color: 'var(--ruby)' }}>{errorMsg}</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <AutomatonGraph automaton={resultAutomaton} interactive={true} />
          </div>
        )}

        {/* Live String Tester */}
        <div style={{ padding: '10px 14px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Test Result String:</span>
          <input
            type="text"
            value={testStr}
            onChange={e => setTestStr(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              width: 160,
              outline: 'none',
            }}
          />
          <span
            className="badge"
            style={{
              background: isAccepted ? 'var(--emerald)' : 'var(--ruby)',
              color: '#fff',
            }}
          >
            {isAccepted ? '✓ ACCEPTED' : '✕ REJECTED'}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            {traceExplanation}
          </span>
        </div>
      </div>

      {/* Right: Operation Setup & Explanations */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '14px', gap: 14 }}>
        {/* Language 1 Definition */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            LANGUAGE 1 (L1) REGEX
          </div>
          <input
            type="text"
            value={regex1}
            onChange={e => setRegex1(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--sapphire)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
          />
        </div>

        {/* Language 2 Definition (if binary operation) */}
        {operation !== 'COMPLEMENT' && operation !== 'STAR' && (
          <div className="glass-panel" style={{ padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              LANGUAGE 2 (L2) REGEX
            </div>
            <input
              type="text"
              value={regex2}
              onChange={e => setRegex2(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--sapphire)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
          </div>
        )}

        {/* Operations Selector Grid */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            SELECT CLOSURE OPERATION
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              className={`btn ${operation === 'INTERSECTION' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperation('INTERSECTION')}
            >
              L1 ∩ L2 (Intersection)
            </button>
            <button
              className={`btn ${operation === 'UNION' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperation('UNION')}
            >
              L1 ∪ L2 (Union)
            </button>
            <button
              className={`btn ${operation === 'DIFFERENCE' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperation('DIFFERENCE')}
            >
              L1 \ L2 (Difference)
            </button>
            <button
              className={`btn ${operation === 'COMPLEMENT' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperation('COMPLEMENT')}
            >
              ¬L1 (Complement)
            </button>
            <button
              className={`btn ${operation === 'CONCAT' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperation('CONCAT')}
            >
              L1 · L2 (Concatenation)
            </button>
            <button
              className={`btn ${operation === 'STAR' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperation('STAR')}
            >
              L1* (Kleene Star)
            </button>
          </div>
        </div>

        {/* Theoretical explanation card */}
        <div className="glass-panel" style={{ padding: '14px', fontSize: '0.8rem', lineHeight: '1.5' }}>
          <div style={{ fontWeight: 600, color: 'var(--sapphire)', marginBottom: 6 }}>
            ℹ Formal Automata Construction Principle
          </div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            {operation === 'INTERSECTION' &&
              'Product Automaton: For every state pair (u, v) ∈ Q1 × Q2, transition on symbol a to (δ1(u, a), δ2(v, a)). Accepting state condition: u ∈ F1 AND v ∈ F2.'}
            {operation === 'UNION' &&
              'Product Automaton: For state pair (u, v) ∈ Q1 × Q2, accepting condition is u ∈ F1 OR v ∈ F2.'}
            {operation === 'DIFFERENCE' &&
              'Difference L1 \\ L2 = L1 ∩ ¬L2. Accepting condition: u ∈ F1 AND v ∉ F2.'}
            {operation === 'COMPLEMENT' &&
              'DFA Inversion: Complete the DFA by adding an explicit sink state, then invert accepting states F\' = Q \\ F.'}
            {operation === 'CONCAT' &&
              'NFA Bridge: Connect every accepting state of M1 to the initial state of M2 via ε-transitions.'}
            {operation === 'STAR' &&
              'Kleene Star: Introduce new start and accept states with ε-loops to M1\'s start and from M1\'s accept states.'}
          </p>
        </div>
      </div>
    </div>
  );
};
