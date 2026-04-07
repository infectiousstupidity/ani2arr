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
  label: string;
  tone: 'success' | 'warning' | 'accent' | 'muted';
  items: readonly MappingInspectionCandidate[];
};

export const formatToken = (value: string): string => value.replaceAll('-', ' ').replaceAll('_', ' ');

const getProviderIdLabel = (provider: Provider): 'TMDB' | 'TVDB' => (provider === 'radarr' ? 'TMDB' : 'TVDB');

const getStatusTone = (
  status: MappingInspectionPayload['effectiveMapping']['status'],
): 'success' | 'warning' | 'info' | 'muted' => {
  switch (status) {
    case 'in-library': {
      return 'success';
    }
    case 'needs-review':
    case 'suppressed': {
      return 'warning';
    }
    case 'can-add': {
      return 'info';
    }
    default: {
      return 'muted';
    }
  }
};

const getSuggestedCandidateGroups = (
  suggestedCandidates: MappingInspectionSuggestedCandidates,
): SuggestedCandidateGroup[] => {
  const groups: SuggestedCandidateGroup[] = [
    { key: 'accepted', label: 'Accepted trace', tone: 'success', items: suggestedCandidates.accepted },
    { key: 'rejected', label: 'Rejected trace', tone: 'warning', items: suggestedCandidates.rejected },
    { key: 'suppressed', label: 'Suppressed trace', tone: 'accent', items: suggestedCandidates.suppressed },
    { key: 'notAccepted', label: 'Other candidates', tone: 'muted', items: suggestedCandidates.notAccepted },
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
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{props.title}</h3>
      {props.children}
    </section>
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
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">Suggested matches</h3>
          <p className="text-xs text-text-secondary">
            {inspection.suggestedCandidates.searchTerms?.length
              ? `Trace terms: ${inspection.suggestedCandidates.searchTerms.join(', ')}`
              : 'Use a recent candidate below, or start typing to search manually.'}
          </p>
        </div>

        {suggestedRows.length > 0 ? (
          <div className="overflow-hidden rounded-xl bg-bg-secondary/45 shadow-inner ring-1 ring-inset ring-border-primary/50">
            <div className="divide-y divide-border-primary/60">
              {suggestedRows.map(({ group, item }) => (
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
                      <Pill small tone={group.tone}>{group.label}</Pill>
                      <Pill small tone="muted" className="font-mono text-text-primary">
                        {`${providerIdLabel} ${item.providerId}`}
                      </Pill>
                    </div>
                    <p className="text-xs text-text-secondary">{item.summary}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-bg-secondary/35 px-3 py-4 text-sm text-text-secondary">
            No recent candidate trace is available yet. Start typing to search manually.
          </div>
        )}
      </section>

      <div className="rounded-xl bg-bg-secondary/30 px-3 py-3 text-xs text-text-secondary">
        Search results on the left update the preview on the right without replacing the current mapping until you confirm.
      </div>
    </div>
  );
}

export function MappingInspectionPaneContent(props: MappingInspectionPaneContentProps): React.JSX.Element {
  const { inspection, provider, onUseSuggestion } = props;
  const providerIdLabel = getProviderIdLabel(provider);
  const hasEffectiveMapping = inspection.effectiveMapping.providerId != null;
  const hasReview = inspection.review.needsReview;
  const candidateGroups = useMemo(
    () => getSuggestedCandidateGroups(inspection.suggestedCandidates),
    [inspection.suggestedCandidates],
  );
  const hasSuggestedCandidates = candidateGroups.length > 0;

  return (
    <div className="space-y-4">
      <Section title="Current context">
        <div className="flex flex-wrap items-center gap-2">
          <Pill small tone={getStatusTone(inspection.effectiveMapping.status)}>
            {formatToken(inspection.effectiveMapping.status)}
          </Pill>
          {hasEffectiveMapping ? (
            <Pill small tone="muted" className="font-mono text-text-primary">
              {`${providerIdLabel} ${inspection.effectiveMapping.providerId}`}
            </Pill>
          ) : null}
          {inspection.effectiveMapping.effectiveSource ? (
            <Pill small tone="info">{formatToken(inspection.effectiveMapping.effectiveSource)}</Pill>
          ) : null}
        </div>
        <p className="text-sm text-text-secondary">
          {hasEffectiveMapping
            ? 'Inspection reflects the currently effective mapping context.'
            : 'No effective mapping is currently stored for this AniList entry.'}
        </p>
      </Section>

      <Section title="Why this mapping exists">
        <div className="space-y-2">
          {inspection.whyThisExists.map((item, index) => (
            <div key={`${item.kind}-${index}`} className="rounded-lg bg-bg-secondary/45 px-3 py-2.5">
              <p className="text-sm font-medium text-text-primary">{item.summary}</p>
              {item.details?.length ? (
                <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                  {item.details.map((detail, detailIndex) => (
                    <li key={`${detail}-${detailIndex}`}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
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
                className="flex items-center justify-between rounded-lg bg-bg-secondary/45 px-3 py-2 text-sm transition-colors hover:bg-bg-secondary/65"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-primary">
                    {entry.title ?? `AniList #${entry.anilistId}`}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {entry.format ? formatToken(entry.format) : 'Unknown format'}
                    {entry.year ? ` · ${entry.year}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.relation === 'current' ? <Pill small tone="accent">Current</Pill> : null}
                  <Pill small tone="muted" className="font-mono text-text-primary">{`AniList ${entry.anilistId}`}</Pill>
                </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <Pill small tone="warning">Needs review</Pill>
              {inspection.review.summary ? (
                <Pill small tone="muted">{`${inspection.review.summary.count} item${inspection.review.summary.count === 1 ? '' : 's'}`}</Pill>
              ) : null}
            </div>
            {inspection.review.items?.map((item, index) => (
                <div key={`${item.reason}-${index}`} className="rounded-lg bg-bg-secondary/45 px-3 py-2.5">
                  <p className="text-sm font-medium text-text-primary">{item.summary}</p>
                </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No review flags are currently attached to this mapping.</p>
        )}
      </Section>

      <Section title="Suggested candidates">
        {inspection.suggestedCandidates.searchTerms?.length ? (
          <p className="text-xs text-text-secondary">
            {`Last trace searched: ${inspection.suggestedCandidates.searchTerms.join(', ')}`}
          </p>
        ) : null}
        {hasSuggestedCandidates ? (
          <div className="space-y-3">
            {candidateGroups.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Pill small tone={group.tone}>{group.label}</Pill>
                  <span className="text-xs text-text-secondary">{`${group.items.length} candidate${group.items.length === 1 ? '' : 's'}`}</span>
                </div>
                <div className="space-y-2">
                  {group.items.map((candidate) => {
                    const candidateContent = (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-text-primary">
                            {candidate.title ?? `${providerIdLabel} ${candidate.providerId}`}
                          </div>
                          <Pill small tone="muted" className="font-mono text-text-primary">
                            {`${providerIdLabel} ${candidate.providerId}`}
                          </Pill>
                          <Pill small tone="info">{formatToken(candidate.status)}</Pill>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">{candidate.summary}</p>
                      </>
                    );

                    if (onUseSuggestion) {
                      return (
                        <button
                          key={`${group.key}-${candidate.providerId}`}
                          type="button"
                          onClick={() => onUseSuggestion(candidate)}
                          className="w-full rounded-lg bg-bg-secondary/45 px-3 py-3 text-left transition-colors hover:bg-bg-secondary/65"
                        >
                          {candidateContent}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={`${group.key}-${candidate.providerId}`}
                        className="rounded-lg bg-bg-secondary/45 px-3 py-3"
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
      className="flex h-full min-h-0 flex-col overflow-hidden"
      onKeyDownCapture={(event) => {
        handleSearchEscapeKeyDown({
          query: controller.state.query,
          setQuery: controller.setQuery,
          event,
        });
      }}
    >
      <div className="shrink-0 rounded-xl bg-bg-secondary/28 p-4">
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">Mapping search</p>
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
            placeholder={`Search ${providerLabel} / ${providerIdLabel}`}
            className="w-full rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea.Root className="h-full w-full" onWheelCapture={handleWheelCapture}>
          <ScrollArea.Viewport
            ref={viewportRef}
            className="h-full w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="p-4">
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
