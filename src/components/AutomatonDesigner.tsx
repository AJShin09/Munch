// src/components/AutomatonDesigner.tsx
import React, { useState } from 'react';
import { Automaton, AutomatonTransition, SimulationStep } from '../types';
import { AutomatonGraph } from './AutomatonGraph';
import {
  convertNfaToDfa,
  minimizeDfa,
  simulateAutomaton,
  EPSILON,
  computeDefaultLayout,
} from '../engine/automaton';

export const AutomatonDesigner: React.FC = () => {
  const [automaton, setAutomaton] = useState<Automaton>({
    id: 'designer_aut',
    name: 'Custom Automaton',
    type: 'NFA',
    states: ['q0', 'q1', 'q2'],
    alphabet: ['a', 'b'],
    transitions: [
      { from: 'q0', symbol: 'a', to: 'q0' },
      { from: 'q0', symbol: 'a', to: 'q1' },
      { from: 'q1', symbol: 'b', to: 'q2' },
    ],
    startState: 'q0',
    acceptingStates: ['q2'],
    layout: computeDefaultLayout(['q0', 'q1', 'q2'], 'q0'),
  });

  const [newStateName, setNewStateName] = useState('');
  const [transFrom, setTransFrom] = useState('q0');
  const [transSym, setTransSym] = useState('a');
  const [transTo, setTransTo] = useState('q0');

  // Interactive String Simulator
  const [simString, setSimString] = useState('aab');
  const [simSteps, setSimSteps] = useState<SimulationStep[]>([]);
  const [simIndex, setSimIndex] = useState(0);

  const runSimulation = () => {
    const steps = simulateAutomaton(automaton, simString);
    setSimSteps(steps);
    setSimIndex(0);
  };

  const handleAddState = () => {
    const name = newStateName.trim() || `q${automaton.states.length}`;
    if (automaton.states.includes(name)) {
      alert(`State "${name}" already exists.`);
      return;
    }
    const newStates = [...automaton.states, name];
    setAutomaton({
      ...automaton,
      states: newStates,
      layout: computeDefaultLayout(newStates, automaton.startState),
    });
    setNewStateName('');
  };

  const handleDeleteState = (s: string) => {
    if (automaton.states.length <= 1) {
      alert('An automaton must possess at least one state.');
      return;
    }
    const newStates = automaton.states.filter(x => x !== s);
    const newAcc = automaton.acceptingStates.filter(x => x !== s);
    const newTrans = automaton.transitions.filter(t => t.from !== s && t.to !== s);
    const newStart = automaton.startState === s ? newStates[0] : automaton.startState;

    setAutomaton({
      ...automaton,
      states: newStates,
      acceptingStates: newAcc,
      transitions: newTrans,
      startState: newStart,
      layout: computeDefaultLayout(newStates, newStart),
    });
  };

  const handleToggleAccepting = (s: string) => {
    const isAcc = automaton.acceptingStates.includes(s);
    const newAcc = isAcc
      ? automaton.acceptingStates.filter(x => x !== s)
      : [...automaton.acceptingStates, s];
    setAutomaton({ ...automaton, acceptingStates: newAcc });
  };

  const handleSetStart = (s: string) => {
    setAutomaton({ ...automaton, startState: s });
  };

  const handleAddTransition = () => {
    const symbol = transSym.trim() || EPSILON;
    const newTrans: AutomatonTransition = {
      from: transFrom,
      symbol,
      to: transTo,
    };
    const exists = automaton.transitions.some(
      t => t.from === transFrom && t.symbol === symbol && t.to === transTo
    );
    if (!exists) {
      const alphabet =
        symbol !== EPSILON && !automaton.alphabet.includes(symbol)
          ? [...automaton.alphabet, symbol]
          : automaton.alphabet;

      setAutomaton({
        ...automaton,
        transitions: [...automaton.transitions, newTrans],
        alphabet,
      });
    }
  };

  const handleDeleteTransition = (index: number) => {
    const newTrans = automaton.transitions.filter((_, i) => i !== index);
    setAutomaton({ ...automaton, transitions: newTrans });
  };

  const handleConvertToDfa = () => {
    try {
      const dfa = convertNfaToDfa(automaton);
      setAutomaton(dfa);
      setSimSteps([]);
    } catch (e: any) {
      alert('Failed to convert: ' + e.message);
    }
  };

  const handleMinimize = () => {
    try {
      const min = minimizeDfa(automaton.type === 'DFA' ? automaton : convertNfaToDfa(automaton));
      setAutomaton(min);
      setSimSteps([]);
    } catch (e: any) {
      alert('Failed to minimize: ' + e.message);
    }
  };

  const currentStep = simSteps[simIndex];
  const activeStates = currentStep ? currentStep.activeStates : new Set([automaton.startState]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Interactive Automaton Graph & Test Simulation */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{automaton.name}</span>
            <span className="badge" style={{ background: 'var(--sapphire)', color: '#fff' }}>
              {automaton.type}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary" onClick={handleConvertToDfa} title="Convert NFA to equivalent DFA via powerset construction">
              Convert to DFA
            </button>
            <button className="btn btn-primary" onClick={handleMinimize} title="Minimize DFA states via partition refinement">
              Minimize DFA
            </button>
          </div>
        </div>

        {/* Graph Visualizer */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <AutomatonGraph automaton={automaton} activeStates={activeStates} interactive={true} />
        </div>

        {/* Interactive String Simulator Bar */}
        <div style={{ padding: '10px 14px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            STRING SIMULATION TRACE
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={simString}
              onChange={e => setSimString(e.target.value)}
              placeholder="e.g. aab"
              style={{
                flex: 1,
                background: 'var(--bg-secondary)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button className="btn btn-primary" onClick={runSimulation}>
              Simulate
            </button>
          </div>

          {simSteps.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn-icon"
                  onClick={() => setSimIndex(Math.max(0, simIndex - 1))}
                  disabled={simIndex === 0}
                >
                  |◀
                </button>
                <button
                  className="btn-icon"
                  onClick={() => setSimIndex(Math.min(simSteps.length - 1, simIndex + 1))}
                  disabled={simIndex === simSteps.length - 1}
                >
                  ▶|
                </button>
                <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                  Step {simIndex + 1}/{simSteps.length}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--sapphire)' }}>
                  {currentStep?.explanation}
                </span>
              </div>
              <div>
                {currentStep?.isAccepted ? (
                  <span className="badge" style={{ background: 'var(--emerald)', color: '#fff' }}>
                    ✓ ACCEPTING
                  </span>
                ) : (
                  <span className="badge" style={{ background: '#4d4d4d', color: '#fff' }}>
                    NON-ACCEPTING
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: States and Transitions Editor */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '14px', gap: 16 }}>
        {/* States Section */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            STATES ({automaton.states.length})
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="State name (e.g. q3)"
              value={newStateName}
              onChange={e => setNewStateName(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--bg-secondary)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button className="btn btn-secondary" onClick={handleAddState}>
              + Add State
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {automaton.states.map(s => {
              const isStart = s === automaton.startState;
              const isAcc = automaton.acceptingStates.includes(s);

              return (
                <div
                  key={s}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: `1px solid ${isStart ? 'var(--emerald)' : isAcc ? 'var(--sapphire)' : 'var(--border-color)'}`,
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {s}
                  </span>
                  <button
                    className="btn-icon"
                    onClick={() => handleSetStart(s)}
                    title={isStart ? 'Current start state' : 'Make start state'}
                    style={{
                      padding: '1px 4px',
                      fontSize: '0.65rem',
                      background: isStart ? 'var(--emerald)' : undefined,
                      color: isStart ? '#fff' : undefined,
                    }}
                  >
                    Start
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleToggleAccepting(s)}
                    title={isAcc ? 'Remove accepting' : 'Make accepting'}
                    style={{
                      padding: '1px 4px',
                      fontSize: '0.65rem',
                      background: isAcc ? 'var(--sapphire)' : undefined,
                      color: isAcc ? '#fff' : undefined,
                    }}
                  >
                    Acc
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleDeleteState(s)}
                    title="Delete state"
                    style={{ padding: '1px 4px', fontSize: '0.65rem', color: 'var(--ruby)' }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transitions Section */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            ADD TRANSITION
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, alignItems: 'center', marginBottom: 14 }}>
            <select
              value={transFrom}
              onChange={e => setTransFrom(e.target.value)}
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 6px', fontSize: '0.8rem' }}
            >
              {automaton.states.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="symbol or ε"
              value={transSym}
              onChange={e => setTransSym(e.target.value)}
              style={{ background: 'var(--bg-secondary)', color: 'var(--sapphire)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 6px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
            />

            <select
              value={transTo}
              onChange={e => setTransTo(e.target.value)}
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 6px', fontSize: '0.8rem' }}
            >
              {automaton.states.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <button className="btn btn-primary" onClick={handleAddTransition}>
              Add
            </button>
          </div>

          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
            TRANSITIONS LIST ({automaton.transitions.length})
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {automaton.transitions.map((t, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: 4,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>
                  {t.from} ──( <strong style={{ color: 'var(--sapphire)' }}>{t.symbol || 'ε'}</strong> )──➔ {t.to}
                </span>
                <button
                  className="btn-icon"
                  onClick={() => handleDeleteTransition(idx)}
                  title="Delete transition"
                  style={{ padding: '1px 4px', fontSize: '0.65rem', color: 'var(--ruby)' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
