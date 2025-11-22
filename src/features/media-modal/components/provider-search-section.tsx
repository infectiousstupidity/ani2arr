// src/features/media-modal/components/provider-search-section.tsx
import { ExternalLink, X } from "lucide-react";
import type { MappingSearchResult } from "@/shared/types";
import { buildExternalMediaLink } from "@/shared/utils/build-external-media-link";
import type { UseMappingControllerResult } from "../hooks/use-mapping-controller";

interface ProviderSearchSectionProps {
  controller: UseMappingControllerResult;
  currentMapping: MappingSearchResult | null;
  baseUrl: string;
}

export function ProviderSearchSection(props: ProviderSearchSectionProps) {
  const { controller, currentMapping, baseUrl } = props;
  const { state, setQuery, selectResult, clearSelection, searchQuery } = controller;
  const results = searchQuery.data ?? [];
  const selected = state.selected;
  const hasQuery = state.query.trim().length > 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Mapping search
          </p>
          <p className="text-xs text-text-secondary">
            Find the right TVDB entry; your selection updates the preview on the right.
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs font-semibold text-accent-primary hover:text-accent-hover"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <input
          value={state.query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Sonarr / TVDB"
          className="w-full rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:outline-none"
        />
        {selected ? (
          <div className="flex items-center gap-2 rounded-lg border border-accent-primary/30 bg-accent-primary/5 px-3 py-2 text-xs text-text-secondary">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-primary">Previewing</span>
            <span className="font-mono text-text-primary/80">TVDB {String(selected.target.id)}</span>
            <span className="truncate text-text-primary">{selected.title}</span>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto inline-flex items-center justify-center rounded-full border border-accent-primary/30 p-1 text-accent-primary hover:bg-accent-primary/10"
              aria-label="Reset selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-border-primary bg-bg-tertiary/80 shadow-inner">
        <div className="h-full divide-y divide-border-primary overflow-y-auto">
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
            const metaParts = [
              `TVDB ${String(result.target.id)}`,
              result.year ? String(result.year) : null,
              result.typeLabel ?? null,
            ].filter((value): value is string => Boolean(value));
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
                  className="flex flex-1 items-center gap-3 text-left"
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
                  <div className="min-w-0 space-y-1">
                    <div
                      className={`truncate text-sm font-semibold ${
                        isSelected ? "text-accent-primary" : "text-text-primary"
                      }`}
                    >
                      {result.title}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {metaParts.join(" | ")}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium">
                      {result.inLibrary ? (
                        <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">In library</span>
                      ) : null}
                      {isCurrent ? (
                        <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-400">Current mapping</span>
                      ) : null}
                      {isSelected ? (
                        <span className="rounded bg-accent-primary/20 px-1.5 py-0.5 text-accent-primary">Active</span>
                      ) : null}
                    </div>
                  </div>
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded p-2 text-text-secondary hover:text-text-primary"
                  aria-label="Open in Sonarr"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

