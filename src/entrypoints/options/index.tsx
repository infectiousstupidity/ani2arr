// src/entrypoints/options/index.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { browser } from 'wxt/browser';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import appIcon from '@/assets/icon.png';
import ToastProvider from '@/shared/ui/feedback/toast-provider';
import './style.css';
import { ConfirmProvider } from '@/shared/hooks/common/use-confirm';
import MappingsSection from '@/entrypoints/options/components/mappings-section';
import UiSection from '@/entrypoints/options/components/ui-section';
import AdvancedSection, { type AdvancedPanelId } from '@/entrypoints/options/components/advanced-section';
import SonarrPage from '@/entrypoints/options/components/sonarr-section';
import RadarrPage from '@/entrypoints/options/components/radarr-section';
import { useExtensionOptions } from '@/shared/queries';
import { useProviderConnectionCheck } from '@/features/options/use-provider-connection-check';
import { useProviderConnectionStatus } from '@/features/options/use-provider-connection-status';
import {
  getProviderConnectionStatusAppearance,
  type ProviderConnectionStatus,
} from '@/shared/providers/common/connection-status';
import { createDefaultSettings } from '@/shared/schemas/settings';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import { useSettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import { useA2aBroadcasts } from '@/shared/hooks/use-broadcasts';
import {
  AdvancedIcon,
  MappingsIcon,
  RadarrIcon,
  SonarrIcon,
  UiActionsIcon,
} from '@/entrypoints/options/components/sidebar-icons';

const queryClient = new QueryClient();
const extensionVersion = browser.runtime.getManifest()?.version ?? 'unknown';

type SectionId = 'sonarr' | 'radarr' | 'mappings' | 'ui' | 'advanced';

interface SectionConfig {
  id: SectionId;
  label: string;
  description: string;
  path: string;
  usesManager: boolean;
  group: 'services' | 'extension';
  icon: React.ComponentType<{ className?: string }>;
}

const sections: SectionConfig[] = [
  {
    id: 'sonarr',
    label: 'Sonarr',
    description: 'Connect Sonarr, review status, and set series defaults.',
    path: '/options/sonarr',
    usesManager: true,
    group: 'services',
    icon: SonarrIcon,
  },
  {
    id: 'radarr',
    label: 'Radarr',
    description: 'Connect Radarr, review status, and set movie defaults.',
    path: '/options/radarr',
    usesManager: true,
    group: 'services',
    icon: RadarrIcon,
  },
  {
    id: 'mappings',
    label: 'Mappings & overrides',
    description: 'Manage AniList mappings and overrides.',
    path: '/options/mappings',
    usesManager: true,
    group: 'extension',
    icon: MappingsIcon,
  },
  {
    id: 'ui',
    label: 'UI & actions',
    description: 'Control provider-specific overlay and page actions.',
    path: '/options/ui',
    usesManager: true,
    group: 'extension',
    icon: UiActionsIcon,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Diagnostics, reset, and upcoming tools.',
    path: '/options/advanced',
    usesManager: true,
    group: 'extension',
    icon: AdvancedIcon,
  },
];

const navGroups: Array<{ title: string; group: SectionConfig['group'] }> = [
  { title: 'Services', group: 'services' },
  { title: 'Extension', group: 'extension' },
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
  section: SectionConfig;
  active: boolean;
  status?: ProviderConnectionStatus;
  onSelect: (id: SectionId) => void;
}> = ({ section, active, status, onSelect }) => {
  const Icon = section.icon;
  const statusAppearance = status ? getProviderConnectionStatusAppearance(status) : null;
  const showStatusDot = Boolean(statusAppearance);

  return (
  <button
    type="button"
    onClick={() => onSelect(section.id)}
    className="a2a-nav-item"
    data-active={active || undefined}
  >
    <span className="a2a-nav-item__content">
      <span className="a2a-nav-item__icon">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span>{section.label}</span>
      {showStatusDot ? (
        <span className={`a2a-nav-item__status-dot ${statusAppearance?.dotClassName}`} aria-hidden />
      ) : null}
    </span>
    {active ? <span className="a2a-nav-item__dot" aria-hidden /> : null}
  </button>
  );
};

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
  const sonarrConfigured = Boolean(
    optionsQuery.data?.providers.sonarr.url && optionsQuery.data?.providers.sonarr.apiKey,
  );
  const radarrConfigured = Boolean(
    optionsQuery.data?.providers.radarr.url && optionsQuery.data?.providers.radarr.apiKey,
  );
  const sonarrCredentials = sonarrConfigured
    ? {
        url: String(optionsQuery.data?.providers.sonarr.url ?? '').trim(),
        apiKey: String(optionsQuery.data?.providers.sonarr.apiKey ?? '').trim(),
      }
    : null;
  const radarrCredentials = radarrConfigured
    ? {
        url: String(optionsQuery.data?.providers.radarr.url ?? '').trim(),
        apiKey: String(optionsQuery.data?.providers.radarr.apiKey ?? '').trim(),
      }
    : null;
  const sonarrConnectionQuery = useProviderConnectionCheck({
    provider: 'sonarr',
    enabled: sonarrConfigured,
    credentials: sonarrCredentials,
  });
  const radarrConnectionQuery = useProviderConnectionCheck({
    provider: 'radarr',
    enabled: radarrConfigured,
    credentials: radarrCredentials,
  });
  const sonarrStatus: ProviderConnectionStatus = useProviderConnectionStatus({
    hasConfiguredCredentials: sonarrConfigured,
    isChecking: sonarrConnectionQuery.isFetching,
    isConnected: sonarrConnectionQuery.isSuccess,
  });
  const radarrStatus: ProviderConnectionStatus = useProviderConnectionStatus({
    hasConfiguredCredentials: radarrConfigured,
    isChecking: radarrConnectionQuery.isFetching,
    isConnected: radarrConnectionQuery.isSuccess,
  });

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

  const showServiceTip = activeSection === 'sonarr' || activeSection === 'radarr';
  const showPrivacyCard = activeSection !== 'advanced';

  return (
    <div className="a2a-options-page min-h-screen text-text-primary">
      <div className="a2a-options-shell mx-auto flex w-full max-w-375 flex-col gap-8 px-4 py-8 md:px-6 lg:flex-row lg:px-8">
        <aside className="w-full space-y-5 lg:sticky lg:top-8 lg:max-w-65 lg:flex-none lg:self-start">
          <div className="flex items-center gap-4">
            <img src={appIcon} alt="ani2arr" className="a2a-brand-logo" />
            <div>
              <div className="flex items-baseline gap-2 leading-none">
                <p className="text-lg font-semibold text-text-primary">ani2arr</p>
                <span className="text-xs font-medium tracking-wide text-text-secondary/80">v{extensionVersion}</span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">Extension options</p>
            </div>
          </div>
          <div className="h-px bg-border-primary/70" />
          <nav className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.group}>
                <div className="a2a-nav-group-label">{group.title}</div>
                <div className="mt-2 space-y-2">
                  {sections
                    .filter((section) => section.group === group.group)
                    .map((section) => (
                      <NavItem
                        key={section.id}
                        section={section}
                        active={section.id === activeSection}
                        {...(section.id === 'sonarr'
                          ? { status: sonarrStatus }
                          : section.id === 'radarr'
                            ? { status: radarrStatus }
                            : {})}
                        onSelect={setActiveSection}
                      />
                    ))}
                </div>
              </div>
            ))}
          </nav>
          {showServiceTip ? (
            <div className="a2a-sidebar-card p-4 text-xs text-text-secondary">
              <p className="font-semibold text-text-primary">Tip</p>
              <p className="mt-1">Settings are global. Per-title behaviour stays in the media modal.</p>
            </div>
          ) : null}
          {activeSection === 'mappings' ? (
            <div className="a2a-sidebar-card p-4 text-xs text-text-secondary">
              <p className="font-semibold text-text-primary">Mappings notes</p>
              <p className="mt-1">
                <strong className="font-semibold text-text-primary">Not this match</strong> rejects one exact
                upstream or automatic ID for now. If a different ID resolves later, ani2arr can use that new result.
              </p>
              <p className="mt-2">
                <strong className="font-semibold text-text-primary">Never use this ID</strong> permanently blocks one
                exact ID for that AniList entry until you remove the block.
              </p>
              <p className="mt-2">
                <strong className="font-semibold text-text-primary">Ignore title entirely</strong> is the strongest
                option. It stops ani2arr from using upstream or automatic matches for that AniList title until you
                remove the ignore or save a manual mapping.
              </p>
              <p className="mt-2">
                Saving a mapping for a suppressed or ignored title clears the matching suppression and turns that title into a
                <strong className="font-semibold text-text-primary"> manual </strong>
                mapping.
              </p>
              <p className="mt-2">
                <strong className="font-semibold text-text-primary">Unresolved</strong> entries only appear after
                ani2arr has tried to resolve them in an active title flow such as the anime page, modal, or mapping
                tools. The general browse page is not used to build this list.
              </p>
            </div>
          ) : null}
          {showPrivacyCard ? (
            <button
              type="button"
              onClick={openPrivacyPanel}
              className="a2a-sidebar-card flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-accent-primary/50 hover:bg-bg-secondary/90"
            >
              <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-2xl bg-bg-tertiary/90 text-accent-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
          ) : null}
        </aside>
        <main className="flex-1 space-y-6 pb-12">
          {renderSection()}
        </main>
      </div>
    </div>
  );
};

const OptionsPage: React.FC = React.memo(() => {
  useA2aBroadcasts();
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
