// src/App.tsx
import React, { useState, useEffect } from 'react';
import { TokenRule, WorkbenchProject } from './types';
import { LANGUAGE_PRESETS } from './defaultRules';
import { Navbar } from './components/Navbar';
import { LexerPlayground } from './components/LexerPlayground';
import { RuleDrawer } from './components/RuleDrawer';

/**
 * Munch is one workbench: the lexical analyzer. Everything the theory needs to
 * show lives on this screen — the token stream and both traces in the main
 * columns, and the specification (rules) plus the languages it cannot express
 * (limits) in the drawer.
 */
export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [currentPreset, setCurrentPreset] = useState<string>('javascript');
  const [projectName, setProjectName] = useState<string>('JavaScript Lexer Demo');
  const [sourceCode, setSourceCode] = useState<string>(
    LANGUAGE_PRESETS.javascript.sampleSource
  );
  const [rules, setRules] = useState<TokenRule[]>(
    LANGUAGE_PRESETS.javascript.rules
  );
  const [resetSignal, setResetSignal] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Sync theme with body class + <html data-theme="...">
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      root.setAttribute('data-theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      root.setAttribute('data-theme', 'dark');
    }
  }, [theme]);

  const handleSelectPreset = (presetKey: string) => {
    const preset = (LANGUAGE_PRESETS as any)[presetKey];
    if (preset) {
      setCurrentPreset(presetKey);
      setProjectName(`${preset.name} Scanner`);
      setSourceCode(preset.sampleSource);
      setRules(preset.rules);
    }
  };

  const handleLoadProject = (project: WorkbenchProject) => {
    setProjectName(project.name || 'Loaded Project');
    setSourceCode(project.sourceCode || '');
    setRules(project.rules || []);
    // The loaded rules may not match any preset; clear the selector so picking
    // the previously shown preset still fires a change event.
    setCurrentPreset('');
  };

  const handleReset = () => {
    handleSelectPreset(
      (LANGUAGE_PRESETS as Record<string, unknown>)[currentPreset]
        ? currentPreset
        : 'javascript'
    );
    // Also reset the trace/selection when the restored source is unchanged.
    setResetSignal(n => n + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden' }}>
      <Navbar
        projectName={projectName}
        setProjectName={setProjectName}
        currentPreset={currentPreset}
        onSelectPreset={handleSelectPreset}
        sourceCode={sourceCode}
        rules={rules}
        onLoadProject={handleLoadProject}
        theme={theme}
        setTheme={setTheme}
        onReset={handleReset}
        rulesOpen={rulesOpen}
        onToggleRules={() => setRulesOpen(open => !open)}
      />

      <main className="app-main" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <LexerPlayground
          sourceCode={sourceCode}
          setSourceCode={setSourceCode}
          rules={rules}
          resetSignal={resetSignal}
        />
      </main>

      <RuleDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        rules={rules}
        onChange={setRules}
      />
    </div>
  );
};

export default App;
