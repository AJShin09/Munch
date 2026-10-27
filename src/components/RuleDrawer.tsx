// src/components/RuleDrawer.tsx
//
// One slide-over surface for the two things the scan screen cannot show:
// the rule set itself (what the scanner is given) and the languages it cannot
// express (why some rules are impossible). Both are about the specification,
// not about the run, so they live beside the stream rather than in it.

import React, { useEffect, useMemo, useState } from 'react';
import { TokenRule } from '../types';
import { analyzeRules, RuleAnalysisResult, RuleIssue } from '../engine/ruleAnalysis';
import { pumpingLemmaLanguages } from '../engine/pumpingLemma';

interface Props {
  open: boolean;
  onClose: () => void;
  rules: TokenRule[];
  onChange: (rules: TokenRule[]) => void;
}

const ISSUE_BADGE: Record<RuleIssue['kind'], { cls: string; label: string }> = {
  invalid: { cls: 'badge badge-red', label: 'invalid pattern' },
  empty: { cls: 'badge badge-red', label: 'matches nothing' },
  shadowed: { cls: 'badge badge-yellow', label: 'never matches' },
  duplicate: { cls: 'badge badge-yellow', label: 'duplicate' },
  tie: { cls: 'badge badge-neutral', label: 'tie' },
};

export const RuleDrawer: React.FC<Props> = ({ open, onClose, rules, onChange }) => {
  const [tab, setTab] = useState<'rules' | 'limits'>('rules');
  const [analysis, setAnalysis] = useState<RuleAnalysisResult | null>(null);
  const [pending, setPending] = useState(false);

  const languages = pumpingLemmaLanguages;

  // Close on Escape — the drawer is an overlay, so a keyboard exit is expected.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Analysis is deliberately deferred: comparing 18 rule languages is not free,
  // and the token stream must stay responsive while a pattern is being typed.
  useEffect(() => {
    if (!open) return;
    setPending(true);
    const id = window.setTimeout(() => {
      try {
        setAnalysis(analyzeRules(rules));
      } catch {
        setAnalysis(null);
      } finally {
        setPending(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [rules, open]);

  if (!open) return null;

  const update = (index: number, patch: Partial<TokenRule>) =>
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  const addRule = () => {
    const nextPriority = rules.reduce((max, r) => Math.max(max, r.priority), 0) + 1;
    onChange([
      ...rules,
      {
        name: `TOKEN_${rules.length + 1}`,
        regex: 'x',
        priority: nextPriority,
        enabled: true,
        category: 'other',
      },
    ]);
  };

  const issuesFor = (name: string): RuleIssue[] =>
    (analysis?.issues ?? []).filter(issue => issue.ruleName === name);

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <aside
      aria-label="Rule set"
      style={{
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 60,
        width: 'min(470px, 94vw)', display: 'flex', flexDirection: 'column',
        background: 'var(--panel-bg)', borderRight: '1px solid var(--border-color)',
        boxShadow: '12px 0 32px rgba(0,0,0,0.35)',
      }}
    >
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="panel-label">Rule Set</span>
          <span className="badge badge-neutral">{enabledCount}/{rules.length} enabled</span>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close rule set">✕</button>
      </div>

      <div className="trace-tabs" style={{ flexShrink: 0 }}>
        <button className={`tab-button${tab === 'rules' ? ' active' : ''}`} style={{ fontSize: 12 }} onClick={() => setTab('rules')}>
          Rules
        </button>
        <button className={`tab-button${tab === 'limits' ? ' active' : ''}`} style={{ fontSize: 12 }} onClick={() => setTab('limits')}>
          Limits
        </button>
      </div>

      {tab === 'rules' ? (
        <>
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            Edits apply immediately. Findings come from comparing rule languages:
            subset (⊆), equality (=) and intersection (∩) over their machines.
            {pending && <span style={{ color: 'var(--topaz)' }}> · analysing…</span>}
            {!pending && analysis && (
              <span> · {analysis.issues.length} finding{analysis.issues.length === 1 ? '' : 's'} over {analysis.pairs} pair{analysis.pairs === 1 ? '' : 's'}{analysis.complete ? '' : ' (partial)'}</span>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((rule, index) => {
              const issues = issuesFor(rule.name);
              return (
                <div key={index} style={{
                  border: `1px solid ${issues.some(i => i.kind === 'invalid' || i.kind === 'empty') ? 'var(--ruby)' : issues.length ? 'var(--topaz)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', padding: '7px 9px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      aria-label={`Enable ${rule.name}`}
                      onChange={e => update(index, { enabled: e.target.checked })}
                    />
                    <input
                      value={rule.name}
                      aria-label="Token name"
                      onChange={e => update(index, { name: e.target.value })}
                      style={{
                        flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                        color: 'var(--text-main)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
                      }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>prio</span>
                    <input
                      type="number"
                      value={rule.priority}
                      aria-label={`Priority for ${rule.name}`}
                      onChange={e => update(index, { priority: Number(e.target.value) })}
                      style={{
                        width: 46, background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                        borderRadius: 4, color: 'var(--text-main)', fontSize: 11, padding: '1px 4px',
                      }}
                    />
                    <button
                      className="btn-icon"
                      title="Delete rule"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => onChange(rules.filter((_, i) => i !== index))}
                      disabled={rules.length <= 1}
                      style={{ opacity: rules.length <= 1 ? 0.35 : 1 }}
                    >✕</button>
                  </div>

                  <input
                    value={rule.regex}
                    aria-label={`Pattern for ${rule.name}`}
                    spellCheck={false}
                    onChange={e => update(index, { regex: e.target.value })}
                    style={{
                      width: '100%', boxSizing: 'border-box', marginTop: 5,
                      background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                      borderRadius: 4, color: 'var(--emerald)', fontSize: 11.5,
                      fontFamily: 'var(--font-mono)', padding: '3px 6px',
                    }}
                  />

                  {(issues.length > 0 || analysis?.states[rule.name] !== undefined) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5, alignItems: 'center' }}>
                      {issues.map((issue, i) => (
                        <span
                          key={i}
                          className={ISSUE_BADGE[issue.kind].cls}
                          style={{ fontSize: 10, padding: '1px 5px' }}
                          title={issue.message}
                        >
                          {ISSUE_BADGE[issue.kind].label}{issue.otherRule ? `: ${issue.otherRule}` : ''}
                        </span>
                      ))}
                      {analysis?.states[rule.name] !== undefined && (
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {analysis.states[rule.name]} DFA states
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button className="btn btn-outline" style={{ padding: '5px 12px', fontSize: 12, alignSelf: 'flex-start' }} onClick={addRule}>
              + Add rule
            </button>
          </div>

          {analysis && analysis.issues.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '7px 12px', maxHeight: '32%', overflow: 'auto', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.06em' }}>
                FINDINGS
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {analysis.issues.map((issue, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>
                    <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{issue.ruleName}</strong>
                    {' — '}{issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: 12 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Every token rule is a regular expression, and a regular expression can only describe a
            regular language. The cases below cannot be written as a rule at all, no matter how the
            pattern is phrased. The argument is the pumping lemma: a machine with finitely many states
            must revisit a state on a long enough string, and the loop between the two visits can be
            repeated or removed without changing acceptance.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            This is not academic. The default <code>BLOCK_COMMENT</code> rule stops at the first
            <code> */</code>; a language with nested comments (as in Rust or Swift) needs a depth
            counter, which is exactly what a finite automaton does not have.
          </p>

          {languages.map(language => (
            <details key={language.id} style={{
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
              background: 'var(--bg-secondary)', padding: '8px 10px', marginBottom: 8,
            }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>
                {language.name}
                <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontWeight: 400, color: 'var(--sapphire)' }}>
                  {language.formula}
                </span>
              </summary>
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 6px' }}>{language.description}</p>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {language.proofWalkthrough.map((line, i) => <li key={i}>{line}</li>)}
                </ol>
              </div>
            </details>
          ))}
        </div>
      )}
    </aside>
  );
};
