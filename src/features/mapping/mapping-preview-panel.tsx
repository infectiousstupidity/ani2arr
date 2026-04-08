/** Mapping preview panel for current and pending manual mapping selections. */
// src/features/mapping/mapping-preview-panel.tsx

import * as Accordion from '@radix-ui/react-accordion';
import { ArrowDown, ChevronDown, ExternalLink, X } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { buildExternalMediaLink } from '@/shared/utils/provider-links';
import type { Provider } from '@/providers';
import { getProviderLabel } from '@/providers/provider-routing';
import { useMappingInspection } from '@/shared/queries';
import type { MappingInspectionPayload } from '@/mapping/inspection/inspection-types';
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

type MappingPreviewPanelViewState = {
  headingLabel: string;
  linkedAniListIds: readonly number[];
  linkedAniListEntries: MappingInspectionPayload['linkedAniListEntries'] | undefined;
  showPreviewCard: boolean;
  showSetupContext: boolean;
  showMappingPrompt: boolean;
};

type MappingDetailRow = {
  label: string;
  value: string;
};

function formatDetailValue(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const getMappingPreviewPanelViewState = (input: {
  inspectionData: MappingInspectionPayload | undefined;
  providerLabel: string;
  currentMapping: MappingSearchResult | null;
  previewMapping: MappingSearchResult | null;
  isInMappingMode: boolean;
}): MappingPreviewPanelViewState => {
  const { inspectionData, providerLabel, currentMapping, previewMapping, isInMappingMode } = input;
  const isSetupMode = isInMappingMode === false;
  const showPreviewCard = Boolean(!isSetupMode && previewMapping);
  const showSetupContext = isSetupMode;
  const showMappingPrompt = Boolean(!isSetupMode && !previewMapping);

  let headingLabel = `PREVIEWING ${providerLabel.toUpperCase()} MATCH`;
  if (isSetupMode) {
    headingLabel = 'CURRENT TARGET DETAILS';
  }

  return {
    headingLabel,
    linkedAniListIds: showSetupContext
      ? (inspectionData?.providerContext.linkedAniListIds ?? currentMapping?.linkedAniListIds ?? [])
      : (previewMapping?.linkedAniListIds ?? []),
    linkedAniListEntries: showSetupContext ? inspectionData?.linkedAniListEntries : undefined,
    showPreviewCard,
    showSetupContext,
    showMappingPrompt,
  };
};

function MappingPreviewPanelHeader(props: {
  headingLabel: string;
}): React.JSX.Element {
  return (
    <div className="shrink-0 pb-4">
      <p className="text-[11px] font-semibold leading-none tracking-[0.16em] text-text-secondary uppercase">
        {props.headingLabel}
      </p>
    </div>
  );
}

function MappingPreviewDiagnostics(props: {
  inspectionData: MappingInspectionPayload | undefined;
  inspectionPending: boolean;
  inspectionError: boolean;
  provider: Provider;
}): React.JSX.Element {
  const { inspectionData, inspectionPending, inspectionError, provider } = props;

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="diagnostics" className="overflow-hidden rounded-xl border border-border-primary/50 bg-bg-primary/18">
        <Accordion.Header>
          <Accordion.Trigger className="group flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-text-primary">
            <span>View Advanced Diagnostics</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="border-t border-border-primary/50 px-3 py-3">
            <div className="max-h-48 overflow-y-auto pr-1">
              {inspectionPending && !inspectionData ? (
                <div className="rounded-xl bg-bg-secondary/35 px-3 py-6 text-sm text-text-secondary">
                  Loading mapping diagnostics...
                </div>
              ) : null}

              {inspectionError && !inspectionData ? (
                <div className="rounded-xl bg-warning/8 px-3 py-4 text-sm text-text-secondary">
                  Mapping diagnostics are unavailable right now.
                </div>
              ) : null}

              {inspectionData ? (
                <MappingInspectionPaneContent inspection={inspectionData} provider={provider} />
              ) : null}
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function MappingPreviewPanelBody(props: {
  viewState: MappingPreviewPanelViewState;
  providerLabel: string;
  aniListEntryId: number;
  baseUrl: string;
  currentMapping: MappingSearchResult | null;
  previewMapping: MappingSearchResult | null;
  showResetPreview: boolean;
  onResetPreview: () => void;
  onEditMapping: () => void;
  portalContainer: HTMLElement | null | undefined;
  inspectionData: MappingInspectionPayload | undefined;
  inspectionPending: boolean;
  inspectionError: boolean;
  provider: Provider;
}): React.JSX.Element {
  const {
    viewState,
    providerLabel,
    aniListEntryId,
    baseUrl,
    currentMapping,
    previewMapping,
    showResetPreview,
    onResetPreview,
    onEditMapping,
    portalContainer,
    inspectionData,
    inspectionPending,
    inspectionError,
    provider,
  } = props;

  const detailRows: MappingDetailRow[] = [];

  if (currentMapping) {
    detailRows.push({
      label: 'In library',
      value: currentMapping.inLibrary ? 'Yes' : 'No',
    });

    if (currentMapping.fileCount !== undefined) {
      detailRows.push({
        label: 'Episodes',
        value: String(currentMapping.fileCount),
      });
    }

    if (currentMapping.typeLabel) {
      detailRows.push({
        label: 'Type',
        value: formatDetailValue(currentMapping.typeLabel),
      });
    }

    if (currentMapping.statusLabel) {
      detailRows.push({
        label: 'Status',
        value: formatDetailValue(currentMapping.statusLabel),
      });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pr-1">
      {viewState.showSetupContext && currentMapping ? (
        <div className="rounded-xl border border-border-primary/50 bg-bg-primary/14 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              {detailRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-text-secondary">{row.label}</span>
                  <span className="text-right font-medium text-text-primary">{row.value}</span>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditMapping}
              className="shrink-0 text-text-secondary hover:text-text-primary"
            >
              {`Change ${providerLabel} match`}
            </Button>
          </div>
        </div>
      ) : null}

      {viewState.showPreviewCard ? (
        <div className="rounded-xl border border-border-primary/50 bg-bg-primary/14 p-3">
          <div className="flex items-center gap-2 text-accent-primary">
            <ArrowDown className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium text-text-primary">Confirm selection to replace the current {providerLabel} target above.</p>
          </div>
        </div>
      ) : null}

      {viewState.showPreviewCard && previewMapping ? (
        <MappingPreviewCard
          mapping={previewMapping}
          baseUrl={baseUrl}
          showResetPreview={showResetPreview}
          onResetPreview={onResetPreview}
          portalContainer={portalContainer ?? null}
          highlight="preview"
        />
      ) : null}

      {viewState.linkedAniListIds.length > 0 ? (
        <MappingLinkedEntries
          className="flex min-h-0 flex-1 flex-col space-y-2"
          currentAniListId={aniListEntryId}
          linkedAniListIds={viewState.linkedAniListIds}
          {...(viewState.linkedAniListEntries ? { entries: viewState.linkedAniListEntries } : {})}
        />
      ) : null}

      {viewState.showMappingPrompt ? (
        <div className="flex min-h-65 flex-1 items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 px-3 text-center text-sm text-text-secondary">
          Select a search result to preview how it would replace the current {providerLabel} target shown above.
        </div>
      ) : null}

      <div className="mt-auto shrink-0">
        <MappingPreviewDiagnostics
          inspectionData={inspectionData}
          inspectionPending={inspectionPending}
          inspectionError={inspectionError}
          provider={provider}
        />
      </div>
    </div>
  );
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
  const providerLabel = getProviderLabel(provider);
  const viewState = getMappingPreviewPanelViewState({
    inspectionData: inspectionQuery.data,
    providerLabel,
    currentMapping,
    previewMapping,
    isInMappingMode,
  });

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-bg-secondary/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <MappingPreviewPanelHeader headingLabel={viewState.headingLabel} />

      <MappingPreviewPanelBody
        viewState={viewState}
        providerLabel={providerLabel}
        aniListEntryId={aniListEntry.id}
        baseUrl={baseUrl}
        currentMapping={currentMapping}
        previewMapping={previewMapping}
        showResetPreview={showResetPreview}
        onResetPreview={onResetPreview}
        onEditMapping={onEditMapping}
        portalContainer={portalContainer}
        inspectionData={inspectionQuery.data}
        inspectionPending={inspectionQuery.isPending}
        inspectionError={Boolean(inspectionQuery.error)}
        provider={provider}
      />
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
