/** Shared mapping left pane with search-first mapping controls and reusable diagnostics content. */
// src/features/mapping/mapping-inspection-pane.tsx

import { useCallback, useMemo, useRef, type WheelEvent as ReactWheelEvent } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { ArrowLeft } from 'lucide-react';
import Pill from '@/shared/ui/primitives/pill';
import Button from '@/shared/ui/primitives/button';
import { useMappingInspection } from '@/shared/queries';
import type {
  MappingInspectionCandidate,
  MappingInspectionPayload,
  MappingInspectionSuggestedCandidates,
} from '@/mapping/inspection/inspection-types';
import type { Provider } from '@/providers';
import { getProviderLabel } from '@/providers/provider-routing';
import { MappingSearchPanel } from './mapping-search-panel';
import type { MappingSearchController, MappingSearchResult } from './types';

interface MappingInspectionPaneProps {
  anilistId: number;
  provider: Provider;
  controller: MappingSearchController;
  currentMapping: MappingSearchResult | null;
  baseUrl: string;
  onExitMapping?: () => void;
  portalContainer?: HTMLElement | null;
}

interface MappingInspectionPaneContentProps {
  inspection: MappingInspectionPayload;
  provider: Provider;
  onUseSuggestion?: (candidate: MappingInspectionCandidate) => void;
}

type SuggestedCandidateGroup = {
  key: 'accepted' | 'rejected' | 'suppressed' | 'notAccepted';
  label: string | null;
  tone: 'success' | 'warning' | 'accent' | 'muted';
  getRowLabel?: (candidate: MappingInspectionCandidate) => string | null;
  items: readonly MappingInspectionCandidate[];
};

export const formatToken = (value: string): string => value.replaceAll('-', ' ').replaceAll('_', ' ');

const getProviderIdLabel = (provider: Provider): 'TMDB' | 'TVDB' => (provider === 'radarr' ? 'TMDB' : 'TVDB');

const getSuggestedCandidateGroups = (
  suggestedCandidates: MappingInspectionSuggestedCandidates,
): SuggestedCandidateGroup[] => {
  const groups: SuggestedCandidateGroup[] = [
    { key: 'accepted', label: 'Current match', tone: 'success', items: suggestedCandidates.accepted },
    { key: 'rejected', label: 'Rejected match', tone: 'warning', items: suggestedCandidates.rejected },
    { key: 'suppressed', label: 'Suppressed candidate', tone: 'accent', items: suggestedCandidates.suppressed },
    {
      key: 'notAccepted',
      label: null,
      tone: 'muted',
      getRowLabel: (candidate) => candidate.reason ? formatToken(candidate.reason) : null,
      items: suggestedCandidates.notAccepted,
    },
  ];

  return groups.filter(group => group.items.length > 0);
};

export function getSuggestedCandidatePrefill(
  candidate: MappingInspectionCandidate,
  suggestedCandidates: MappingInspectionSuggestedCandidates,
): string {
  const candidateTitle = candidate.title?.trim();
  if (candidateTitle) {
    return candidateTitle;
  }

  const tracedSearchTerm = suggestedCandidates.searchTerms?.find(term => term.trim().length > 0)?.trim();
  if (tracedSearchTerm) {
    return tracedSearchTerm;
  }

  return String(candidate.providerId);
}

export function applySuggestedCandidateSearchShortcut(
  controller: MappingSearchController,
  candidate: MappingInspectionCandidate,
  suggestedCandidates: MappingInspectionSuggestedCandidates,
): string {
  const nextQuery = getSuggestedCandidatePrefill(candidate, suggestedCandidates);
  controller.setQuery(nextQuery);
  return nextQuery;
}

export function isSearchModeQuery(query: string): boolean {
  return query.length > 0;
}

export function isSearchQueryTooShort(query: string): boolean {
  return isSearchModeQuery(query) && query.trim().length < 2;
}

export function handleSearchEscapeKeyDown(input: {
  query: string;
  setQuery: (query: string) => void;
  event: {
    key: string;
    stopPropagation(): void;
  };
}): boolean {
  if (input.event.key !== 'Escape' || !isSearchModeQuery(input.query)) {
    return false;
  }

  input.setQuery('');
  input.event.stopPropagation();
  return true;
}

function Section(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="space-y-2 border-t border-border-primary/60 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">{props.title}</h3>
      {props.children}
    </section>
  );
}

function CodeBlock(props: { lines: Array<string | null | undefined> }): React.JSX.Element {
  const content = props.lines.filter(Boolean).join('\n');

  return (
    <pre className="overflow-x-auto rounded-lg bg-bg-primary/25 px-3 py-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-text-secondary">
      {content}
    </pre>
  );
}

export function MappingInspectionSuggestedShortcuts(props: {
  inspection: MappingInspectionPayload;
  provider: Provider;
  onUseSuggestion: (candidate: MappingInspectionCandidate) => void;
}): React.JSX.Element {
  const { inspection, provider, onUseSuggestion } = props;
  const providerIdLabel = getProviderIdLabel(provider);
  const groups = useMemo(
    () => getSuggestedCandidateGroups(inspection.suggestedCandidates),
    [inspection.suggestedCandidates],
  );
  const suggestedRows = useMemo(
    () => groups.flatMap((group) => group.items.slice(0, group.key === 'accepted' ? 2 : 3).map((item) => ({ group, item }))).slice(0, 6),
    [groups],
  );

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="space-y-1">
          <h3 className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">Suggested matches</h3>
          <p className="text-xs text-text-secondary">
            {inspection.suggestedCandidates.searchTerms?.length
              ? `Search terms used: ${inspection.suggestedCandidates.searchTerms.join(', ')}`
              : 'Use a recent candidate below, or start typing to search manually.'}
          </p>
        </div>

        {suggestedRows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border-primary/50 bg-bg-secondary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="divide-y divide-border-primary/60">
              {suggestedRows.map(({ group, item }) => {
                const rowLabel = group.getRowLabel?.(item) ?? group.label;

                return (
                  <button
                    key={`${group.key}-${item.providerId}`}
                    type="button"
                    onClick={() => onUseSuggestion(item)}
                    className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-bg-primary/35"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="truncate text-sm font-semibold text-text-primary">
                        {item.title ?? `${providerIdLabel} ${item.providerId}`}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {rowLabel ? <Pill small tone={group.tone}>{rowLabel}</Pill> : null}
                        <Pill small tone="muted" className="font-mono text-text-primary">
                          {`${providerIdLabel} ${item.providerId}`}
                        </Pill>
                      </div>
                      <p className="text-xs text-text-secondary">{item.summary}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-bg-secondary/35 px-3 py-4 text-sm text-text-secondary">
            No recent candidate trace is available yet. Start typing to search manually.
          </div>
        )}
      </section>

      <div className="rounded-xl bg-bg-secondary/20 px-3 py-3 text-xs text-text-secondary">
        Search results on the left update the preview on the right without replacing the current mapping until you confirm.
      </div>
    </div>
  );
}

export function MappingInspectionPaneContent(props: MappingInspectionPaneContentProps): React.JSX.Element {
  const { inspection, provider, onUseSuggestion } = props;
  const providerIdLabel = getProviderIdLabel(provider);
  const hasReview = inspection.review.needsReview;
  const candidateGroups = useMemo(
    () => getSuggestedCandidateGroups(inspection.suggestedCandidates),
    [inspection.suggestedCandidates],
  );
  const hasSuggestedCandidates = candidateGroups.length > 0;
  const currentContextLines = [
    `aniListId: ${inspection.effectiveMapping.anilistId}`,
    `provider: ${provider}`,
    `status: ${formatToken(inspection.effectiveMapping.status)}`,
    inspection.effectiveMapping.providerId == null
      ? 'providerId: none'
      : `providerId: ${providerIdLabel} ${inspection.effectiveMapping.providerId}`,
    inspection.effectiveMapping.effectiveSource
      ? `source: ${formatToken(inspection.effectiveMapping.effectiveSource)}`
      : null,
    inspection.effectiveMapping.effectiveReason
      ? `reason: ${formatToken(inspection.effectiveMapping.effectiveReason)}`
      : null,
    inspection.effectiveMapping.resolverOutcome
      ? `resolverOutcome: ${formatToken(inspection.effectiveMapping.resolverOutcome)}`
      : null,
    inspection.effectiveMapping.suppressionKind
      ? `suppression: ${formatToken(inspection.effectiveMapping.suppressionKind)}`
      : null,
  ];

  return (
    <div className="space-y-4">
      <Section title="Current context">
        <CodeBlock lines={currentContextLines} />
      </Section>

      <Section title="Why this mapping exists">
        <div className="space-y-2">
          {inspection.whyThisExists.map((item, index) => (
            <CodeBlock
              key={`${item.kind}-${index}`}
              lines={[
                `kind: ${formatToken(item.kind)}`,
                item.source ? `source: ${formatToken(item.source)}` : null,
                item.reason ? `reason: ${formatToken(item.reason)}` : null,
                item.resolverOutcome ? `resolverOutcome: ${formatToken(item.resolverOutcome)}` : null,
                item.reviewReason ? `reviewReason: ${formatToken(item.reviewReason)}` : null,
                item.suppressedProviderId ? `suppressedProviderId: ${item.suppressedProviderId}` : null,
                item.immediateSourceAniListId ? `immediateSourceAniListId: ${item.immediateSourceAniListId}` : null,
                item.chainAnchorAniListId ? `chainAnchorAniListId: ${item.chainAnchorAniListId}` : null,
                `summary: ${item.summary}`,
                ...(item.details ?? []).map((detail) => `detail: ${detail}`),
              ]}
            />
          ))}
        </div>
      </Section>

      <Section title="Linked AniList entries">
        {inspection.linkedAniListEntries.length > 0 ? (
          <div className="space-y-2">
            {inspection.linkedAniListEntries.map((entry) => (
              <a
                key={entry.anilistId}
                href={`https://anilist.co/anime/${entry.anilistId}`}
                target="_blank"
                rel="noreferrer"
                className="block transition-opacity hover:opacity-100"
              >
                <CodeBlock
                  lines={[
                    `aniListId: ${entry.anilistId}`,
                    `title: ${entry.title ?? `AniList #${entry.anilistId}`}`,
                    `format: ${entry.format ? formatToken(entry.format) : 'Unknown format'}`,
                    entry.year ? `year: ${entry.year}` : null,
                    entry.relation ? `relation: ${entry.relation}` : null,
                  ]}
                />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No linked AniList entries are currently attached to this provider ID.</p>
        )}
      </Section>

      <Section title="Review state">
        {hasReview ? (
          <div className="space-y-2">
            <CodeBlock
              lines={[
                'needsReview: true',
                inspection.review.summary ? `count: ${inspection.review.summary.count}` : null,
                ...(inspection.review.summary?.reasons ?? []).map((reason) => `reason: ${formatToken(reason)}`),
              ]}
            />
            {inspection.review.items?.map((item, index) => (
                <CodeBlock
                  key={`${item.reason}-${index}`}
                  lines={[
                    `reason: ${formatToken(item.reason)}`,
                    `summary: ${item.summary}`,
                    item.current.providerId == null ? null : `currentProviderId: ${item.current.providerId}`,
                    item.proposed?.providerId == null ? null : `proposedProviderId: ${item.proposed.providerId}`,
                  ]}
                />
            ))}
          </div>
        ) : (
          <CodeBlock lines={['needsReview: false']} />
        )}
      </Section>

      <Section title="Suggested candidates">
        {inspection.suggestedCandidates.searchTerms?.length ? (
          <CodeBlock lines={[`searchTerms: ${inspection.suggestedCandidates.searchTerms.join(', ')}`]} />
        ) : null}
        {hasSuggestedCandidates ? (
          <div className="space-y-3">
            {candidateGroups.map((group) => (
              <div key={group.key} className="space-y-2">
                {group.label ? (
                  <div className="flex items-center gap-2">
                    <Pill small tone={group.tone}>{group.label}</Pill>
                    <span className="text-xs text-text-secondary">{`${group.items.length} candidate${group.items.length === 1 ? '' : 's'}`}</span>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {group.items.map((candidate) => {
                    const candidateLines = [
                      `title: ${candidate.title ?? `${providerIdLabel} ${candidate.providerId}`}`,
                      `providerId: ${providerIdLabel} ${candidate.providerId}`,
                      `status: ${formatToken(candidate.status)}`,
                      `source: ${formatToken(candidate.source)}`,
                      `reason: ${formatToken(candidate.reason)}`,
                      `summary: ${candidate.summary}`,
                    ];

                    const candidateContent = (
                      <CodeBlock lines={candidateLines} />
                    );

                    if (onUseSuggestion) {
                      return (
                        <button
                          key={`${group.key}-${candidate.providerId}`}
                          type="button"
                          onClick={() => onUseSuggestion(candidate)}
                          className="w-full text-left transition-opacity hover:opacity-100"
                        >
                          {candidateContent}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={`${group.key}-${candidate.providerId}`}
                        className="w-full"
                      >
                        {candidateContent}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No recent candidate trace is available yet. Use manual search if you need to change this mapping.</p>
        )}
      </Section>
    </div>
  );
}

export function MappingInspectionPane(props: MappingInspectionPaneProps): React.JSX.Element {
  const { anilistId, provider, controller, currentMapping, baseUrl, onExitMapping, portalContainer } = props;
  const inspectionQuery = useMappingInspection(provider, anilistId);
  const providerLabel = getProviderLabel(provider);
  const providerIdLabel = getProviderIdLabel(provider);
  const searchMode = isSearchModeQuery(controller.state.query);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const handleWheelCapture = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const canScrollY = viewport.scrollHeight > viewport.clientHeight;
    const canScrollX = viewport.scrollWidth > viewport.clientWidth;

    if (!canScrollY && !canScrollX) {
      return;
    }

    viewport.scrollBy({ top: event.deltaY, left: event.deltaX });
    event.preventDefault();
  }, []);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden px-4 pt-4"
      onKeyDownCapture={(event) => {
        handleSearchEscapeKeyDown({
          query: controller.state.query,
          setQuery: controller.setQuery,
          event,
        });
      }}
    >
      <div className="shrink-0 pb-4">
        {onExitMapping ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExitMapping}
            className="-ml-2 mb-3 h-auto px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to setup
          </Button>
        ) : null}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">Mapping search</p>
          <p className="text-xs text-text-secondary">
            {searchMode
              ? `Searching ${providerLabel} updates the preview on the right.`
              : `Pick a recent ${providerIdLabel} match below, or start typing to search manually.`}
          </p>
        </div>
        <div className="mt-3">
          <input
            value={controller.state.query}
            onChange={(event) => controller.setQuery(event.target.value)}
            placeholder={`Search ${providerLabel} / ${providerIdLabel}...`}
            className="w-full rounded-xl border border-border-primary/60 bg-bg-tertiary/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea.Root className="h-full w-full" onWheelCapture={handleWheelCapture}>
          <ScrollArea.Viewport
            ref={viewportRef}
            className="h-full w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="pb-4 pr-1">
              {searchMode ? (
                <MappingSearchPanel
                  controller={controller}
                  currentMapping={currentMapping}
                  provider={provider}
                  baseUrl={baseUrl}
                  portalContainer={portalContainer ?? null}
                />
              ) : (
                <div className="space-y-4">
                  {inspectionQuery.isPending && !inspectionQuery.data ? (
                    <div className="rounded-xl bg-bg-secondary/45 px-3 py-8 text-center text-sm text-text-secondary">
                      Loading suggested matches...
                    </div>
                  ) : null}

                  {inspectionQuery.error && !inspectionQuery.data ? (
                    <div className="rounded-xl bg-warning/8 px-3 py-4 text-sm text-text-secondary">
                      Mapping diagnostics are unavailable right now. Search is still available above.
                    </div>
                  ) : null}

                  {inspectionQuery.data ? (
                    <MappingInspectionSuggestedShortcuts
                      inspection={inspectionQuery.data}
                      provider={provider}
                      onUseSuggestion={(candidate) => {
                        applySuggestedCandidateSearchShortcut(controller, candidate, inspectionQuery.data.suggestedCandidates);
                      }}
                    />
                  ) : null}
                </div>
              )}
            </div>
          </ScrollArea.Viewport>

          <ScrollArea.Scrollbar
            orientation="vertical"
            className="flex w-2.5 select-none touch-none p-0.5"
          >
            <ScrollArea.Thumb className="flex-1 rounded bg-border-primary/40" />
          </ScrollArea.Scrollbar>

          <ScrollArea.Corner />
        </ScrollArea.Root>
      </div>
    </div>
  );
}
