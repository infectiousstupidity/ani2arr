// src/features/media-modal/tabs/mapping-tab/provider-search-section.tsx
import type { MappingSearchResult } from '@/shared/types';
import { ExternalLink } from 'lucide-react';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';
import type { UseMappingControllerResult } from './hooks/use-mapping-controller';

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

  return (
    <div className="flex flex-col gap-3 h-full">
      <div>
        {selected ? (
          <div className="flex items-center gap-2 border border-border-primary rounded px-2 py-1 bg-bg-tertiary">
            <span className="text-xs text-text-secondary">
              TVDB {String(selected.target.id)} • {selected.title}
            </span>
            <button className="text-xs text-text-secondary hover:text-text-primary" onClick={clearSelection}>
              ×
            </button>
          </div>
        ) : (
          <input
            value={state.query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Sonarr…"
            className="w-full border border-border-primary bg-bg-tertiary text-text-primary placeholder:text-text-secondary/50 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent-primary"
          />
        )}
      </div>

      <div className="flex flex-col divide-y divide-border-primary border border-border-primary rounded bg-bg-tertiary h-[450px] overflow-y-auto">
        {results.length === 0 ? (
          <div className="text-xs text-text-secondary px-3 py-6 text-center">
            {state.query ? "No results found" : "Type to search..."}
          </div>
        ) : (
          results.map((r) => {
            const isCurrent = currentMapping && r.target.id === currentMapping.target.id && r.target.idType === currentMapping.target.idType;
            const isSelected = selected && r.target.id === selected.target.id && r.target.idType === selected.target.idType;
            const link = buildExternalMediaLink({
              service: 'sonarr',
              baseUrl,
              inLibrary: r.inLibrary,
              ...(r.librarySlug ? { librarySlug: r.librarySlug } : {}),
              searchTerm: r.title,
            });
            return (
              <div 
                key={`${r.target.id}`} 
                className={`flex items-center justify-between gap-2 px-3 py-2 transition-colors ${
                  isSelected ? 'bg-accent-primary/10' : 'hover:bg-bg-primary/50'
                }`}
              >
                <button className="flex items-center gap-3 text-left flex-1" onClick={() => selectResult(r)}>
                  {r.posterUrl ? (
                    <img src={r.posterUrl} alt="poster" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-bg-primary rounded" />
                  )}
                  <div className="flex flex-col items-start">
                    <div className={`text-sm font-medium ${isSelected ? 'text-accent-primary' : 'text-text-primary'}`}>
                      {r.title}
                    </div>
                    <div className="text-xs text-text-secondary">
                      TVDB {String(r.target.id)}{r.year ? ` • ${r.year}` : ''}{r.typeLabel ? ` • ${r.typeLabel}` : ''}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {r.inLibrary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">In library</span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">Current mapping</span>
                      )}
                    </div>
                  </div>
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary p-2">
                  <ExternalLink size={16} />
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}