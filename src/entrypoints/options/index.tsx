// src/entrypoints/options/index.tsx
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import ToastProvider from '@/shared/components/toast-provider';
import { SettingsFormWithManager, SaveSettingsBar, type SettingsManager } from '@/shared/components/settings-form';
import './style.css';
import { ConfirmProvider } from '@/shared/hooks/use-confirm';
import Button from '@/shared/components/button';
import MappingsSection from '@/entrypoints/options/components/mappings-section';
import { useSettingsManager } from '@/shared/hooks/use-settings-manager';
import UiSection from '@/entrypoints/options/components/ui-section';
import AdvancedSection from '@/entrypoints/options/components/advanced-section';

const queryClient = new QueryClient();

type SectionId = 'connections' | 'defaults' | 'mappings' | 'ui' | 'advanced';

const sections: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'connections', label: 'Connections', description: 'Configure how ani2arr talks to your Sonarr and Radarr instances.' },
  { id: 'defaults', label: 'Default options', description: 'Configure default Sonarr add settings.' },
  { id: 'mappings', label: 'Mappings & overrides', description: 'Manage AniList ↔ Sonarr mappings.' },
  { id: 'ui', label: 'UI & injection', description: 'Control AniList overlay and modal behaviour.' },
  { id: 'advanced', label: 'Advanced', description: 'Diagnostics, reset, and upcoming tools.' },
];

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

const SectionHeader: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <header className="space-y-1">
    <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
    <p className="text-sm text-text-secondary">{description}</p>
  </header>
);

const ConnectionsSection: React.FC<{ manager: SettingsManager }> = ({ manager }) => (
  <div className="space-y-6">
    <SectionHeader
      title="Connections"
      description="Configure how ani2arr talks to your Sonarr and Radarr instances."
    />

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border-primary bg-bg-secondary/80 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border-primary pb-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Sonarr</h3>
            <p className="mt-1 text-xs text-text-secondary">Used for series and anime tracking.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
              manager.isConnected
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                : manager.testConnectionState.isPending
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                  : 'bg-slate-700/50 text-text-secondary border-border-primary'
            }`}
          >
            {manager.isConnected
              ? 'Connected'
              : manager.testConnectionState.isPending
                ? 'Connecting'
                : 'Not connected'}
          </span>
        </div>
        <div className="mt-4">
          <SettingsFormWithManager manager={manager} showSaveBar={false} showDefaults={false} />
        </div>
      </div>

      <div className="rounded-2xl border border-border-primary bg-bg-secondary/60 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border-primary pb-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Radarr</h3>
            <p className="mt-1 text-xs text-text-secondary">Used for movies and specials.</p>
          </div>
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold border bg-slate-700/50 text-text-secondary border-border-primary">
            Not connected
          </span>
        </div>
        <div className="mt-4 space-y-3 text-sm text-text-secondary">
          <p>Radarr support is coming soon. Configuration will mirror Sonarr with separate defaults and permissions.</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button disabled variant="secondary" size="sm">
              Configure Radarr
            </Button>
            <span className="text-text-secondary">UI placeholder only; no permissions or storage yet.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DefaultsSection: React.FC<{ manager: SettingsManager }> = ({ manager }) => (
  <div className="space-y-6">
    <SectionHeader title="Default options" description="Configure default Sonarr add settings." />
    <SettingsFormWithManager
      manager={manager}
      showSaveBar={false}
      showConnection={false}
      showDefaults
      sonarrFormLayout="grid"
    />
  </div>
);

const OptionsPage: React.FC = React.memo(() => {
  const [activeSection, setActiveSection] = useState<SectionId>('connections');
  const settingsManager = useSettingsManager();

  const renderSection = () => {
    if (activeSection === 'connections') {
      return <ConnectionsSection manager={settingsManager} />;
    }
    if (activeSection === 'defaults') {
      return <DefaultsSection manager={settingsManager} />;
    }
    if (activeSection === 'mappings') {
      return <MappingsSection />;
    }
    if (activeSection === 'ui') {
      return <UiSection manager={settingsManager} />;
    }
    return <AdvancedSection manager={settingsManager} />;
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:px-8">
        <aside className="w-full md:w-64 md:flex-none space-y-4">
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
          <SaveSettingsBar manager={settingsManager} />
        </main>
      </div>
    </div>
  );
});
OptionsPage.displayName = "OptionsPage";

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
