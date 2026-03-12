// src/entrypoints/options/index.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import ToastProvider from '@/shared/ui/feedback/toast-provider';
import { SaveSettingsBar } from '@/entrypoints/options/components/settings-form';
import './style.css';
import { ConfirmProvider } from '@/shared/hooks/common/use-confirm';
import MappingsSection from '@/entrypoints/options/components/mappings-section';
import UiSection from '@/entrypoints/options/components/ui-section';
import AdvancedSection, { type AdvancedPanelId } from '@/entrypoints/options/components/advanced-section';
import SonarrPage from '@/entrypoints/options/components/sonarr-section';
import RadarrPage from '@/entrypoints/options/components/radarr-section';
import { useExtensionOptions } from '@/shared/queries';
import { createDefaultSettings } from '@/shared/schemas/settings';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import { useSettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';

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
    hasInternalSaveBar: true,
  },
  {
    id: 'mappings',
    label: 'Mappings & overrides',
    description: 'Manage AniList mappings and overrides.',
    path: '/options/mappings',
    usesManager: true,
  },
  {
    id: 'ui',
    label: 'UI & injection',
    description: 'Control AniList overlay and injection behaviour.',
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
  const withoutQuery = cleaned.split('?')[0] ?? '';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
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

const extractTargetAnilistIdFromHash = (hash: string): number | null => {
  const cleaned = (hash ?? '').replace(/^#/, '');
  const query = cleaned.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const raw = params.get('anilistId');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractAdvancedPanelFromHash = (hash: string): AdvancedPanelId => {
  const cleaned = (hash ?? '').replace(/^#/, '');
  const withoutQuery = cleaned.split('?')[0] ?? '';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  if (normalized !== '/options/advanced') return null;

  const query = cleaned.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  return params.get('panel') === 'privacy' ? 'privacy' : null;
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

type OptionsContentProps = {
  activeSection: SectionId;
  setActiveSection: (id: SectionId) => void;
  optionsQuery: ReturnType<typeof useExtensionOptions>;
  targetAnilistId: number | null;
  clearTargetAnilistId: () => void;
  advancedPanel: AdvancedPanelId;
  openPrivacyPanel: () => void;
};
const OptionsContent: React.FC<OptionsContentProps> = ({
  activeSection,
  setActiveSection,
  optionsQuery,
  targetAnilistId,
  clearTargetAnilistId,
  advancedPanel,
  openPrivacyPanel,
}) => {
  const actions = useSettingsActions(optionsQuery.data ? { savedSettings: optionsQuery.data } : {});

  const renderSection = () => {
    switch (activeSection) {
      case 'sonarr':
        return (
          <SonarrPage
            actions={actions}
            {...(optionsQuery.data ? { savedSettings: optionsQuery.data } : {})}
            isLoading={optionsQuery.isLoading}
          />
        );
      case 'radarr':
        return (
          <RadarrPage
            actions={actions}
            {...(optionsQuery.data ? { savedSettings: optionsQuery.data } : {})}
            isLoading={optionsQuery.isLoading}
          />
        );
      case 'mappings':
        return (
          <MappingsSection
            {...(targetAnilistId !== null ? { targetAnilistId } : {})}
            onClearTargetAnilistId={clearTargetAnilistId}
          />
        );
      case 'ui':
        return <UiSection />;
      case 'advanced':
      default:
        return <AdvancedSection actions={actions} focusPanel={advancedPanel} />;
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
            <p className="mt-1">Settings are global. Per-title behaviour stays in the media modal.</p>
          </div>
          <button
            type="button"
            onClick={openPrivacyPanel}
            className="flex w-full items-start gap-3 rounded-lg border border-border-primary bg-bg-secondary/40 p-3 text-left transition-colors hover:bg-bg-secondary/70"
          >
            <span className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-bg-tertiary text-accent-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-text-primary">Privacy & permissions</span>
              <span className="mt-1 block text-xs text-text-secondary">
                See how ani2arr stores settings, uses Arr API keys, and requests host access.
              </span>
            </span>
            <ChevronRight className="mt-1 h-4 w-4 flex-none text-text-secondary" />
          </button>
        </aside>
        <main className="flex-1 space-y-4 pb-12">
          {renderSection()}
          {shouldShowSaveBar ? <SaveSettingsBar actions={actions} isLoading={optionsQuery.isLoading} /> : null}
        </main>
      </div>
    </div>
  );
};

const OptionsPage: React.FC = React.memo(() => {
  const [activeSection, setActiveSection] = useState<SectionId>(getInitialSection);
  const [targetAnilistId, setTargetAnilistId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    return extractTargetAnilistIdFromHash(window.location.hash);
  });
  const [advancedPanel, setAdvancedPanel] = useState<AdvancedPanelId>(() => {
    if (typeof window === 'undefined') return null;
    return extractAdvancedPanelFromHash(window.location.hash);
  });
  const optionsQuery = useExtensionOptions();
  const methods = useForm<SettingsFormValues>({
    defaultValues: (optionsQuery.data ?? createDefaultSettings()) as SettingsFormValues,
    mode: 'onChange',
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setActiveSection(resolveSectionFromHash(hash));
      setTargetAnilistId(extractTargetAnilistIdFromHash(hash));
      setAdvancedPanel(extractAdvancedPanelFromHash(hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const section = sections.find(entry => entry.id === activeSection) ?? sections[0];
    if (!section) return;
    const url = new URL(window.location.href);
    const query =
      activeSection === 'mappings' && typeof targetAnilistId === 'number'
        ? `${section.path}?anilistId=${targetAnilistId}`
        : activeSection === 'advanced' && advancedPanel === 'privacy'
          ? `${section.path}?panel=privacy`
        : section.path;
    url.hash = query;
    window.history.replaceState(null, '', url);
    document.title = `ani2arr - ${section.label}`;
  }, [activeSection, targetAnilistId, advancedPanel]);

  const handleSelectSection = (id: SectionId) => {
    setActiveSection(id);
    if (id !== 'advanced') {
      setAdvancedPanel(null);
    }
  };

  const handleOpenPrivacyPanel = () => {
    setActiveSection('advanced');
    setAdvancedPanel('privacy');
  };

  useEffect(() => {
    if (optionsQuery.data && !methods.formState.isDirty) {
      methods.reset(optionsQuery.data as SettingsFormValues);
    }
  }, [methods, optionsQuery.data]);

  return (
    <FormProvider {...methods}>
      <OptionsContent
        activeSection={activeSection}
        setActiveSection={handleSelectSection}
        optionsQuery={optionsQuery}
        targetAnilistId={targetAnilistId}
        clearTargetAnilistId={() => setTargetAnilistId(null)}
        advancedPanel={advancedPanel}
        openPrivacyPanel={handleOpenPrivacyPanel}
      />
    </FormProvider>
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
