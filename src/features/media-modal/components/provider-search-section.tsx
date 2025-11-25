// src/features/media-modal/components/provider-search-section.tsx
import { useCallback, useEffect, useRef, type WheelEvent as ReactWheelEvent } from "react";
import { ExternalLink } from "lucide-react";
import Pill from "@/shared/components/pill";
import TooltipWrapper from "@/shared/components/tooltip";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { MappingSearchResult } from "@/shared/types";
import { buildExternalMediaLink } from "@/shared/utils/build-external-media-link";
import type { UseMappingControllerResult } from "../hooks/use-mapping-controller";

interface ProviderSearchSectionProps {
  controller: UseMappingControllerResult;
  currentMapping: MappingSearchResult | null;
  baseUrl: string;
  autoFocus?: boolean;
  portalContainer?: HTMLElement | null;
}

export function ProviderSearchSection(props: ProviderSearchSectionProps) {
  const { controller, currentMapping, baseUrl, autoFocus = false, portalContainer } = props;
  const { state, setQuery, selectResult, searchQuery } = controller;
  const results = searchQuery.data ?? [];
  const selected = state.selected;
  const hasQuery = state.query.trim().length > 0;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const handleWheelCapture = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const canScrollY = viewport.scrollHeight > viewport.clientHeight;
    const canScrollX = viewport.scrollWidth > viewport.clientWidth;
    if (!canScrollY && !canScrollX) return;
    viewport.scrollBy({ top: event.deltaY, left: event.deltaX });
    event.preventDefault();
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Mapping search
            </p>
            <p className="text-xs text-text-secondary">
              Find the right TVDB entry; your selection updates the preview on the right.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <input
          ref={inputRef}
          value={state.query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Sonarr / TVDB"
          className="w-full rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:outline-none"
        />
      </div>

      <div className="flex-1 min-h-0 rounded-xl bg-bg-secondary/80 shadow-inner overflow-hidden">
        <ScrollArea.Root
          className="h-full w-full"
          onWheelCapture={handleWheelCapture}
        >
          <div className="flex h-full">
            {/* Viewport takes remaining width */}
            <ScrollArea.Viewport
              ref={viewportRef}
              className="h-full flex-1 overflow-y-auto"
            >
              {/* small top/bottom padding so selection highlight isn't cut by rounded corners */}
              <div className="py-1">
                <div className="divide-y divide-border-primary">
                  {searchQuery.isFetching && !results.length ? (
                    <div className="flex h-32 items-center justify-center text-xs text-text-secondary">
                      Searching...
                    </div>
                  ) : null}

                  {!results.length && !searchQuery.isFetching ? (
                    <div className="flex h-32 items-center justify-center px-3 py-6 text-center text-xs text-text-secondary">
                      {hasQuery ? "No results found." : "Type to search Sonarr."}
                    </div>
                  ) : null}

                  {results.map((result) => {
                    const isCurrent =
                      currentMapping &&
                      result.target.id === currentMapping.target.id &&
                      result.target.idType === currentMapping.target.idType;
                    const isSelected =
                      selected &&
                      result.target.id === selected.target.id &&
                      result.target.idType === selected.target.idType;

                    const metadataPills: React.ReactNode[] = [
                      <Pill key="tvdb" small tone="muted" className="font-mono text-text-primary">
                        {`TVDB ${result.target.id}`}
                      </Pill>,
                    ];

                    if (result.year) {
                      metadataPills.push(
                        <Pill key="year" small tone="muted">
                          {result.year}
                        </Pill>
                      );
                    }

                    if (result.typeLabel) {
                      metadataPills.push(
                        <Pill key="type" small tone="muted" className="text-text-secondary">
                          {result.typeLabel}
                        </Pill>
                      );
                    }

                    if (result.inLibrary) {
                      metadataPills.push(
                        <Pill key="library" small tone="success" className="uppercase tracking-wide">
                          In Sonarr
                        </Pill>
                      );
                    }

                    if (isCurrent) {
                      metadataPills.push(
                        <Pill key="current" small tone="blue" className="uppercase tracking-wide">
                          Current mapping
                        </Pill>
                      );
                    }

                    const link = buildExternalMediaLink({
                      service: "sonarr",
                      baseUrl,
                      inLibrary: result.inLibrary,
                      ...(result.librarySlug ? { librarySlug: result.librarySlug } : {}),
                      searchTerm: result.title,
                    });

                    return (
                      <div
                        key={`${result.target.id}-${result.target.idType}`}
                        className={`group flex items-center gap-3 px-3 py-3 transition-colors ${
                          isSelected
                            ? "bg-accent-primary/15 ring-1 ring-inset ring-accent-primary/30"
                            : "hover:bg-bg-primary/50"
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
                                isSelected ? "text-accent-primary" : "text-text-primary"
                              } line-clamp-2`}
                            >
                              {result.title}
                            </div>
                            {metadataPills.length ? (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                                {metadataPills}
                              </div>
                            ) : null}
                          </div>
                        </button>
                        {link ? (
                          <TooltipWrapper content="Open in Sonarr" container={portalContainer ?? null}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded p-2 text-text-secondary hover:text-text-primary"
                              aria-label="Open in Sonarr"
                            >
                              <ExternalLink size={16} />
                            </a>
                          </TooltipWrapper>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea.Viewport>

            {/* Scrollbar sits BESIDE the content, not over it */}
            <ScrollArea.Scrollbar
              orientation="vertical"
              className="flex w-2.5 select-none touch-none p-0.5"
            >
              <ScrollArea.Thumb className="flex-1 rounded bg-border-primary/40" />
            </ScrollArea.Scrollbar>

            <ScrollArea.Corner />
          </div>
        </ScrollArea.Root>
      </div>

    </div>
  );
}
