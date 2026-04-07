/** Mapping search results renderer for manual mapping selection and replacement preview. */
// src/features/mapping/mapping-search-panel.tsx

import { ExternalLink } from 'lucide-react';
import Pill from '@/shared/ui/primitives/pill';
import TooltipWrapper from '@/shared/ui/primitives/tooltip';
import type { Provider } from '@/providers';
import { buildExternalMediaLink } from '@/shared/utils/provider-links';
import { getProviderLabel } from '@/providers/provider-routing';
import type { MappingSearchController, MappingSearchResult } from './types';

function shouldShowTypeLabel(result: MappingSearchResult): boolean {
  return result.provider === 'sonarr' && Boolean(result.typeLabel) && result.inLibrary;
}

interface MappingSearchPanelProps {
  controller: MappingSearchController;
  currentMapping: MappingSearchResult | null;
  provider: Provider;
  baseUrl: string;
  portalContainer?: HTMLElement | null;
}

export function MappingSearchPanel(props: MappingSearchPanelProps) {
  const { controller, currentMapping, provider, baseUrl, portalContainer } = props;
  const { state, selectResult, searchQuery } = controller;
  const results = searchQuery.data ?? [];
  const selected = state.selected;
  const hasQuery = state.query.length > 0;
  const trimmedQuery = state.query.trim();
  const showMinimumCharacterMessage = hasQuery && trimmedQuery.length < 2;
  const canRenderSearchState = showMinimumCharacterMessage === false;
  const showSearchingState = canRenderSearchState && searchQuery.isFetching && results.length === 0;
  const showEmptyState = canRenderSearchState && searchQuery.isFetching === false && results.length === 0;
  const providerLabel = getProviderLabel(provider);

  return (
    <div className="overflow-hidden rounded-xl border border-border-primary/60 bg-bg-secondary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="divide-y divide-border-primary/70">
        {showMinimumCharacterMessage ? (
          <div className="px-3 py-6 text-center text-xs text-text-secondary">
            {`Enter at least 2 characters to search ${providerLabel}.`}
          </div>
        ) : null}

        {showSearchingState ? (
          <div className="px-3 py-6 text-center text-xs text-text-secondary">
            Searching...
          </div>
        ) : null}

        {showEmptyState ? (
          <div className="px-3 py-6 text-center text-xs text-text-secondary">
            {hasQuery ? 'No results found.' : `Type to search ${providerLabel} manually.`}
          </div>
        ) : null}

        {canRenderSearchState
          ? results.map((result) => {
                    const isCurrent =
                      currentMapping &&
                      result.providerId === currentMapping.providerId;
                    const isSelected =
                      selected &&
                      result.providerId === selected.providerId;

                    const metadataPills: React.ReactNode[] = [
                      <Pill key="tvdb" small tone="muted" className="font-mono text-text-primary">
                        {`${provider === 'radarr' ? 'TMDB' : 'TVDB'} ${result.providerId}`}
                      </Pill>,
                    ];

                    if (result.year) {
                      metadataPills.push(
                        <Pill key="year" small tone="muted">
                          {result.year}
                        </Pill>,
                      );
                    }

                    if (shouldShowTypeLabel(result)) {
                      metadataPills.push(
                        <Pill key="type" small tone="muted" className="text-text-secondary">
                          {result.typeLabel}
                        </Pill>,
                      );
                    }

                    if (result.inLibrary) {
                      metadataPills.push(
                        <Pill
                          key="library"
                          small
                          tone="success"
                          className="border-transparent bg-success/85 text-white uppercase tracking-wide"
                        >
                          {`In ${providerLabel}`}
                        </Pill>,
                      );
                    }

                    if (Array.isArray(result.linkedAniListIds) && result.linkedAniListIds.length > 0) {
                      metadataPills.push(
                        <Pill
                          key="linked"
                          small
                          tone="warning"
                          className="border-transparent bg-amber-300/20 text-amber-100 text-[10px] font-semibold uppercase tracking-wide"
                        >
                          {`Linked to ${result.linkedAniListIds.length} AniList entr${result.linkedAniListIds.length === 1 ? 'y' : 'ies'}`}
                        </Pill>,
                      );
                    }

                    if (isCurrent) {
                      metadataPills.push(
                        <Pill key="current" small tone="success" className="border-transparent bg-success/85 text-white uppercase tracking-wide">
                          Current match
                        </Pill>,
                      );
                    }

                    const link = buildExternalMediaLink({
                      provider: provider,
                      baseUrl,
                      inLibrary: result.inLibrary,
                      ...(result.librarySlug ? { librarySlug: result.librarySlug } : {}),
                      searchTerm: result.title,
                    });

                    return (
                      <div
                        key={`${result.provider}-${result.providerId}`}
                        className={`group flex items-center gap-3 px-3 py-3 transition-colors ${
                          isSelected
                            ? 'bg-accent-primary/18 ring-1 ring-inset ring-accent-primary/35'
                            : 'hover:bg-bg-primary/45'
                        }`}
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-start gap-3 text-left"
                          onClick={() => selectResult(result)}
                        >
                          {result.posterUrl ? (
                            <img
                              src={result.posterUrl}
                              alt="Poster"
                              className="h-14 w-10 shrink-0 rounded object-cover shadow-sm"
                            />
                          ) : (
                            <div className="h-14 w-10 shrink-0 rounded bg-bg-primary" />
                          )}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div
                              className={`text-sm font-semibold leading-tight ${
                                isSelected ? 'text-accent-primary' : 'text-text-primary'
                              } line-clamp-2`}
                            >
                              {result.title}
                            </div>
                            {metadataPills.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                                {metadataPills}
                              </div>
                            ) : null}
                          </div>
                        </button>
                        {link ? (
                          <TooltipWrapper content={`Open in ${providerLabel}`} container={portalContainer ?? null}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded p-2 text-text-secondary hover:text-text-primary"
                              aria-label={`Open in ${providerLabel}`}
                            >
                              <ExternalLink size={16} />
                            </a>
                          </TooltipWrapper>
                        ) : null}
                      </div>
                    );
                  })
          : null}
      </div>
    </div>
  );
}
