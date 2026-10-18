// src/components/PumpingLemmaView.tsx
import React, { useState } from 'react';
import { pumpingLemmaLanguages } from '../engine/pumpingLemma';

export const PumpingLemmaView: React.FC = () => {
  const [selectedLangId, setSelectedLangId] = useState<string>('an_bn');
  const currentLang = pumpingLemmaLanguages.find(l => l.id === selectedLangId)!;

  const [p, setP] = useState<number>(currentLang.defaultP);
  const [customS, setCustomS] = useState<string>(currentLang.defaultString(currentLang.defaultP));

  // Decomposition: length of x, length of y
  const [xLen, setXLen] = useState<number>(1);
  const [yLen, setYLen] = useState<number>(1);
  const [pumpI, setPumpI] = useState<number>(2);

  const handleSelectLang = (id: string) => {
    setSelectedLangId(id);
    const lang = pumpingLemmaLanguages.find(l => l.id === id)!;
    setP(lang.defaultP);
    setCustomS(lang.defaultString(lang.defaultP));
    setXLen(1);
    setYLen(1);
    setPumpI(2);
  };

  // Compute x, y, z
  const x = customS.slice(0, Math.min(xLen, customS.length));
  const y = customS.slice(x.length, Math.min(x.length + yLen, customS.length));
  const z = customS.slice(x.length + y.length);

  const decompValidation = currentLang.validateDecomposition(customS, p, x, y, z);
  const pumpResult = currentLang.findPumpingFailure(customS, p, x, y, z, pumpI);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', height: 'calc(100vh - 95px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: Interactive Proof & Game Explorer */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', height: '100%', overflowY: 'auto', padding: '16px', gap: 14 }}>
        {/* Language Selection Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel-header)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>PUMPING LEMMA ADVERSARY EXPLORER</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Interactive contradiction proof that non-regular languages exceed finite memory
            </div>
          </div>

          <select
            value={selectedLangId}
            onChange={e => handleSelectLang(e.target.value)}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', fontSize: '0.8rem' }}
          >
            {pumpingLemmaLanguages.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Selected Language Card */}
        <div className="glass-panel" style={{ padding: '14px' }}>
          <div style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--sapphire)', marginBottom: 4 }}>
            {currentLang.formula}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {currentLang.description}
          </div>
        </div>

        {/* Step 1 & 2: Pumping Constant & String Selection */}
        <div className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            STEP 1 & 2: PUMPING CONSTANT & STRING SELECTION
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>
                PUMPING LENGTH (p): {p}
              </label>
              <input
                type="range"
                min="1"
                max="8"
                value={p}
                onChange={e => {
                  const newP = Number(e.target.value);
                  setP(newP);
                  setCustomS(currentLang.defaultString(newP));
                  setXLen(1);
                  setYLen(1);
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>
                TARGET STRING s ∈ L (|s| ≥ p):
              </label>
              <input
                type="text"
                value={customS}
                onChange={e => setCustomS(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  color: 'var(--topaz)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>
        </div>

        {/* Step 3: Adversary Decomposition s = xyz */}
        <div className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            STEP 3: DECOMPOSITION (s = x · y · z)
          </div>

          {/* Interactive substring segments visualizer */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 36, border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.3)', color: 'var(--sapphire)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, flex: Math.max(0.1, x.length) }}>
              x: "{x}" ({x.length})
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.4)', color: 'var(--ruby)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, flex: Math.max(0.1, y.length), borderLeft: '2px solid var(--ruby)', borderRight: '2px solid var(--ruby)' }}>
              y: "{y}" ({y.length})
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.3)', color: 'var(--emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, flex: Math.max(0.1, z.length) }}>
              z: "{z}" ({z.length})
            </div>
          </div>

          {/* Sliders for |x| and |y| */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>|x| length: {xLen}</span>
              <input
                type="range"
                min="0"
                max={Math.max(0, p - 1)}
                value={xLen}
                onChange={e => setXLen(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>|y| length: {yLen}</span>
              <input
                type="range"
                min="1"
                max={Math.max(1, p - xLen)}
                value={yLen}
                onChange={e => setYLen(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>

          {decompValidation.error && (
            <div style={{ fontSize: '0.75rem', color: 'var(--ruby)' }}>
              ⚠ {decompValidation.error}
            </div>
          )}
        </div>

        {/* Step 4 & 5: Pump Exponent i & Contradiction Result */}
        <div className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              STEP 4 & 5: PUMPING EXPONENT (i)
            </span>
            <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--sapphire)', fontWeight: 700 }}>
              i = {pumpI}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="range"
              min="0"
              max="6"
              value={pumpI}
              onChange={e => setPumpI(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2, 3].map(val => (
                <button
                  key={val}
                  className={`btn-icon ${pumpI === val ? 'btn-primary' : ''}`}
                  onClick={() => setPumpI(val)}
                  style={{ width: 28, height: 28, fontSize: '0.75rem' }}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Pumped String Display */}
          <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 6, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              PUMPED STRING s' = x · y^{pumpI} · z:
            </div>
            <div style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)', color: 'var(--topaz)', wordBreak: 'break-all' }}>
              "{pumpResult.pumpedString}"
            </div>
          </div>

          {/* Verification Badge & Explanation */}
          <div
            style={{
              padding: '10px',
              borderRadius: 6,
              background: !pumpResult.inLanguage ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${!pumpResult.inLanguage ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                className="badge"
                style={{
                  background: !pumpResult.inLanguage ? 'var(--ruby)' : 'var(--emerald)',
                  color: '#fff',
                }}
              >
                {!pumpResult.inLanguage ? '✖ CONTRADICTION FOUND' : 'Still in language'}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: !pumpResult.inLanguage ? 'var(--ruby)' : 'var(--emerald)' }}>
                {!pumpResult.inLanguage ? "s' ∉ L (Language condition violated!)" : "s' ∈ L for this choice"}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
              {pumpResult.contradictionExplanation}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Formal Proof Walkthrough */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '16px', gap: 14 }}>
        <div className="glass-panel" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
            FORMAL MATHEMATICAL PROOF
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentLang.proofWalkthrough.map((step, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: '0.8rem',
                  lineHeight: '1.5',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: idx === currentLang.proofWalkthrough.length - 1 ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                  border: idx === currentLang.proofWalkthrough.length - 1 ? '1px solid var(--sapphire)' : '1px solid var(--border-color)',
                }}
              >
                <span style={{ color: 'var(--sapphire)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {idx + 1}.
                </span>
                <span style={{ color: idx === currentLang.proofWalkthrough.length - 1 ? 'var(--sapphire)' : 'var(--text-main)' }}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
