// src/components/TabsNav.tsx
import React from 'react';

export type WorkbenchTab =
  | 'lexer_playground'
  | 'token_rules'
  | 'automaton_designer'
  | 'regex_lab'
  | 'grammar_workbench'
  | 'arden_solver'
  | 'language_operations'
  | 'pumping_lemma'
  | 'equivalence_checker';

interface TabsNavProps {
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  tokenCount?: number;
  diagnosticCount?: number;
}

export const TabsNav: React.FC<TabsNavProps> = ({
  activeTab, setActiveTab, tokenCount = 0, diagnosticCount = 0,
}) => {
  const tabs: Array<{
    id: WorkbenchTab;
    label: string;
    icon: string;
    badge?: string | number;
    badgeClass?: string;
  }> = [
    {
      id: 'lexer_playground', label: 'Lexer Playground', icon: '▤',
      badge: tokenCount > 0 ? `${tokenCount} tokens` : undefined,
      badgeClass: 'badge-blue',
    },
    { id: 'token_rules',         label: 'Token Rules',          icon: '☰' },
    { id: 'automaton_designer',  label: 'Automaton Designer',   icon: '◉' },
    { id: 'regex_lab',           label: 'RegEx Lab',            icon: '⌕' },
    { id: 'grammar_workbench',   label: 'Grammar Workbench',    icon: '∠' },
    { id: 'arden_solver',        label: "Arden's Solver",       icon: 'Σ' },
    { id: 'language_operations', label: 'Language Ops',         icon: '⇄' },
    { id: 'pumping_lemma',       label: 'Pumping Lemma',        icon: '◇' },
    { id: 'equivalence_checker', label: 'Equivalence Checker',  icon: '≈' },
  ];

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'stretch',
      background: 'var(--panel-bg)',
      borderBottom: '1px solid var(--border-color)',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tab-button${isActive ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'lexer_playground' && diagnosticCount > 0 && (
              <span className="badge badge-red" style={{ fontSize: 10, padding: '1px 6px' }}>
                {diagnosticCount} err
              </span>
            )}
            {tab.badge && (
              <span className={`badge ${tab.badgeClass || 'badge-neutral'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
