/** Mapping preview panel for current and pending manual mapping selections. */
// src/features/mapping/mapping-preview-panel.tsx

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, ExternalLink, X, Settings } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { buildExternalMediaLink } from '@/shared/utils/provider-links';
import type { Provider } from '@/providers';
import { getProviderLabel } from '@/providers/provider-routing';
import { useMappingInspection } from '@/shared/queries';
import { MappingInspectionPaneContent } from './mapping-inspection-pane';
import { MappingLinkedEntries } from './mapping-linked-entries';
import type { MappingAniListSummary, MappingSearchResult } from './types';

interface MappingPreviewPanelProps {
  provider: Provider;
  aniListEntry: MappingAniListSummary;
  baseUrl: string;
  currentMapping: MappingSearchResult | null;
  previewMapping: MappingSearchResult | null;
  isInMappingMode: boolean;
  showResetPreview: boolean;
  onResetPreview: () => void;
  onEditMapping: () => void;
  portalContainer?: HTMLElement | null;
}

export function MappingPreviewPanel(props: MappingPreviewPanelProps): React.JSX.Element {
  const {
    provider,
    aniListEntry,
    baseUrl,
    currentMapping,
    previewMapping,
    showResetPreview,
    onResetPreview,
    onEditMapping,
    isInMappingMode,
    portalContainer,
  } = props;

  const inspectionQuery = useMappingInspection(provider, aniListEntry.id);
  const hasCurrentMapping = Boolean(currentMapping);
  const hasPreviewMapping = Boolean(previewMapping);
  const isSetupMode = isInMappingMode === false;
  const activeMapping = previewMapping ?? currentMapping;
  const showEmptyState = !activeMapping;
  const providerIdLabel = provider === 'radarr' ? 'TMDB' : 'TVDB';
  const headingLabel = hasPreviewMapping ? 'PREVIEWING TARGET' : `${providerIdLabel} TARGET`;

  const openMappingSettings = () => {
    try {
      void browser.runtime.sendMessage({
        _a2a: true,
        type: 'OPEN_OPTIONS_PAGE',
        sectionId: 'mappings',
        targetAnilistId: aniListEntry.id,
        timestamp: Date.now(),
      });
    } catch {
      // best-effort only
    }
  };

  const linkedAniListIds = hasPreviewMapping
    ? (previewMapping?.linkedAniListIds ?? [])
    : (inspectionQuery.data?.providerContext.linkedAniListIds ?? currentMapping?.linkedAniListIds ?? []);
  const linkedAniListEntries = hasPreviewMapping ? undefined : inspectionQuery.data?.linkedAniListEntries;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-bg-secondary/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="shrink-0 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
              {headingLabel}
            </p>
            {hasPreviewMapping && currentMapping ? (
              <p className="text-xs leading-5 text-text-secondary">
                Overwriting <span className="font-medium text-text-primary">{currentMapping.title}</span>
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMappingSettings();
            }}
            variant="ghost"
            size="icon"
            tooltip="Open Mapping & Overrides settings in the options page"
            portalContainer={portalContainer ?? undefined}
            className="h-8 w-8 text-text-secondary hover:text-text-primary"
            aria-label="Open Mapping & Overrides settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">

        {activeMapping ? (
          <MappingPreviewCard
            mapping={activeMapping}
            baseUrl={baseUrl}
            showResetPreview={showResetPreview}
            onResetPreview={onResetPreview}
            portalContainer={portalContainer ?? null}
            {...(hasPreviewMapping ? { highlight: 'preview' as const } : {})}
          />
        ) : null}

        {isSetupMode ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEditMapping}>
              {hasCurrentMapping ? 'Edit match' : 'Add match'}
            </Button>
          </div>
        ) : null}

        {activeMapping ? (
          <MappingLinkedEntries
            currentAniListId={aniListEntry.id}
            linkedAniListIds={linkedAniListIds}
            {...(linkedAniListEntries ? { entries: linkedAniListEntries } : {})}
          />
        ) : null}

        {showEmptyState ? (
          <div className="flex min-h-65 items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 px-3 text-center text-sm text-text-secondary">
            No mapping yet. Use mapping mode to search for the correct provider entry.
          </div>
        ) : null}

        {isInMappingMode ? (
          <Accordion.Root type="single" collapsible>
            <Accordion.Item value="diagnostics" className="overflow-hidden rounded-xl border border-border-primary/50 bg-bg-primary/18">
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-text-primary">
                  <span>View Match Diagnostics & Logs</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="border-t border-border-primary/50 px-3 py-3">
                  <div className="max-h-48 overflow-y-auto pr-1">
                    {inspectionQuery.isPending && !inspectionQuery.data ? (
                      <div className="rounded-xl bg-bg-secondary/35 px-3 py-6 text-sm text-text-secondary">
                      Loading mapping diagnostics...
                      </div>
                    ) : null}

                    {inspectionQuery.error && !inspectionQuery.data ? (
                      <div className="rounded-xl bg-warning/8 px-3 py-4 text-sm text-text-secondary">
                      Mapping diagnostics are unavailable right now.
                      </div>
                    ) : null}

                    {inspectionQuery.data ? (
                      <MappingInspectionPaneContent inspection={inspectionQuery.data} provider={provider} />
                    ) : null}
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        ) : null}
      </div>
    </div>
  );
}

interface MappingPreviewCardProps {
  mapping: MappingSearchResult;
  baseUrl: string;
  highlight?: 'preview';
  showResetPreview?: boolean;
  onResetPreview?: () => void;
  portalContainer?: HTMLElement | null;
}

const getStatusTone = (
  status: string,
): 'muted' | 'success' | 'warning' | 'info' | 'accent' | 'blue' | 'default' => {
  const normalized = status.toLowerCase();
  if (normalized === 'continuing') return 'accent';
  if (normalized === 'upcoming') return 'info';
  if (normalized === 'ended') return 'muted';
  if (normalized === 'deleted') return 'warning';
  return 'default';
};

function MappingPreviewCard(props: MappingPreviewCardProps): React.JSX.Element {
  const { mapping, baseUrl, highlight, showResetPreview, onResetPreview, portalContainer } = props;
  const providerLabel = getProviderLabel(mapping.provider);
  const externalLabel = `${mapping.provider === 'radarr' ? 'TMDB' : 'TVDB'} ${mapping.providerId}`;

  const link = buildExternalMediaLink({
    provider: mapping.provider,
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });

  const metadataPills: React.ReactNode[] = [];

  const tvdbPill = (
    <Pill key="external-id" small tone="muted" className="font-mono text-text-primary">
      {externalLabel}
    </Pill>
  );

  metadataPills.push(tvdbPill);

  if (typeof mapping.year === 'number' && Number.isFinite(mapping.year) && mapping.year > 0) {
    metadataPills.push(
      <Pill key="year" small tone="muted">
        {mapping.year}
      </Pill>,
    );
  }

  if (mapping.typeLabel) {
    metadataPills.push(
      <Pill key="type" small tone="muted" className="text-text-secondary">
        {mapping.typeLabel}
      </Pill>,
    );
  }

  if (mapping.statusLabel) {
    metadataPills.push(
      <Pill key="status" small tone={getStatusTone(mapping.statusLabel)}>
        {mapping.statusLabel}
      </Pill>,
    );
  }

  if (mapping.inLibrary) {
    metadataPills.push(
      <Pill key="library" small tone="success" className="border-transparent bg-success/85 text-white">{`In ${providerLabel}${
        mapping.fileCount ? ` - ${mapping.fileCount} eps` : ''
      }`}</Pill>,
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border-primary/70 bg-bg-primary/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${
        highlight === 'preview' ? 'ring-1 ring-inset ring-accent-primary/40' : ''
      }`}
    >
      <div className="flex gap-5 p-4">
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded-lg bg-bg-primary shadow-inner">
          {mapping.posterUrl ? (
            <img
              src={mapping.posterUrl}
              alt={mapping.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-bg-primary" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3
              className="text-xl font-semibold leading-tight text-text-primary line-clamp-2"
              title={mapping.title}
            >
              {mapping.title}
            </h3>

            <div className="flex shrink-0 items-center gap-1">
              {link ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  tooltip={`Open in ${providerLabel}`}
                  portalContainer={portalContainer ?? undefined}
                  className="h-8 w-8 text-text-secondary hover:text-text-primary"
                >
                  <a href={link} target="_blank" rel="noreferrer" aria-label={`Open in ${providerLabel}`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}

              {highlight === 'preview' && showResetPreview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  tooltip="Clear selection"
                  portalContainer={portalContainer ?? undefined}
                  className="h-8 w-8 text-text-secondary hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetPreview?.();
                  }}
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {metadataPills.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {metadataPills}
            </div>
          ) : null}

          <div className="mt-3 text-xs leading-relaxed text-text-secondary/80 line-clamp-4">
            {mapping.overview ?? 'No overview available.'}
          </div>
        </div>
      </div>
    </div>
  );
}
