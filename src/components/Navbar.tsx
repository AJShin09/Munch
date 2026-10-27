// src/components/Navbar.tsx
import React, { useEffect, useRef, useState } from 'react';
import { WorkbenchProject, TokenRule } from '../types';
import { LANGUAGE_PRESETS } from '../defaultRules';

interface NavbarProps {
  projectName: string;
  setProjectName: (name: string) => void;
  currentPreset: string;
  onSelectPreset: (presetKey: string) => void;
  sourceCode: string;
  rules: TokenRule[];
  onLoadProject: (project: WorkbenchProject) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onReset: () => void;
  rulesOpen: boolean;
  onToggleRules: () => void;
}

/** Minimal structural check so a hand-edited or truncated file cannot replace
 *  the workbench state with something the lexer/UI cannot render. */
export const isValidProject = (value: unknown): value is WorkbenchProject => {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<WorkbenchProject>;
  if (typeof project.sourceCode !== 'string') return false;
  if (!Array.isArray(project.rules) || project.rules.length === 0) return false;
  return project.rules.every(rule =>
    !!rule &&
    typeof rule === 'object' &&
    typeof rule.name === 'string' &&
    rule.name.length > 0 &&
    typeof rule.regex === 'string' &&
    typeof rule.priority === 'number' &&
    Number.isFinite(rule.priority) &&
    typeof rule.enabled === 'boolean'
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  projectName, setProjectName, currentPreset, onSelectPreset,
  sourceCode, rules, onLoadProject, theme, setTheme, onReset,
  rulesOpen, onToggleRules,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Non-blocking feedback instead of alert() (alert dialogs are unusable on
  // small screens and interrupt typing). Auto-clears after a few seconds.
  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(id);
  }, [status]);

  const handleExport = () => {
    const project: WorkbenchProject = {
      version: '1.0', name: projectName, sourceCode, rules,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (projectName.trim() || 'munch-project')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'munch-project';
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus({ kind: 'ok', text: `Saved ${safeName}.json` });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed: unknown = JSON.parse(ev.target?.result as string);
        if (isValidProject(parsed)) {
          onLoadProject(parsed);
          setStatus({ kind: 'ok', text: `Loaded ${file.name}` });
        } else {
          setStatus({ kind: 'error', text: 'Invalid project file: expected sourceCode and a non-empty rules array.' });
        }
      } catch {
        setStatus({ kind: 'error', text: 'Failed to parse JSON project file.' });
      }
    };
    reader.onerror = () => setStatus({ kind: 'error', text: `Could not read ${file.name}.` });
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="app-navbar" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 10,
      padding: '8px 16px',
      background: 'var(--panel-bg)',
      borderBottom: '1px solid var(--border-color)',
      flexShrink: 0,
      minWidth: 0,
    }}>
      {/* Brand + Project Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--sapphire), var(--amethyst))',
            boxShadow: '0 0 14px rgba(102,178,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.2 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Munch
              </span>
              <span className="badge badge-blue" style={{ fontSize: 10, padding: '1px 6px' }}>v1.0</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
              The Lexical Analyzer Workbench
            </div>
          </div>
        </div>

        {/* Editable project name */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 'var(--radius)',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Project:</span>
          <input
            type="text"
            value={projectName}
            aria-label="Project name"
            onChange={e => setProjectName(e.target.value)}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-main)', fontSize: 13, fontWeight: 500, width: 160,
              minWidth: 0,
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`btn ${rulesOpen ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={onToggleRules}
            aria-expanded={rulesOpen}
            aria-controls="rule-drawer"
            title="Show the rule set the scanner is using, and the languages it cannot express"
          >
            ⚙ Rules
          </button>
        </div>

        {/* Language preset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Preset:</span>
          <select
            className="ctrl-select"
            aria-label="Language preset"
            value={currentPreset}
            onChange={e => onSelectPreset(e.target.value)}
          >
            {Object.entries(LANGUAGE_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.name}</option>
            ))}
            {currentPreset === '' && (
              <option value="" disabled>Custom / imported</option>
            )}
          </select>
        </div>

        <button className="btn btn-outline" onClick={onReset} style={{ padding: '5px 12px', fontSize: 12 }}>
          ⟲ Reset
        </button>
        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ padding: '5px 12px', fontSize: 12 }}>
          ◫ Open
        </button>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile}/>
        <button className="btn btn-primary" onClick={handleExport} style={{ padding: '5px 12px', fontSize: 12 }}>
          ⤓ Save
        </button>

        {/* Theme toggle */}
        <button
          className="btn-icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        {status && (
          <span
            role="status"
            aria-live="polite"
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: status.kind === 'ok' ? 'var(--emerald)' : 'var(--ruby)',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {status.kind === 'ok' ? '✓ ' : '✕ '}{status.text}
          </span>
        )}
      </div>
    </header>
  );
};
