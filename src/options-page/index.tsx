/** Options page shell, routing, and page-specific state. */
// src/options-page/index.tsx

import React, { memo, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { browser } from 'wxt/browser';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import appIcon from '@/assets/icon.png';
import type { AniListId } from '@/anilist';
import { useA2aBroadcasts } from '@/shared/queries/use-a2a-broadcasts';
import {
  createDefaultExtensionOptions,
  getProviderCredentials,
  parseExtensionOptions,
  type ExtensionOptions,
  useExtensionOptions,
} from '@/options';
import {
  useProviderConnectionStatus,
  type ProviderConnectionStatusView,
} from '@/queries/provider-connection';
import { useSettingsActions } from './hooks/use-settings-actions';
import { shouldResetSettingsFormFromSavedSnapshot } from './hooks/provider-settings-actions.shared';
import MappingsSection from './sections/mappings/mappings-section';
import UiSection from './sections/ui-section';
import AdvancedSection from './sections/advanced-section';
import SonarrPage from './provider-settings/sonarr-page';
import RadarrPage from './provider-settings/radarr-page';
import {
  extractAdvancedPanelFromHash,
  extractTargetAnilistIdFromHash,
  getInitialSection,
  navGroups,
  resolveSectionFromHash,
  sections,
  syncOptionsLocation,
  type AdvancedPanelId,
  type SectionConfig,
  type SectionId,
} from './navigation';
import './style.css';

const extensionVersion = browser.runtime.getManifest()?.version ?? 'unknown';
const NavItem: React.FC<{
  section: SectionConfig;
  active: boolean;
  status?: ProviderConnectionStatusView;
  onSelect: (id: SectionId) => void;
}> = ({ section, active, status, onSelect }) => {
  const Icon = section.icon;

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
        {status ? (
          <span
            className={cn(
              'a2a-provider-status a2a-provider-status-dot a2a-nav-item__status-dot',
              status.variantClassName,
            )}
            aria-hidden
          />
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
  targetAnilistId: AniListId | null;
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
  const sonarrStatus = useProviderConnectionStatus(
    'sonarr',
    getProviderCredentials(optionsQuery.data, 'sonarr'),
  );
  const radarrStatus = useProviderConnectionStatus(
    'radarr',
    getProviderCredentials(optionsQuery.data, 'radarr'),
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'sonarr': {
        return (
          <SonarrPage
            actions={actions}
            {...(optionsQuery.data ? { savedSettings: optionsQuery.data } : {})}
            isLoading={optionsQuery.isLoading}
          />
        );
      }
      case 'radarr': {
        return (
          <RadarrPage
            actions={actions}
            {...(optionsQuery.data ? { savedSettings: optionsQuery.data } : {})}
            isLoading={optionsQuery.isLoading}
          />
        );
      }
      case 'mappings': {
        return (
          <MappingsSection
            {...(targetAnilistId === null ? {} : { targetAnilistId })}
            onClearTargetAnilistId={clearTargetAnilistId}
          />
        );
      }
      case 'ui': {
        return <UiSection />;
      }
      case 'advanced': {
        return <AdvancedSection actions={actions} focusPanel={advancedPanel} />;
      }
    }
  };

  const getSectionStatusProps = (sectionId: SectionId): { status?: ProviderConnectionStatusView } => {
    if (sectionId === 'sonarr') return { status: sonarrStatus };
    if (sectionId === 'radarr') return { status: radarrStatus };
    return {};
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
            {navGroups.map(group => (
              <div key={group.group}>
                <div className="a2a-nav-group-label">{group.title}</div>
                <div className="mt-2 space-y-2">
                  {sections
                    .filter(section => section.group === group.group)
                    .map(section => (
                      <NavItem
                        key={section.id}
                        section={section}
                        active={section.id === activeSection}
                        {...getSectionStatusProps(section.id)}
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
                Saving a mapping for a suppressed or ignored title clears the matching suppression and turns that
                title into a <strong className="font-semibold text-text-primary">manual</strong> mapping.
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
        <main className="flex-1 space-y-6 pb-12">{renderSection()}</main>
      </div>
    </div>
  );
};

export const OptionsPage: React.FC = memo(() => {
  useA2aBroadcasts();
  const [activeSection, setActiveSection] = useState<SectionId>(getInitialSection);
  const [targetAnilistId, setTargetAnilistId] = useState<AniListId | null>(() => {
    if (globalThis.window === undefined) return null;
    return extractTargetAnilistIdFromHash(globalThis.window.location.hash);
  });
  const [advancedPanel, setAdvancedPanel] = useState<AdvancedPanelId>(() => {
    if (globalThis.window === undefined) return null;
    return extractAdvancedPanelFromHash(globalThis.window.location.hash);
  });
  const optionsQuery = useExtensionOptions();
  const methods = useForm<ExtensionOptions>({
    defaultValues: optionsQuery.data ?? createDefaultExtensionOptions(),
    mode: 'onChange',
  });
  const previousSavedSettingsRef = useRef<ExtensionOptions | undefined>(undefined);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = globalThis.window.location.hash;
      const nextSection = resolveSectionFromHash(hash);
      const nextTargetAnilistId = extractTargetAnilistIdFromHash(hash);
      const nextAdvancedPanel = extractAdvancedPanelFromHash(hash);

      setActiveSection(nextSection);
      setTargetAnilistId(nextTargetAnilistId);
      setAdvancedPanel(nextAdvancedPanel);
      syncOptionsLocation(nextSection, nextTargetAnilistId, nextAdvancedPanel);
    };

    handleHashChange();
    globalThis.window.addEventListener('hashchange', handleHashChange);
    return () => globalThis.window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectSection = (id: SectionId) => {
    const nextTargetAnilistId = id === 'mappings' ? targetAnilistId : null;
    const nextAdvancedPanel = id === 'advanced' ? advancedPanel : null;
    setActiveSection(id);
    setAdvancedPanel(nextAdvancedPanel);
    syncOptionsLocation(id, nextTargetAnilistId, nextAdvancedPanel);
  };

  const handleOpenPrivacyPanel = () => {
    setActiveSection('advanced');
    setAdvancedPanel('privacy');
    syncOptionsLocation('advanced', null, 'privacy');
  };

  const handleClearTargetAnilistId = () => {
    setTargetAnilistId(null);
    syncOptionsLocation(activeSection, null, advancedPanel);
  };

  useEffect(() => {
    if (!optionsQuery.data) {
      return;
    }

    const nextSettings = optionsQuery.data;
    const previousSavedSettings = previousSavedSettingsRef.current;
    previousSavedSettingsRef.current = nextSettings;

    if (
      !shouldResetSettingsFormFromSavedSnapshot(
        parseExtensionOptions(methods.getValues()),
        previousSavedSettings,
      )
    ) {
      return;
    }

    methods.reset(nextSettings);
  }, [methods, optionsQuery.data]);

  return (
    <FormProvider {...methods}>
      <OptionsContent
        activeSection={activeSection}
        setActiveSection={handleSelectSection}
        optionsQuery={optionsQuery}
        targetAnilistId={targetAnilistId}
        clearTargetAnilistId={handleClearTargetAnilistId}
        advancedPanel={advancedPanel}
        openPrivacyPanel={handleOpenPrivacyPanel}
      />
    </FormProvider>
  );
});

OptionsPage.displayName = 'OptionsPage';
