/** Renders the left workspace mapping flow with manual provider search. */
// src/features/media-modal/components/mapping/mapping-panel.tsx

import { useCallback, useRef, type WheelEvent as ReactWheelEvent } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import { getProviderExternalIdLabel } from "@/providers/provider-labels";
import { useMediaModalContext } from "../../context";
import { MappingSearchPanel } from "./search-results";

type MappingInspectionQuery = {
  data: MappingDetailsPayload | undefined;
  error: unknown;
  isPending: boolean;
};

type MappingPanelProps = {
  query: string;
  searchResults: MappingSearchResult[];
  isSearching: boolean;
  selectedResult: MappingSearchResult | null;
  effectiveMapping: MappingSearchResult | null;
  inspectionQuery: MappingInspectionQuery;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: MappingSearchResult) => void;
};

export function MappingPanel(props: MappingPanelProps): React.JSX.Element {
  const {
    query,
    searchResults,
    isSearching,
    selectedResult,
    effectiveMapping,
    onQueryChange,
    onSelectResult,
  } = props;
  const { provider, providerLabel } = useMediaModalContext();
  const providerIdLabel = getProviderExternalIdLabel(provider);
  const isSearchMode = query.trim().length > 0;
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const handleWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
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
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 pt-4">
      <div className="shrink-0 pb-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
            {`Search ${providerLabel} database`}
          </p>
          <p className="text-xs text-text-secondary">Search results update the target preview on the right.</p>
        </div>

        <div className="mt-3">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`Search ${providerLabel} title or ${providerIdLabel}...`}
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
              {isSearchMode ? (
                <MappingSearchPanel
                  query={query}
                  results={searchResults}
                  isSearching={isSearching}
                  selectedResult={selectedResult}
                  effectiveMapping={effectiveMapping}
                  onSelectResult={onSelectResult}
                />
              ) : (
                <div className="rounded-xl bg-bg-secondary/35 px-3 py-4 text-sm text-text-secondary">
                  Start typing to search manually.
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
