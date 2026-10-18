// src/components/RegexLab.tsx
import React, { useState } from 'react';
import { Automaton } from '../types';
import { AutomatonGraph } from './AutomatonGraph';
import { compileRegexToNfa, compileRegexToDfa, RegexParser } from '../engine/regexToAutomaton';
import { convertNfaToDfa, simulateAutomaton } from '../engine/automaton';

export const RegexLab: React.FC = () => {
  const [regexInput, setRegexInput] = useState<string>('(a|b)*abb');
  const [activeView, setActiveView] = useState<'nfa' | 'dfa' | 'min_dfa'>('nfa');
  const [testStrings, setTestStrings] = useState<string[]>([
    'abb',
    'aabb',
    'babb',
    'ab',
    'bbba',
    'babaabb',
  ]);
  const [newTestStr, setNewTestStr] = useState<string>('');

  const REGEX_PRESETS = [
    { label: 'Ends with abb', regex: '(a|b)*abb' },
    { label: 'Even number of 0s', regex: '(1|01*0)*' },
    { label: 'Decimal Number', regex: '\\d+\\.\\d+' },
    { label: 'Identifier', regex: '[a-zA-Z_][a-zA-Z0-9_]*' },
    { label: 'Binary alternating', regex: '(01|10)+' },
  ];

  // Compile models
  let nfa: Automaton | null = null;
  let dfa: Automaton | null = null;
  let minDfa: Automaton | null = null;
  let astString = '';
  let compileError = '';

  try {
    const parser = new RegexParser(regexInput);
    const ast = parser.parse();
    astString = JSON.stringify(ast, null, 2);

    nfa = compileRegexToNfa('Regex NFA', regexInput);
    dfa = convertNfaToDfa(nfa);
    minDfa = compileRegexToDfa('Regex Min DFA', regexInput);
  } catch (err: any) {
    compileError = err.message || 'Syntax error in regular expression';
  }

  const currentAutomaton =
    activeView === 'nfa' ? nfa : activeView === 'dfa' ? dfa : minDfa;

  const handleAddTestString = () => {
    if (newTestStr && !testStrings.includes(newTestStr)) {
      setTestStrings([...testStrings, newTestStr]);
      setNewTestStr('');
    }
  };

  const handleRemoveTestString = (str: string) => {
    setTestStrings(testStrings.filter(s => s !== str));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Regex Input, Model Selector & Graph Display */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflow: 'hidden' }}>
        {/* Header with Presets & Compilation View Toggle */}
        <div style={{ padding: '10px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>REGULAR EXPRESSION LAB</span>
            {/* Presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Presets:</span>
              <select
                onChange={e => setRegexInput(e.target.value)}
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '2px 6px', fontSize: '0.75rem' }}
              >
                {REGEX_PRESETS.map((p, i) => (
                  <option key={i} value={p.regex}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={regexInput}
              onChange={e => setRegexInput(e.target.value)}
              placeholder="e.g. (a|b)*abb"
              style={{
                flex: 1,
                background: 'var(--bg-secondary)',
                color: 'var(--sapphire)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: '0.9rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          {/* Model Selection Tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn ${activeView === 'nfa' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveView('nfa')}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            >
              1. Thompson ε-NFA ({nfa?.states.length || 0} states)
            </button>
            <button
              className={`btn ${activeView === 'dfa' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveView('dfa')}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            >
              2. Powerset DFA ({dfa?.states.length || 0} states)
            </button>
            <button
              className={`btn ${activeView === 'min_dfa' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveView('min_dfa')}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            >
              3. Minimized DFA ({minDfa?.states.length || 0} states)
            </button>
          </div>
        </div>

        {compileError ? (
          <div style={{ padding: '20px', color: 'var(--ruby)', background: 'rgba(239, 68, 68, 0.1)', margin: '14px', borderRadius: 8 }}>
            <strong>Compilation Error:</strong> {compileError}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <AutomatonGraph automaton={currentAutomaton} interactive={true} />
          </div>
        )}
      </div>

      {/* Right: Test Strings Batch Runner & AST Inspector */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '14px', gap: 14 }}>
        {/* Test Strings Runner */}
        <div className="glass-panel" style={{ padding: '12px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
            TEST SUITE & STRING VALIDATOR
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Add test string..."
              value={newTestStr}
              onChange={e => setNewTestStr(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTestString()}
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
            <button className="btn btn-primary" onClick={handleAddTestString}>
              + Add
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {testStrings.map((str, idx) => {
              let isAcc = false;
              if (currentAutomaton) {
                const steps = simulateAutomaton(currentAutomaton, str);
                isAcc = steps[steps.length - 1]?.isAccepted || false;
              }

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: `1px solid ${isAcc ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="badge"
                      style={{
                        background: isAcc ? 'var(--emerald)' : 'var(--ruby)',
                        color: '#fff',
                        fontSize: '0.65rem',
                      }}
                    >
                      {isAcc ? 'ACCEPT' : 'REJECT'}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                      "{str}"
                    </span>
                  </div>

                  <button
                    className="btn-icon"
                    onClick={() => handleRemoveTestString(str)}
                    style={{ padding: '1px 5px', fontSize: '0.65rem', color: 'var(--ruby)' }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Abstract Syntax Tree (AST) */}
        <div className="glass-panel" style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
            PARSED REGEX SYNTAX TREE (AST)
          </div>
          <pre
            style={{
              flex: 1,
              background: 'var(--bg-secondary)',
              color: 'var(--emerald)',
              padding: '10px',
              borderRadius: 6,
              fontSize: '0.72rem',
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
            }}
          >
            {astString || '// No AST available'}
          </pre>
        </div>
      </div>
    </div>
  );
};
