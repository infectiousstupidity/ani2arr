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
    <div className="flex flex-col gap-3">
      <div>
        {selected ? (
          <div className="flex items-center gap-2 border rounded px-2 py-1 bg-gray-50">
            <span className="text-xs text-gray-600">
              TVDB {String(selected.target.id)} • {selected.title}
            </span>
            <button className="text-xs text-gray-700 hover:text-black" onClick={clearSelection}>
              ×
            </button>
          </div>
        ) : (
          <input
            value={state.query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Sonarr…"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        )}
      </div>

      {!selected && (
        <div className="flex flex-col divide-y border rounded">
          {results.map((r) => {
            const isCurrent = currentMapping && r.target.id === currentMapping.target.id && r.target.idType === currentMapping.target.idType;
            const link = buildExternalMediaLink({
              service: 'sonarr',
              baseUrl,
              inLibrary: r.inLibrary,
              ...(r.librarySlug ? { librarySlug: r.librarySlug } : {}),
              searchTerm: r.title,
            });
            return (
              <div key={`${r.target.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50">
                <button className="flex items-center gap-3" onClick={() => selectResult(r)}>
                  {r.posterUrl ? (
                    <img src={r.posterUrl} alt="poster" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-gray-200 rounded" />
                  )}
                  <div className="flex flex-col items-start">
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-gray-600">
                      TVDB {String(r.target.id)}{r.year ? ` • ${r.year}` : ''}{r.typeLabel ? ` • ${r.typeLabel}` : ''}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {r.inLibrary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">In library</span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Current mapping</span>
                      )}
                    </div>
                  </div>
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="text-gray-600 hover:text-black">
                  <ExternalLink size={16} />
                </a>
              </div>
            );
          })}
          {results.length === 0 && (
            <div className="text-xs text-gray-500 px-3 py-6">No results</div>
          )}
        </div>
      )}
    </div>
  );
}
