// src/App.tsx
import React, { useState, useEffect } from 'react';
import { TokenRule, WorkbenchProject } from './types';
import { LANGUAGE_PRESETS } from './defaultRules';
import { Navbar } from './components/Navbar';
import { TabsNav, WorkbenchTab } from './components/TabsNav';
import { LexerPlayground } from './components/LexerPlayground';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('lexer_playground');

  const [currentPreset, setCurrentPreset] = useState<string>('javascript');
  const [projectName, setProjectName] = useState<string>('JavaScript Lexer Demo');
  const [sourceCode, setSourceCode] = useState<string>(
    LANGUAGE_PRESETS.javascript.sampleSource
  );
  const [rules, setRules] = useState<TokenRule[]>(
    LANGUAGE_PRESETS.javascript.rules
  );

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
  };

  const handleReset = () => {
    handleSelectPreset(currentPreset);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Top Navbar */}
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
      />

      {/* Main Tools Tab Navigation */}
      <TabsNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workbench Viewport */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <LexerPlayground
          sourceCode={sourceCode}
          setSourceCode={setSourceCode}
          rules={rules}
        />
      </main>
    </div>
  );
};

export default App;
