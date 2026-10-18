// src/components/ArdenSolverView.tsx
import React, { useState } from 'react';
import { Automaton } from '../types';
import { ArdenSolver } from '../engine/ardenSolver';
import { AutomatonGraph } from './AutomatonGraph';
import { compileRegexToDfa } from '../engine/regexToAutomaton';

export const ArdenSolverView: React.FC = () => {
  const PRESET_AUTOMATA: Array<{ name: string; regex: string }> = [
    { name: 'Ending in ab', regex: '(a|b)*ab' },
    { name: 'Single Loop a*b', regex: 'a*b' },
    { name: 'Even Zeros (1|01*0)*', regex: '(1|01*0)*' },
    { name: 'Alternating (ab)*', regex: '(ab)*' },
  ];

  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);

  const currentDfa: Automaton = compileRegexToDfa(
    PRESET_AUTOMATA[selectedPresetIdx].name,
    PRESET_AUTOMATA[selectedPresetIdx].regex
  );

  const { steps, finalRegex } = ArdenSolver.solve(currentDfa);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  const activeStep = steps[currentStepIdx] || steps[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Automaton & Preset Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>ARDEN'S THEOREM SOLVER</span>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Symbolic derivation of Regular Expressions from Automata State Equations
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Preset:</span>
            <select
              value={selectedPresetIdx}
              onChange={e => {
                setSelectedPresetIdx(Number(e.target.value));
                setCurrentStepIdx(0);
              }}
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', fontSize: '0.8rem' }}
            >
              {PRESET_AUTOMATA.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Automaton Visualizer */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <AutomatonGraph automaton={currentDfa} interactive={true} />
        </div>

        {/* Arden's Lemma Explanation Card */}
        <div style={{ padding: '12px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--sapphire)', marginBottom: 4 }}>
            ∠ Arden's Theorem (Lemma):
          </div>
          <div style={{ color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Let $P$ and $Q$ be two regular expressions. If $\epsilon \notin L(P)$, then the equation:
            <br />
            <strong style={{ color: 'var(--topaz)', fontFamily: 'var(--font-mono)' }}>R = Q + R·P</strong> has a unique solution: <strong style={{ color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>R = Q·P*</strong>
            <br />
            Similarly, <strong style={{ color: 'var(--topaz)', fontFamily: 'var(--font-mono)' }}>R = P·R + Q</strong> resolves uniquely to <strong style={{ color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>R = P*·Q</strong>.
          </div>
        </div>
      </div>

      {/* Right: Step-by-Step Derivation Trace */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '14px', gap: 14 }}>
        {/* Stepper Navigation */}
        <div className="glass-panel" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn-icon"
              onClick={() => setCurrentStepIdx(Math.max(0, currentStepIdx - 1))}
              disabled={currentStepIdx === 0}
            >
              |◀
            </button>
            <button
              className="btn-icon"
              onClick={() => setCurrentStepIdx(Math.min(steps.length - 1, currentStepIdx + 1))}
              disabled={currentStepIdx === steps.length - 1}
            >
              ▶|
            </button>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sapphire)' }}>
              Step {currentStepIdx + 1} of {steps.length}: {activeStep.title}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStepIdx(i)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: 'none',
                  background: currentStepIdx === i ? 'var(--sapphire)' : 'var(--bg-secondary)',
                  color: currentStepIdx === i ? '#fff' : 'var(--text-dim)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Current Step Description */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            MATHEMATICAL EXPLANATION
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
            {activeStep.description}
          </div>
        </div>

        {/* Equation System at this step */}
        <div className="glass-panel" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            CURRENT STATE EQUATION SYSTEM
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(activeStep.equations).map(([state, expr]) => (
              <div
                key={state}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ color: 'var(--sapphire)', fontWeight: 700 }}>{state}</span>
                <span style={{ color: 'var(--text-dim)' }}>=</span>
                <span style={{ color: 'var(--topaz)', wordBreak: 'break-all' }}>{expr}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Final Derived Expression Card */}
        <div className="glass-panel" style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--emerald)', marginBottom: 6 }}>
            ✓ FINAL REGULAR EXPRESSION DERIVED
          </div>
          <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-main)' }}>
            L(M) = {finalRegex}
          </div>
        </div>
      </div>
    </div>
  );
};
