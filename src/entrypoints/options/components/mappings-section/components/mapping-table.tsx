import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePublicOptions } from '@/shared/queries';
import Button from '@/shared/ui/primitives/button';
import {
  MappingAccordionItem,
  type MappingTableRowData,
} from './mapping-row';

/** Height of collapsed accordion row header in pixels */
const ROW_HEIGHT_COLLAPSED = 56;
/** Estimated height of expanded content per entry */
const ENTRY_HEIGHT_EXPANDED = 140;

type MappingTableProps = {
  rows: MappingTableRowData[];
  isLoading: boolean;
  isRefreshing?: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onEdit: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onDeleteOverride: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onIgnore: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onClearIgnore: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  isMutating: boolean;
  totalCount?: number;
  loadedCount?: number;
  emptyCopy?: string;
};

export type { MappingTableRowData, MappingTableEntry } from './mapping-row';

export const MappingTable: React.FC<MappingTableProps> = ({
  rows,
  isLoading,
  isRefreshing,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onEdit,
  onDeleteOverride,
  onIgnore,
  onClearIgnore,
  isMutating,
  totalCount,
  emptyCopy,
}) => {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedItems), [expandedItems]);
  const { data: publicOptions } = usePublicOptions();
  const sonarrUrl = publicOptions?.providers.sonarr.url ?? null;
  const radarrUrl = publicOptions?.providers.radarr.url ?? null;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Estimate row height based on expansion state
  const estimateSize = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return ROW_HEIGHT_COLLAPSED;
      if (expandedSet.has(row.id)) {
        // Header + padding + entries
        return ROW_HEIGHT_COLLAPSED + 24 + row.entries.length * ENTRY_HEIGHT_EXPANDED;
      }
      return ROW_HEIGHT_COLLAPSED;
    },
    [rows, expandedSet],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: 5,
  });

  const handleValueChange = useCallback((newValue: string[]) => {
    setExpandedItems(newValue);
  }, []);

  if (isLoading) {
    return <div className="px-4 py-6 text-sm text-text-secondary">Loading mappings...</div>;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const hasRows = rows.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border-primary/70 px-4 py-2 text-xs text-text-secondary md:px-6">
        <span>Showing {rows.length} of {totalCount ?? rows.length}</span>
        {isRefreshing ? <span className="text-text-tertiary">· Refreshing...</span> : null}
      </div>

      <div
        ref={scrollContainerRef}
        className="max-h-[70vh] min-h-60 overflow-auto"
      >
        {hasRows ? (
          <Accordion.Root
            type="multiple"
            value={expandedItems}
            onValueChange={handleValueChange}
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const isExpanded = expandedSet.has(row.id);
              const providerUrl = row.provider === 'sonarr' ? sonarrUrl : radarrUrl;
              return (
                <div
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <MappingAccordionItem
                    row={row}
                    isMutating={isMutating}
                    isExpanded={isExpanded}
                    onEdit={onEdit}
                    onDeleteOverride={onDeleteOverride}
                    onIgnore={onIgnore}
                    onClearIgnore={onClearIgnore}
                    providerUrl={providerUrl}
                  />
                </div>
              );
            })}
          </Accordion.Root>
        ) : (
          <div className="px-4 py-6 text-sm text-text-secondary">
            {emptyCopy ?? 'No mappings match this filter.'}
          </div>
        )}
      </div>

      {hasNextPage ? (
        <div className="border-t border-border-primary/70 bg-bg-secondary/60 px-4 py-3 text-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={onLoadMore}
            isLoading={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading more...' : 'Load more results'}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default MappingTable;
