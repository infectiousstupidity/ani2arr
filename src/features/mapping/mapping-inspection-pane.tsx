/** Inspection-first left pane for mapping mode while keeping manual search available. */
// src/features/mapping/mapping-inspection-pane.tsx

import { useMemo, useState } from 'react';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { useMappingInspection } from '@/shared/queries';
import { cn } from '@/shared/utils/cn';
import type {
  MappingInspectionCandidate,
  MappingInspectionPayload,
  MappingInspectionSuggestedCandidates,
} from '@/mapping/inspection/inspection-types';
import type { Provider } from '@/providers';
import { MappingSearchPanel } from './mapping-search-panel';
import type { MappingSearchController, MappingSearchResult } from './types';

interface MappingInspectionPaneProps {
  anilistId: number;
  provider: Provider;
  controller: MappingSearchController;
  currentMapping: MappingSearchResult | null;
  baseUrl: string;
  portalContainer?: HTMLElement | null;
}

interface MappingInspectionPaneContentProps {
  inspection: MappingInspectionPayload;
  provider: Provider;
  onUseSuggestion: (candidate: MappingInspectionCandidate) => void;
}

type SuggestedCandidateGroup = {
  key: 'accepted' | 'rejected' | 'suppressed' | 'notAccepted';
  label: string;
  tone: 'success' | 'warning' | 'accent' | 'muted';
  items: readonly MappingInspectionCandidate[];
};

const formatToken = (value: string): string => value.replaceAll('-', ' ').replaceAll('_', ' ');

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

export function shouldShowManualSearch(input: {
  currentMapping: MappingSearchResult | null;
  query: string;
  selected: MappingSearchResult | null;
  manualSearchRequested: boolean;
}): boolean {
  return (
    input.manualSearchRequested ||
    input.currentMapping == null ||
    input.query.trim().length > 0 ||
    input.selected !== null
  );
}

function Section(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="space-y-2 rounded-xl border border-border-primary/70 bg-bg-primary/35 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{props.title}</h3>
      {props.children}
    </section>
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
            <div key={`${item.kind}-${index}`} className="rounded-lg border border-border-primary/60 bg-bg-secondary/55 p-3">
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
                className="flex items-center justify-between rounded-lg border border-border-primary/60 bg-bg-secondary/55 px-3 py-2 text-sm hover:bg-bg-secondary/75"
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
              <div key={`${item.reason}-${index}`} className="rounded-lg border border-border-primary/60 bg-bg-secondary/55 p-3">
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
                  {group.items.map((candidate) => (
                    <button
                      key={`${group.key}-${candidate.providerId}`}
                      type="button"
                      onClick={() => onUseSuggestion(candidate)}
                      className="w-full rounded-lg border border-border-primary/60 bg-bg-secondary/55 px-3 py-3 text-left transition-colors hover:bg-bg-secondary/75"
                    >
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
                    </button>
                  ))}
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
  const { anilistId, provider, controller, currentMapping, baseUrl, portalContainer } = props;
  const inspectionQuery = useMappingInspection(provider, anilistId);
  const [manualSearchRequested, setManualSearchRequested] = useState(false);

  const manualSearchVisible = shouldShowManualSearch({
    currentMapping,
    query: controller.state.query,
    selected: controller.state.selected,
    manualSearchRequested,
  });

  const autoFocusSearch =
    manualSearchVisible &&
    (manualSearchRequested || currentMapping == null || controller.state.query.trim().length > 0 || controller.state.selected !== null);
  const manualSearchHidden = !manualSearchVisible;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div
        className={cn(
          'rounded-xl border border-border-primary/70 bg-bg-secondary/45 p-4',
          manualSearchVisible ? 'max-h-[48%] shrink-0 overflow-y-auto pr-2' : 'flex-1 overflow-y-auto pr-2',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">Mapping context</p>
            <p className="text-xs text-text-secondary">
              Understand the current mapping before using manual search to change it.
            </p>
          </div>
          {manualSearchHidden ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setManualSearchRequested(true)}>
              Search manually
            </Button>
          ) : null}
        </div>

        {inspectionQuery.isPending && !inspectionQuery.data ? (
          <div className="mt-4 rounded-xl border border-border-primary/60 bg-bg-primary/35 px-3 py-8 text-center text-sm text-text-secondary">
            Loading mapping context...
          </div>
        ) : null}

        {inspectionQuery.error && !inspectionQuery.data ? (
          <div className="mt-4 rounded-xl border border-warning/24 bg-warning/8 px-3 py-4 text-sm text-text-secondary">
            Mapping inspection is unavailable right now. Manual search is still available below.
          </div>
        ) : null}

        {inspectionQuery.data ? (
          <div className="mt-4">
            <MappingInspectionPaneContent
              inspection={inspectionQuery.data}
              provider={provider}
              onUseSuggestion={(candidate) => {
                applySuggestedCandidateSearchShortcut(controller, candidate, inspectionQuery.data.suggestedCandidates);
                setManualSearchRequested(true);
              }}
            />
          </div>
        ) : null}
      </div>

      {manualSearchVisible ? (
        <div className="min-h-0 flex-1">
          <MappingSearchPanel
            controller={controller}
            currentMapping={currentMapping}
            provider={provider}
            baseUrl={baseUrl}
            autoFocus={autoFocusSearch}
            portalContainer={portalContainer ?? null}
          />
        </div>
      ) : null}
    </div>
  );
}
