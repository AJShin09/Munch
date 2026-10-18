// src/components/LexerPlayground.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Token, TokenRule, Automaton } from '../types';
import { SteppedLexer, LexerAnalysisResult, computeSourcePos } from '../engine/steppedLexer';
import { AutomatonGraph } from './AutomatonGraph';
import { compileRegexToDfa } from '../engine/regexToAutomaton';
import { simulateAutomaton } from '../engine/automaton';
import { deriveDfaPanelModel } from '../engine/dfaPanelModel';

interface LexerPlaygroundProps {
  sourceCode: string;
  setSourceCode: (src: string) => void;
  rules: TokenRule[];
}

function displayChar(ch: string | undefined): string {
  if (ch === undefined) return '∅';
  if (ch === '\n') return '\\n';
  if (ch === '\r') return '\\r';
  if (ch === '\t') return '\\t';
  if (ch === ' ') return '␣';
  return ch;
}

export const LexerPlayground: React.FC<LexerPlaygroundProps> = ({
  sourceCode, setSourceCode, rules,
}) => {
  const analysis = useMemo<LexerAnalysisResult>(
    () => new SteppedLexer(rules).analyze(sourceCode),
    [sourceCode, rules]
  );
  const [selectedTokenIdx, setSelectedTokenIdx] = useState<number | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(400);
  const [activePanel, setActivePanel] = useState<'trace' | 'dfa' | 'diagnostics'>('trace');
  const [dfaCharIdx, setDfaCharIdx] = useState(0);
  const [dfaPlaying, setDfaPlaying] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const playTimerRef = useRef<number | null>(null);

  // Analysis is recomputed synchronously from (sourceCode, rules), so the token
  // stream, diagnostics and trace can never show a stale result for a previous
  // edit. Selection/step indices are reset during render when the analysis
  // identity changes — no committed frame pairs fresh tokens with old indices.
  const [prevAnalysis, setPrevAnalysis] = useState(analysis);
  if (analysis !== prevAnalysis) {
    setPrevAnalysis(analysis);
    setCurrentStepIdx(0);
    setSelectedTokenIdx(null);
  }

  // Animation loop
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = window.setInterval(() => {
        setCurrentStepIdx(curr => {
          if (curr + 1 < analysis.traceSteps.length) return curr + 1;
          setIsPlaying(false);
          return curr;
        });
      }, playSpeed);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [isPlaying, playSpeed, analysis.traceSteps.length]);

  const currentStep = analysis.traceSteps[currentStepIdx];
  const selectedToken: Token | undefined =
    selectedTokenIdx !== null ? analysis.tokens[selectedTokenIdx] : currentStep?.tokenEmitted;

  // Canonical automaton for the selected token — derived synchronously, so every
  // render pairs the current lexeme with the correct DFA (no effect-lag frame
  // where a new lexeme is simulated on the previous token's automaton).
  const tokenAutomaton = useMemo<Automaton | null>(() => {
    if (!selectedToken) return null;
    if (selectedToken.automaton) return selectedToken.automaton;
    const rule = rules.find(r => r.name === selectedToken.type);
    if (!rule) return null;
    try {
      return compileRegexToDfa(rule.name, rule.regex, { ignoreCase: rule.caseInsensitive });
    } catch {
      return null;
    }
  }, [selectedToken, rules]);

  // The real recognition trace: the token's lexeme on its rule's DFA. This is
  // the only simulation; everything in the DFA panel derives from it.
  const dfaSteps = useMemo(() => {
    if (!tokenAutomaton || !selectedToken) return [];
    return simulateAutomaton(tokenAutomaton, selectedToken.lexeme);
  }, [tokenAutomaton, selectedToken]);

  // Reset the character cursor *during render* whenever the simulated lexeme
  // changes (React's "adjust state when a prop changes" pattern), so no
  // committed frame can show a stale index against a fresh trace. Replaces the
  // old post-commit reset effect that left one render out of sync.
  const simKey = selectedToken
    ? `${selectedToken.type}@${selectedToken.start.offset}#${selectedToken.end.offset}:${dfaSteps.length}:${selectedToken.lexeme}`
    : `none:${dfaSteps.length}`;
  const [prevSimKey, setPrevSimKey] = useState(simKey);
  if (simKey !== prevSimKey) {
    setPrevSimKey(simKey);
    setDfaCharIdx(0);
    setDfaPlaying(false);
  }

  // Single canonical panel model: the character strip, the counter, the
  // transition readout, the graph highlight and the accept/reject badges all
  // derive from this one value — they cannot disagree by construction.
  const dfaModel = useMemo(
    () => deriveDfaPanelModel(dfaSteps, dfaCharIdx),
    [dfaSteps, dfaCharIdx]
  );

  const selectToken = (idx: number) => {
    setSelectedTokenIdx(idx);
    const tok = analysis.tokens[idx];
    setDfaCharIdx(0);
    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.setSelectionRange(tok.start.offset, tok.end.offset);
    }
  };

  const navigateToOffset = (startOffset: number, endOffset?: number) => {
    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.setSelectionRange(startOffset, endOffset ?? startOffset);
    }
  };

  const step = (delta: number) => setCurrentStepIdx(i => Math.max(0, Math.min(analysis.traceSteps.length - 1, i + delta)));
  const jumpToNextToken = () => {
    for (let i = currentStepIdx + 1; i < analysis.traceSteps.length; i++) {
      if (analysis.traceSteps[i].action === 'EMIT_TOKEN') { setCurrentStepIdx(i); return; }
    }
  };
  const jumpToNextError = () => {
    for (let i = currentStepIdx + 1; i < analysis.traceSteps.length; i++) {
      if (analysis.traceSteps[i].action === 'EMIT_UNKNOWN') { setCurrentStepIdx(i); return; }
    }
  };

  // DFA panel derived data — all fields come from the one canonical model.
  const lexemeChars = dfaModel.chars;
  const dfaCurrent = dfaModel.current;
  const dfaNext = dfaModel.next;
  const dfaComplete = dfaModel.complete;
  const dfaAccepted = dfaModel.accepted;
  const activeTransition = dfaModel.activeTransition;
  const dfaAlphabet = useMemo(
    () => new Set(tokenAutomaton?.alphabet ?? []),
    [tokenAutomaton]
  );
  const charsOutsideAlphabet = selectedToken
    ? Array.from(new Set(lexemeChars.filter(c => !dfaAlphabet.has(c))))
    : [];

  // Per-character DFA trace of the *selected token* — rows come straight from
  // the same simulation (`dfaSteps`) that drives the graph, so this trace, the
  // stepper and the accept/reject badge can never disagree.
  const dfaTraceRows = useMemo(() => {
    if (!selectedToken) return [];
    const base = selectedToken.start.offset;
    const fmt = (s: Set<string>) => (s.size === 0 ? '∅' : '{' + Array.from(s).sort().join(', ') + '}');
    const last = dfaSteps.length - 1;
    return dfaSteps.map((s, i) => {
      let result: string;
      if (s.activeStates.size === 0) result = 'dead — no transition';
      else if (i === last) result = s.isAccepted ? 'accepts' : 'stops — non-accepting';
      else result = 'continue';
      return {
        i,
        char: s.symbol,
        offset: i === 0 ? null : base + (i - 1),
        from: i === 0 ? '∅' : fmt(dfaSteps[i - 1].activeStates),
        to: fmt(s.activeStates),
        result,
        accepting: !!s.isAccepted,
      };
    });
  }, [dfaSteps, selectedToken]);

  const eofPos = computeSourcePos(sourceCode, sourceCode.length);

  // DFA character-level play loop (independent from the token-level play)
  useEffect(() => {
    if (!dfaPlaying) return;
    if (dfaCharIdx >= lexemeChars.length) {
      setDfaPlaying(false);
      return;
    }
    const id = window.setTimeout(
      () => setDfaCharIdx(i => Math.min(lexemeChars.length, i + 1)),
      260
    );
    return () => window.clearTimeout(id);
  }, [dfaPlaying, dfaCharIdx, lexemeChars.length]);

  const H = 'calc(100vh - 95px)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', height: H, overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* ── LEFT: Editor + Token Stream ── */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', overflow: 'hidden' }}>

        {/* Controls header */}
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="panel-label">Source Input</span>
            <span className="badge badge-neutral">{sourceCode.length} chars</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <button className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`} style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? '‖ Pause' : '▷ Run'}
            </button>
            <button className="btn-icon" onClick={() => step(-1)} disabled={currentStepIdx <= 0} title="Step back">|◀</button>
            <button className="btn-icon" onClick={() => step(1)} disabled={currentStepIdx >= analysis.traceSteps.length - 1} title="Step forward">▶|</button>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={jumpToNextToken}>» Token</button>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={jumpToNextError}>⚠ Error</button>
            <button className="btn-icon" onClick={() => { setIsPlaying(false); setCurrentStepIdx(0); }} title="Reset">⟲</button>
          </div>
        </div>

        {/* Step indicator + speed */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 14px', background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            Step {currentStepIdx + 1} / {Math.max(1, analysis.traceSteps.length)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)' }}>
            <span>Speed: {playSpeed}ms</span>
            <input type="range" min="80" max="1500" step="40" value={playSpeed}
              onChange={e => setPlaySpeed(Number(e.target.value))}
              style={{ width: 80, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Source Editor */}
        <div className="source-editor-wrap" style={{ flex: 1, minHeight: 150, overflow: 'hidden' }}>
          <div className="source-line-nums">
            {sourceCode.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <textarea
            ref={editorRef}
            className="source-textarea"
            value={sourceCode}
            onChange={e => setSourceCode(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Token Stream */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)', flex: '0 0 auto',
          maxHeight: '38%', overflow: 'hidden',
        }}>
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="panel-label">Token Stream</span>
              <span className="badge badge-blue">{analysis.tokens.length}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Click a token to inspect</span>
          </div>

          <div style={{
            flex: 1, padding: '8px 10px', overflowY: 'auto',
            display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start',
          }}>
            {analysis.tokens.map((tok, idx) => {
              const isSelected = selectedTokenIdx === idx;
              const isErr = tok.type === 'UNKNOWN';
              const rule = rules.find(r => r.name === tok.type);
              const color = isErr ? 'var(--ruby)' : (rule?.color || 'var(--accent)');
              const lexDisplay = tok.lexeme === '\n' ? '↵' : tok.lexeme === ' ' ? '·' : tok.lexeme;

              return (
                <button
                  key={idx}
                  className={`token-card${isSelected ? ' selected' : ''}${isErr ? ' error' : ''}`}
                  onClick={() => selectToken(idx)}
                >
                  <div className="token-type">
                    <span className="token-dot" style={{ background: color }} />
                    <span style={{ color }}>{tok.type}</span>
                  </div>
                  <div className="token-lexeme">{lexDisplay}</div>
                  <div className="token-offset">[{tok.start.offset}‥{tok.end.offset}]</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Automaton + Trace ── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Automaton panel */}
        <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-color)', overflow: 'hidden', minHeight: 200 }}>
          <div className="panel-header">
            <span className="panel-label">Token Recognizer DFA</span>
            {selectedToken && (
              <span className="badge badge-blue">
                {selectedToken.type} · "{selectedToken.lexeme.slice(0, 24)}"
              </span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <AutomatonGraph automaton={tokenAutomaton} activeStates={dfaModel.activeStates} activeTransition={activeTransition} interactive />
            {selectedToken && !tokenAutomaton && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12,
                background: 'var(--bg-primary)', opacity: 0.92,
              }}>
                No DFA available for {selectedToken.type}: the rule's pattern cannot be compiled to a finite
                automaton (unsupported construct). The token was still produced by the regex engine.
              </div>
            )}
          </div>
          {selectedToken && (
            <div style={{
              padding: '6px 14px', background: 'var(--bg-card)',
              borderTop: '1px solid var(--border-color)',
              display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
            }}>
              {/* Token metadata row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                <span><strong style={{ color: 'var(--text-main)' }}>Rule:</strong> {selectedToken.ruleName || '—'}</span>
                <span><strong style={{ color: 'var(--text-main)' }}>Position:</strong> L{selectedToken.start.line + 1}:C{selectedToken.start.column + 1}</span>
                <span><strong style={{ color: 'var(--text-main)' }}>Length:</strong> {selectedToken.lexeme.length} chars</span>
                <span><strong style={{ color: 'var(--text-main)' }}>Offset:</strong> [{selectedToken.start.offset}‥{selectedToken.end.offset}]</span>
                <span><strong style={{ color: 'var(--text-main)' }}>Priority:</strong> {selectedToken.priority ?? '—'}</span>
              </div>

              {/* DFA character stepper */}
              {tokenAutomaton && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>DFA INPUT:</span>
                  <button className={`btn ${dfaPlaying ? 'btn-danger' : 'btn-primary'}`} style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => {
                      if (dfaModel.idx >= lexemeChars.length) setDfaCharIdx(0);
                      setDfaPlaying(p => !p);
                    }}
                    title={dfaPlaying ? 'Pause DFA simulation' : 'Play DFA simulation'}>
                    {dfaPlaying ? '‖' : '▷'}
                  </button>
                  <button className="btn-icon" style={{ padding: '0 6px', fontSize: 11 }}
                    onClick={() => { setDfaPlaying(false); setDfaCharIdx(i => Math.max(0, i - 1)); }}
                    disabled={dfaModel.idx <= 0} title="Previous character">◀</button>
                  <button className="btn-icon" style={{ padding: '0 6px', fontSize: 11 }}
                    onClick={() => { setDfaPlaying(false); setDfaCharIdx(i => Math.min(lexemeChars.length, i + 1)); }}
                    disabled={dfaModel.idx >= lexemeChars.length} title="Next character">▶</button>
                  <button className="btn-icon" style={{ padding: '0 6px', fontSize: 11 }}
                    onClick={() => { setDfaPlaying(false); setDfaCharIdx(0); }}
                    disabled={dfaModel.idx === 0} title="Reset to initial state">⟲</button>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {lexemeChars.map((c, i) => (
                      <span key={i} style={{
                        minWidth: 20, textAlign: 'center', padding: '1px 3px', borderRadius: 4,
                        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                        border: `1px solid ${i === dfaModel.idx ? 'var(--topaz)' : 'var(--border-color)'}`,
                        background: i === dfaModel.idx ? 'rgba(245,158,11,0.25)' : i < dfaModel.idx ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)',
                        color: i === dfaModel.idx ? 'var(--topaz)' : i < dfaModel.idx ? 'var(--emerald)' : 'var(--text-muted)',
                      }}>
                        {displayChar(c)}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {dfaModel.idx}/{lexemeChars.length}
                  </span>

                  {dfaComplete ? (
                    <>
                      {dfaAccepted ? (
                        <span className="badge badge-green">✓ DFA ACCEPTS — lexer &amp; DFA agree</span>
                      ) : (
                        <span className="badge badge-red">✕ DFA REJECTS — lexer &amp; DFA disagree</span>
                      )}
                      {charsOutsideAlphabet.length > 0 && (
                        <span className="badge badge-yellow" title={`Characters not in DFA alphabet: ${charsOutsideAlphabet.map(c => displayChar(c)).join(' ')}`}>
                          ∉ alphabet: {charsOutsideAlphabet.map(c => displayChar(c)).join(' ')}
                        </span>
                      )}
                    </>
                  ) : (dfaModel.dead ? (
                    <span className="badge badge-red">✕ DEAD (no transition for this character)</span>
                  ) : null)}
                </div>
              )}

              {/* Current transition readout */}
                  {tokenAutomaton && dfaCurrent && (
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      <div>
                        char <span style={{ color: 'var(--topaz)', fontWeight: 700 }}>{dfaModel.idx < lexemeChars.length ? displayChar(lexemeChars[dfaModel.idx]) : '∅ (end of input)'}</span>
                        {' · '}from <span style={{ color: 'var(--sapphire)' }}>{'{' + Array.from(dfaCurrent.activeStates).sort().join(', ') + '}'}</span>
                        {' '}→{' '}
                        <span style={{ color: 'var(--sapphire)' }}>
                          {dfaNext ? '{' + Array.from(dfaNext.activeStates).sort().join(', ') + '}' : '{∅}'}
                        </span>
                      </div>
                      <div>
                        {dfaComplete ? (
                          dfaAccepted
                            ? <span style={{ color: 'var(--emerald)' }}>✓ final state is accepting → token matched</span>
                            : <span style={{ color: 'var(--ruby)' }}>✕ final state is non-accepting → rejects a token the lexer emitted</span>
                        ) : dfaNext && dfaNext.activeStates.size === 0 ? (
                          <span style={{ color: 'var(--ruby)' }}>✕ dead state — no outgoing transition for '{displayChar(lexemeChars[dfaModel.idx])}'</span>
                        ) : dfaNext ? (
                          <span style={{ color: 'var(--text-dim)' }}>
                            {dfaNext.isAccepted ? 'accepting state reached' : 'non-accepting state'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
            </div>
          )}
        </div>

        {/* Execution Trace / Diagnostics */}
        <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            <button className={`tab-button${activePanel === 'trace' ? ' active' : ''}`}
              onClick={() => setActivePanel('trace')} style={{ fontSize: 12 }}>
              ▤ Execution Trace
              <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 5px' }}>
                {analysis.traceSteps.length}
              </span>
            </button>
            <button className={`tab-button${activePanel === 'dfa' ? ' active' : ''}`}
              onClick={() => setActivePanel('dfa')} style={{ fontSize: 12 }}>
              ◎ DFA Trace
              {selectedToken && (
                <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 5px' }}>
                  {dfaSteps.length}
                </span>
              )}
            </button>
            <button className={`tab-button${activePanel === 'diagnostics' ? ' active' : ''}`}
              onClick={() => setActivePanel('diagnostics')} style={{ fontSize: 12 }}>
              ⚠ Diagnostics
              {analysis.diagnostics.length > 0 && (
                <span className={`badge ${analysis.diagnostics.some(d => d.severity === 'error') ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 10, padding: '1px 5px' }}>
                  {analysis.diagnostics.length}
                </span>
              )}
            </button>
          </div>

          {activePanel === 'trace' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '5px 12px', fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                Lexer-wide tokenization trace — one row per emitted token / unrecognized character.
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <table className="trace-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Offset</th>
                      <th>Line:Col</th>
                      <th>Char</th>
                      <th>Candidates</th>
                      <th>Action</th>
                      <th>Token</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.traceSteps.map((step, idx) => {
                      const p = computeSourcePos(sourceCode, step.pos);
                      return (
                        <tr key={idx} className={currentStepIdx === idx ? 'current' : ''} onClick={() => setCurrentStepIdx(idx)}>
                          <td style={{ color: 'var(--text-dim)' }}>{step.stepIndex}</td>
                          <td style={{ color: 'var(--sapphire)' }}>{step.pos}</td>
                          <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{p.line + 1}:{p.column + 1}</td>
                          <td style={{ color: 'var(--topaz)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{displayChar(step.char)}</td>
                          <td>
                            {step.activeCandidateRules.length === 0 ? (
                              <span style={{ color: 'var(--text-dim)' }}>—</span>
                            ) : (
                              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {step.activeCandidateRules.map(c => (
                                  <span key={c.ruleName}
                                    className={`badge ${c.isBest ? 'badge-green' : 'badge-neutral'}`}
                                    style={{ fontSize: 10, padding: '1px 5px' }}
                                    title={`matched "${c.matchedText}"`}>
                                    {c.ruleName}{c.isBest ? ' ★' : ''}
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${step.action === 'EMIT_TOKEN' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                              {step.action}
                            </span>
                          </td>
                          <td style={{ color: 'var(--topaz)' }}>
                            {step.tokenEmitted ? `${step.tokenEmitted.type}("${step.tokenEmitted.lexeme.replace(/\n/g, '↵')}")` : '—'}
                          </td>
                          <td style={{ color: 'var(--text-main)', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
                            {step.explanation}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ color: 'var(--text-dim)' }} title="End of input">
                      <td>—</td>
                      <td style={{ color: 'var(--sapphire)' }}>{sourceCode.length}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{eofPos.line + 1}:{eofPos.column + 1}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>■</td>
                      <td>—</td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>END_OF_INPUT</span>
                      </td>
                      <td>—</td>
                      <td style={{ fontFamily: 'var(--font-sans)', fontSize: 12 }}>
                        End of input at offset {sourceCode.length} — {analysis.tokens.length} token(s), {analysis.diagnostics.length} diagnostic(s).
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === 'dfa' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '5px 12px', fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                {selectedToken && dfaSteps.length > 0
                  ? <>Selected token&apos;s DFA trace — <span style={{ color: 'var(--topaz)', fontFamily: 'var(--font-mono)' }}>{selectedToken.type}("{selectedToken.lexeme.slice(0, 24).replace(/\n/g, '↵')}")</span> — one row per consumed character.</>
                  : 'Select a token in the stream (or step the tokenization trace) to see its per-character DFA trace.'}
              </div>
              {selectedToken && dfaSteps.length > 0 ? (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <table className="trace-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Char</th>
                        <th>Offset</th>
                        <th>From State</th>
                        <th>Transition</th>
                        <th>To State</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dfaTraceRows.map(row => (
                        <tr key={row.i} className={dfaModel.idx === row.i ? 'current' : ''}
                          onClick={() => { setDfaPlaying(false); setDfaCharIdx(row.i); }}>
                          <td style={{ color: 'var(--text-dim)' }}>{row.i} / {dfaSteps.length - 1}</td>
                          <td style={{ color: 'var(--topaz)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {row.i === 0 ? '(initial)' : displayChar(row.char ?? '')}
                          </td>
                          <td style={{ color: 'var(--sapphire)', fontFamily: 'var(--font-mono)' }}>{row.offset ?? '—'}</td>
                          <td style={{ color: 'var(--sapphire)', fontFamily: 'var(--font-mono)' }}>{row.from}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {row.i === 0 ? 'ε-closure' : `on '${displayChar(row.char ?? '')}'`}
                          </td>
                          <td style={{ color: 'var(--sapphire)', fontFamily: 'var(--font-mono)' }}>{row.to}</td>
                          <td style={{ color: row.result === 'dead — no transition' ? 'var(--ruby)' : row.accepting ? 'var(--emerald)' : 'var(--text-muted)', fontSize: 12 }}>
                            {row.result}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13, padding: 16, textAlign: 'center' }}>
                  No selected token — click a token card on the left.
                </div>
              )}
            </div>
          )}

          {activePanel === 'diagnostics' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {analysis.diagnostics.length === 0 ? (
                <div style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span>✓</span> No lexical errors — all characters tokenized successfully.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysis.diagnostics.map((d, i) => {
                    const isError = d.severity === 'error';
                    return (
                      <div
                        key={i}
                        className="glass-panel"
                        onClick={() => navigateToOffset(d.pos.offset, d.endPos?.offset)}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          borderColor: isError ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)',
                          background: isError ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
                        }}
                        title="Click to jump to source location"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${isError ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 10 }}>
                              {d.severity.toUpperCase()}
                            </span>
                            <span style={{ color: isError ? 'var(--ruby)' : 'var(--topaz)', fontWeight: 600, fontSize: 13 }}>{d.message}</span>
                          </span>
                          <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                            L{d.pos.line + 1}:C{d.pos.column + 1}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {d.code && <span style={{ fontFamily: 'var(--font-mono)', marginRight: 8 }}>{d.code}</span>}
                          Offset {d.pos.offset}{d.endPos ? `–${d.endPos.offset}` : ''} — {isError
                            ? 'the offending character is emitted as an UNKNOWN token and scanning resumes at the next character.'
                            : 'scanning continues normally; this is a warning, not an error.'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
