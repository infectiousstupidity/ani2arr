// src/entrypoints/options/index.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import ToastProvider from '@/shared/components/toast-provider';
import { SaveSettingsBar } from '@/shared/components/settings-form';
import './style.css';
import { ConfirmProvider } from '@/shared/hooks/use-confirm';
import MappingsSection from '@/entrypoints/options/components/mappings-section';
import { useSettingsManager } from '@/shared/hooks/use-settings-manager';
import UiSection from '@/entrypoints/options/components/ui-section';
import AdvancedSection from '@/entrypoints/options/components/advanced-section';
import SonarrPage from '@/entrypoints/options/pages/sonarr';
import RadarrPage from '@/entrypoints/options/pages/radarr';

const queryClient = new QueryClient();

type SectionId = 'sonarr' | 'radarr' | 'mappings' | 'ui' | 'advanced';

interface SectionConfig {
  id: SectionId;
  label: string;
  description: string;
  path: string;
  usesManager: boolean;
  hasInternalSaveBar?: boolean;
}

const sections: SectionConfig[] = [
  {
    id: 'sonarr',
    label: 'Sonarr',
    description: 'Connect Sonarr and configure default add options.',
    path: '/options/sonarr',
    usesManager: true,
    hasInternalSaveBar: true,
  },
  {
    id: 'radarr',
    label: 'Radarr',
    description: 'Configure Radarr connection and defaults.',
    path: '/options/radarr',
    usesManager: true,
  },
  {
    id: 'mappings',
    label: 'Mappings & overrides',
    description: 'Manage AniList to Sonarr mappings.',
    path: '/options/mappings',
    usesManager: true,
  },
  {
    id: 'ui',
    label: 'UI & injection',
    description: 'Control AniList overlay and modal behaviour.',
    path: '/options/ui',
    usesManager: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Diagnostics, reset, and upcoming tools.',
    path: '/options/advanced',
    usesManager: true,
  },
];

const resolveSectionFromHash = (hash: string): SectionId => {
  const cleaned = (hash ?? '').replace(/^#/, '');
  const normalized = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  const normalizedId = normalized.replace(/^\//, '');

  if (normalizedId === 'connections' || normalizedId === 'defaults') {
    return 'sonarr';
  }

  const matchByPath = sections.find(section => section.path === normalized);
  if (matchByPath) return matchByPath.id;

  const matchById = sections.find(
    section => section.id === cleaned || section.id === normalizedId,
  );
  return matchById?.id ?? 'sonarr';
};

const getInitialSection = (): SectionId => {
  if (typeof window === 'undefined') return 'sonarr';
  return resolveSectionFromHash(window.location.hash);
};

const NavItem: React.FC<{
  id: SectionId;
  active: boolean;
  label: string;
  onSelect: (id: SectionId) => void;
}> = ({ id, active, label, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(id)}
    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
      active ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary hover:bg-bg-secondary/60 hover:text-text-primary'
    }`}
  >
    <span>{label}</span>
    {active ? <span className="h-2 w-2 rounded-full bg-accent-primary" aria-hidden /> : null}
  </button>
);

const OptionsPage: React.FC = React.memo(() => {
  const [activeSection, setActiveSection] = useState<SectionId>(getInitialSection);
  const settingsManager = useSettingsManager();

  useEffect(() => {
    const handleHashChange = () => setActiveSection(resolveSectionFromHash(window.location.hash));
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const section = sections.find(entry => entry.id === activeSection) ?? sections[0];
    if (!section) return;
    const url = new URL(window.location.href);
    url.hash = section.path;
    window.history.replaceState(null, '', url);
    document.title = `ani2arr – ${section.label}`;
  }, [activeSection]);

  const renderSection = () => {
    switch (activeSection) {
      case 'sonarr':
        return <SonarrPage manager={settingsManager} />;
      case 'radarr':
        return <RadarrPage />;
      case 'mappings':
        return <MappingsSection />;
      case 'ui':
        return <UiSection manager={settingsManager} />;
      case 'advanced':
      default:
        return <AdvancedSection manager={settingsManager} />;
    }
  };

  const activeConfig = sections.find(section => section.id === activeSection);
  const shouldShowSaveBar = Boolean(activeConfig?.usesManager && !activeConfig?.hasInternalSaveBar);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:px-8">
        <aside className="w-full space-y-4 md:w-64 md:flex-none">
          <div className="flex items-center gap-3">
            <img src="/icons/128.png" alt="ani2arr logo" className="h-10 w-10 rounded-lg" />
            <div>
              <p className="text-lg font-semibold text-text-primary leading-none">ani2arr</p>
            </div>
          </div>
          <div className="h-px bg-border-primary" />
          <nav className="space-y-2">
            {sections.map(section => (
              <NavItem
                key={section.id}
                id={section.id}
                label={section.label}
                active={section.id === activeSection}
                onSelect={setActiveSection}
              />
            ))}
          </nav>
          <div className="rounded-lg border border-border-primary bg-bg-secondary/70 p-3 text-xs text-text-secondary">
            <p className="font-semibold text-text-primary">Tip</p>
            <p className="mt-1">
              Settings are global. Per-title behaviour stays in the media modal.
            </p>
          </div>
        </aside>
        <main className="flex-1 space-y-4 pb-12">
          {renderSection()}
          {shouldShowSaveBar ? <SaveSettingsBar manager={settingsManager} /> : null}
        </main>
      </div>
    </div>
  );
});
OptionsPage.displayName = 'OptionsPage';

// Find the root element and render the app.
const rootElement = document.getElementById('options-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>
            <ConfirmProvider>
              <OptionsPage />
            </ConfirmProvider>
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
