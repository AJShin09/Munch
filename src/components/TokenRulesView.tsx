// src/components/TokenRulesView.tsx
import React, { useState } from 'react';
import { TokenRule } from '../types';
import { AutomatonGraph } from './AutomatonGraph';
import { compileRegexToDfa } from '../engine/regexToAutomaton';
import { compileRuleRegex } from '../lexer';

interface TokenRulesViewProps {
  rules: TokenRule[];
  setRules: React.Dispatch<React.SetStateAction<TokenRule[]>>;
}

export const TokenRulesView: React.FC<TokenRulesViewProps> = ({ rules, setRules }) => {
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number>(0);
  const [testString, setTestString] = useState<string>('');
  const [testResult, setTestResult] = useState<{ matches: boolean; matchedText?: string } | null>(null);

  const selectedRule = rules[selectedRuleIndex] || rules[0];

  const handleToggleEnable = (index: number) => {
    setRules(prev =>
      prev.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setRules(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      // Re-assign priorities based on index
      return copy.map((r, i) => ({ ...r, priority: i + 1 }));
    });
    setSelectedRuleIndex(index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (index >= rules.length - 1) return;
    setRules(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy.map((r, i) => ({ ...r, priority: i + 1 }));
    });
    setSelectedRuleIndex(index + 1);
  };

  const handleAddRule = () => {
    const newRule: TokenRule = {
      name: `CUSTOM_RULE_${rules.length + 1}`,
      regex: '[a-z]+',
      priority: rules.length + 1,
      enabled: true,
      color: 'var(--sapphire)',
      category: 'other',
    };
    setRules([...rules, newRule]);
    setSelectedRuleIndex(rules.length);
  };

  const handleDeleteRule = (index: number) => {
    if (rules.length <= 1) {
      alert('At least one token rule must be maintained.');
      return;
    }
    const filtered = rules.filter((_, i) => i !== index).map((r, i) => ({ ...r, priority: i + 1 }));
    setRules(filtered);
    setSelectedRuleIndex(Math.max(0, index - 1));
  };

  const handleUpdateSelected = (patch: Partial<TokenRule>) => {
    setRules(prev =>
      prev.map((r, i) => (i === selectedRuleIndex ? { ...r, ...patch } : r))
    );
  };

  const handleTestRegex = () => {
    if (!selectedRule) return;
    try {
      const reg = new RegExp(`^${selectedRule.regex}`);
      const m = reg.exec(testString);
      if (m && m[0].length > 0) {
        setTestResult({ matches: true, matchedText: m[0] });
      } else {
        setTestResult({ matches: false });
      }
    } catch {
      setTestResult({ matches: false });
    }
  };

  // Compile automaton for selected rule
  let compiledAutomaton = null;
  try {
    if (selectedRule) {
      compiledAutomaton = compileRegexToDfa(selectedRule.name, selectedRule.regex, { ignoreCase: selectedRule.caseInsensitive });
    }
  } catch {
    compiledAutomaton = null;
  }

  // Validation: does the pattern even compile as a usable rule regex?
  const regexIsValid = selectedRule ? compileRuleRegex(selectedRule) !== null : true;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Rules List & Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>TOKEN RULES ({rules.length})</span>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Order defines tie-break priority (lower number = higher precedence)
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleAddRule}>
            + Add Rule
          </button>
        </div>

        {/* Rules Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rules.map((rule, idx) => {
              const isSelected = selectedRuleIndex === idx;
              return (
                <div
                  key={rule.name + idx}
                  onClick={() => setSelectedRuleIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--sapphire)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    opacity: rule.enabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={e => {
                        e.stopPropagation();
                        handleToggleEnable(idx);
                      }}
                      title="Enable / Disable Rule"
                    />
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      P{rule.priority}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: rule.color || 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                        {rule.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        /{rule.regex}/
                      </div>
                    </div>
                  </div>

                  {/* Priority Reordering Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-icon"
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      title="Increase Priority (Move Up)"
                      style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    >
                      ▲
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === rules.length - 1}
                      title="Decrease Priority (Move Down)"
                      style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    >
                      ▼
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeleteRule(idx)}
                      title="Delete Rule"
                      style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--ruby)' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Selected Rule Editor, Regex Tester & Compiled Automaton */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {selectedRule ? (
          <>
            {/* Rule Configuration Form */}
            <div style={{ padding: '14px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                EDIT TOKEN DEFINITION
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                    TOKEN TYPE NAME
                  </label>
                  <input
                    type="text"
                    value={selectedRule.name}
                    onChange={e => handleUpdateSelected({ name: e.target.value })}
                    style={{
                      width: '100%',
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
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                    BADGE COLOR
                  </label>
                  <input
                    type="color"
                    value={selectedRule.color && /^#[0-9a-fA-F]{6}$/.test(selectedRule.color) ? selectedRule.color : '#66b2ff'}
                    onChange={e => handleUpdateSelected({ color: e.target.value })}
                    style={{
                      width: '100%',
                      height: 34,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                  REGULAR EXPRESSION PATTERN
                </label>
                <input
                  type="text"
                  value={selectedRule.regex}
                  onChange={e => handleUpdateSelected({ regex: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    color: 'var(--sapphire)',
                    border: `1px solid ${regexIsValid ? 'var(--border-color)' : 'var(--ruby)'}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
                {!regexIsValid && (
                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--ruby)' }}>
                    ✕ Invalid regular expression — this rule is ignored during scanning and its characters are reported as unrecognized.
                  </div>
                )}
                {regexIsValid && !compiledAutomaton && (
                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--topaz)' }}>
                    ⚠ Pattern matches text, but no DFA preview is available (unsupported construct such as lookaround). The rule still tokenizes correctly.
                  </div>
                )}
              </div>

              {/* Live String Tester */}
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Test Lexeme Match
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Enter sample input string..."
                    value={testString}
                    onChange={e => {
                      setTestString(e.target.value);
                      setTestResult(null);
                    }}
                    style={{
                      flex: 1,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: '0.82rem',
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <button className="btn btn-primary" onClick={handleTestRegex}>
                    Test
                  </button>
                </div>

                {testResult && (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {testResult.matches ? (
                      <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>
                        ✓ Matched "{testResult.matchedText}" ({testResult.matchedText?.length} chars)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ruby)', fontWeight: 600 }}>
                        ✕ No match at start of input
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Compiled Automaton for this rule */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '8px 14px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                COMPILED RECOGNITION DFA FOR {selectedRule.name}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AutomatonGraph automaton={compiledAutomaton} interactive={true} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Select a rule on the left to edit.
          </div>
        )}
      </div>
    </div>
  );
};
