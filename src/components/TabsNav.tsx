// src/components/TabsNav.tsx
import React from 'react';

export type WorkbenchTab = 'lexer_playground';

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
