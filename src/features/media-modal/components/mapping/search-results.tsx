/** Renders the media modal's manual mapping search results list. */
// src/features/media-modal/components/mapping/search-results.tsx

import { ExternalLink } from 'lucide-react';
import { useMediaModalContext } from '../../context';
import TooltipWrapper from '@/shared/ui/primitives/tooltip';
import { buildProviderOpenUrl } from '@/providers/provider-links';
import { getProviderIdLabel } from '@/providers/provider-labels';
import type { MappingSearchResult } from '@/features/media-modal/mapping-search/types';
import type { Provider } from '@/providers';

function shouldShowTypeLabel(result: MappingSearchResult): boolean {
  return result.provider === 'sonarr' && Boolean(result.typeLabel);
}

function compactStrings(items: Array<string | null>): string[] {
  return items.filter((item): item is string => item !== null);
}

function getMetadataItems(input: {
  result: MappingSearchResult;
  provider: Provider;
}): Array<string | null> {
  const { result, provider } = input;

  return [
    `${getProviderIdLabel(provider)} ${result.providerId}`,
    result.year ? String(result.year) : null,
    shouldShowTypeLabel(result) ? result.typeLabel ?? null : null,
  ];
}

function getLinkedWarning(result: MappingSearchResult): string | null {
  if (!Array.isArray(result.linkedAniListIds) || result.linkedAniListIds.length === 0) {
    return null;
  }

  return `Linked to ${result.linkedAniListIds.length} AniList entr${
    result.linkedAniListIds.length === 1 ? 'y' : 'ies'
  }`;
}

function getStatusItems(input: {
  result: MappingSearchResult;
  provider: Provider;
  providerLabel: Capitalize<Provider>;
  isCurrent: boolean;
}): Array<string | null> {
  const { result, provider, providerLabel, isCurrent } = input;

  return [
    isCurrent ? 'Current match' : null,
    result.isInLibrary
      ? `In ${providerLabel}${provider === 'sonarr' && result.fileCount ? ` - ${result.fileCount} eps` : ''}`
      : null,
  ];
}

function getResultLink(input: {
  result: MappingSearchResult;
  provider: Provider;
  baseUrl: string;
}): string | null {
  const { result, provider, baseUrl } = input;

  return buildProviderOpenUrl({
    provider,
    baseUrl,
    isInLibrary: result.isInLibrary,
    ...(result.providerRouteSlug ? { providerRouteSlug: result.providerRouteSlug } : {}),
    searchTerm: result.title,
  });
}

function MappingSearchResultRow(props: {
  result: MappingSearchResult;
  provider: Provider;
  providerLabel: Capitalize<Provider>;
  baseUrl: string;
  contentContainer: HTMLDivElement | null;
  isCurrent: boolean;
  isSelected: boolean;
  onSelectResult: (result: MappingSearchResult) => void;
}): React.JSX.Element {
  const {
    result,
    provider,
    providerLabel,
    baseUrl,
    contentContainer,
    isCurrent,
    isSelected,
    onSelectResult,
  } = props;
  const metadataItems = compactStrings(getMetadataItems({ result, provider }));
  const linkedWarning = getLinkedWarning(result);
  const statusItems = compactStrings(getStatusItems({ result, provider, providerLabel, isCurrent }));
  const link = getResultLink({ result, provider, baseUrl });

  return (
    <div
      className={`group flex items-center gap-3 border-l-2 px-3 py-3 transition-colors ${
        isSelected ? 'border-l-accent-primary bg-white/8' : 'border-l-transparent hover:bg-bg-primary/45'
      }`}
    >
      <button
        type="button"
        className="flex flex-1 items-start gap-3 text-left"
        onClick={() => onSelectResult(result)}
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
          <div className="text-sm font-semibold leading-tight text-text-primary line-clamp-2">
            {result.title}
          </div>
          {metadataItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-text-secondary">
              {metadataItems.map((item, index) => (
                <span key={`${result.providerId}-${item}-${index}`} className="contents">
                  {index > 0 ? <span aria-hidden="true">•</span> : null}
                  <span className={index === 0 ? 'font-mono text-text-primary' : undefined}>{item}</span>
                </span>
              ))}
            </div>
          ) : null}
          {linkedWarning ? <div className="text-[11px] font-medium text-amber-100/85">{linkedWarning}</div> : null}
          {statusItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
              {statusItems.map((item, index) => (
                <span
                  key={`${result.providerId}-status-${index}`}
                  className={index === 0 && isCurrent ? 'text-success' : 'text-text-secondary'}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
      {link ? (
        <TooltipWrapper content={`Open in ${providerLabel}`} container={contentContainer}>
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
}

interface MappingSearchPanelProps {
  query: string;
  results: MappingSearchResult[];
  isSearching: boolean;
  selectedResult: MappingSearchResult | null;
  effectiveMapping: MappingSearchResult | null;
  onSelectResult: (result: MappingSearchResult) => void;
}

export function MappingSearchPanel(props: MappingSearchPanelProps) {
  const {
    query,
    results,
    isSearching,
    selectedResult,
    effectiveMapping,
    onSelectResult,
  } = props;
  const { provider, providerLabel, baseUrl, contentContainer } = useMediaModalContext();
  const hasQuery = query.length > 0;
  const trimmedQuery = query.trim();
  const showMinimumCharacterMessage = hasQuery && trimmedQuery.length < 2;
  const canRenderSearchState = showMinimumCharacterMessage === false;
  const showSearchingState = canRenderSearchState && isSearching && results.length === 0;
  const showEmptyState = canRenderSearchState && isSearching === false && results.length === 0;

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
          ? results.map((result) => (
              <MappingSearchResultRow
                key={`${result.provider}-${result.providerId}`}
                result={result}
                provider={provider}
                providerLabel={providerLabel}
                baseUrl={baseUrl}
                contentContainer={contentContainer}
                isCurrent={Boolean(effectiveMapping && result.providerId === effectiveMapping.providerId)}
                isSelected={Boolean(selectedResult && result.providerId === selectedResult.providerId)}
                onSelectResult={onSelectResult}
              />
            ))
          : null}
      </div>
    </div>
  );
}
