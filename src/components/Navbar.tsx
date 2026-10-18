// src/components/Navbar.tsx
import React, { useRef } from 'react';
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
}

export const Navbar: React.FC<NavbarProps> = ({
  projectName, setProjectName, currentPreset, onSelectPreset,
  sourceCode, rules, onLoadProject, theme, setTheme, onReset,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    const project: WorkbenchProject = {
      version: '1.0', name: projectName, sourceCode, rules,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const project = JSON.parse(ev.target?.result as string) as WorkbenchProject;
        if (project.rules && Array.isArray(project.rules)) onLoadProject(project);
        else alert('Invalid project file: missing rules.');
      } catch { alert('Failed to parse JSON project file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 10,
      padding: '8px 16px',
      background: 'var(--panel-bg)',
      borderBottom: '1px solid var(--border-color)',
      flexShrink: 0,
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
            onChange={e => setProjectName(e.target.value)}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-main)', fontSize: 13, fontWeight: 500, width: 160,
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Language preset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Preset:</span>
          <select
            className="ctrl-select"
            value={currentPreset}
            onChange={e => onSelectPreset(e.target.value)}
          >
            {Object.entries(LANGUAGE_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.name}</option>
            ))}
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
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
};
