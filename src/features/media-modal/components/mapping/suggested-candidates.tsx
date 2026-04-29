/** Renders suggested mapping candidates and search shortcut helpers for the modal. */
// src/features/media-modal/components/mapping/suggested-candidates.tsx

import { useMemo } from 'react';
import type {
  MappingInspectionCandidate,
  MappingInspectionPayload,
  MappingInspectionSuggestedCandidates,
} from '@/mapping/queries/mapping-details';
import type { Provider } from '@/providers';
import { getProviderIdLabel } from '@/providers/provider-labels';
import Pill from '@/shared/ui/primitives/pill';
import { getSuggestedCandidateGroups } from '../../helpers';

export function getSuggestedCandidatePrefill(
  candidate: MappingInspectionCandidate,
  suggestedCandidates: MappingInspectionSuggestedCandidates,
): string {
  const candidateTitle = candidate.title?.trim();
  if (candidateTitle) {
    return candidateTitle;
  }

  const tracedSearchTerm = suggestedCandidates.searchTerms?.find((term) => term.trim().length > 0)?.trim();
  if (tracedSearchTerm) {
    return tracedSearchTerm;
  }

  return String(candidate.providerId);
}

export function applySuggestedCandidateSearchShortcut(
  setQuery: (query: string) => void,
  candidate: MappingInspectionCandidate,
  suggestedCandidates: MappingInspectionSuggestedCandidates,
): string {
  const nextQuery = getSuggestedCandidatePrefill(candidate, suggestedCandidates);
  setQuery(nextQuery);
  return nextQuery;
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
    () =>
      groups
        .flatMap((group) =>
          group.items.slice(0, group.key === 'accepted' ? 2 : 3).map((item) => ({ group, item })),
        )
        .slice(0, 6),
    [groups],
  );
  const recentSearches = inspection.suggestedCandidates.searchTerms
    ?.map((term) => term.trim())
    .filter((term) => term.length > 0)
    .join(', ');

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="space-y-1">
          <h3 className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
            Recent suggestions
          </h3>
          {recentSearches ? (
            <p className="text-xs text-text-secondary">{`Recent searches: ${recentSearches}`}</p>
          ) : null}
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
                        {rowLabel ? (
                          <Pill small tone={group.tone}>
                            {rowLabel}
                          </Pill>
                        ) : null}
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
            No recent suggestions are available yet. Start typing to search manually.
          </div>
        )}
      </section>
    </div>
  );
}
