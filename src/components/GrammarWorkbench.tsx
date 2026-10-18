// src/components/GrammarWorkbench.tsx
import React, { useState } from 'react';
import { RegularGrammar } from '../types';
import { grammarToAutomaton, generateGrammarDerivations } from '../engine/grammarEngine';
import { AutomatonGraph } from './AutomatonGraph';

export const GrammarWorkbench: React.FC = () => {
  const [grammar, setGrammar] = useState<RegularGrammar>({
    id: 'g_default',
    name: 'Even Zeros Language Grammar',
    nonTerminals: ['S', 'A'],
    terminals: ['0', '1'],
    startSymbol: 'S',
    productions: [
      { id: 'p1', lhs: 'S', rhs: ['1', 'S'] },
      { id: 'p2', lhs: 'S', rhs: ['0', 'A'] },
      { id: 'p3', lhs: 'S', rhs: ['ε'] },
      { id: 'p4', lhs: 'A', rhs: ['1', 'A'] },
      { id: 'p5', lhs: 'A', rhs: ['0', 'S'] },
    ],
  });

  const [newLhs, setNewLhs] = useState('S');
  const [newRhs, setNewRhs] = useState('');
  const [selectedDerivation, setSelectedDerivation] = useState<number | null>(null);

  const automaton = grammarToAutomaton(grammar);
  const derivations = generateGrammarDerivations(grammar, 8);

  const handleAddProduction = () => {
    if (!newRhs.trim()) return;
    const tokens = newRhs.trim().split(/\s+/);
    const newProd = {
      id: `p_${Date.now()}`,
      lhs: newLhs,
      rhs: tokens,
    };
    setGrammar({
      ...grammar,
      productions: [...grammar.productions, newProd],
    });
    setNewRhs('');
  };

  const handleDeleteProduction = (id: string) => {
    setGrammar({
      ...grammar,
      productions: grammar.productions.filter(p => p.id !== id),
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Grammar Editor & String Derivations */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflowY: 'auto', padding: '14px', gap: 14 }}>
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
            RIGHT-LINEAR REGULAR GRAMMAR
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 12 }}>
            Productions must follow right-linear form: <code>A ➔ a B</code>, <code>A ➔ a</code>, or <code>A ➔ ε</code>.
          </div>

          {/* Add production input */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="text"
              value={newLhs}
              onChange={e => setNewLhs(e.target.value.toUpperCase())}
              placeholder="LHS (e.g. S)"
              style={{ width: 60, background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
            />
            <span style={{ color: 'var(--text-dim)' }}>➔</span>
            <input
              type="text"
              value={newRhs}
              onChange={e => setNewRhs(e.target.value)}
              placeholder="RHS e.g. 0 A or ε"
              style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--sapphire)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
            />
            <button className="btn btn-primary" onClick={handleAddProduction}>
              + Add
            </button>
          </div>

          {/* Production list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grammar.productions.map(prod => (
              <div
                key={prod.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>
                  <strong style={{ color: 'var(--amethyst)' }}>{prod.lhs}</strong> ➔ {prod.rhs.join(' ')}
                </span>
                <button
                  className="btn-icon"
                  onClick={() => handleDeleteProduction(prod.id)}
                  style={{ padding: '1px 5px', fontSize: '0.65rem', color: 'var(--ruby)' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* String Derivations Panel */}
        <div className="glass-panel" style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
            GENERATED STRINGS & DERIVATION TREES
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {derivations.map((d, i) => (
              <button
                key={i}
                className="btn btn-secondary"
                onClick={() => setSelectedDerivation(i)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-mono)',
                  borderColor: selectedDerivation === i ? 'var(--sapphire)' : undefined,
                  background: selectedDerivation === i ? 'rgba(59, 130, 246, 0.2)' : undefined,
                }}
              >
                "{d.string}"
              </button>
            ))}
          </div>

          {selectedDerivation !== null && derivations[selectedDerivation] && (
            <div style={{ flex: 1, background: 'var(--bg-secondary)', padding: '10px', borderRadius: 6, border: '1px solid var(--border-color)', overflowY: 'auto' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--sapphire)', marginBottom: 6 }}>
                Derivation for "{derivations[selectedDerivation].string}":
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {derivations[selectedDerivation].steps.map(step => (
                  <div key={step.step} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Step {step.step}: </span>
                    <span style={{ color: 'var(--topaz)' }}>{step.sententialForm.join(' ')}</span>
                    <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>({step.explanation})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Equivalent Automaton View */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          EQUIVALENT FINITE AUTOMATON (NFA)
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <AutomatonGraph automaton={automaton} interactive={true} />
        </div>
      </div>
    </div>
  );
};
