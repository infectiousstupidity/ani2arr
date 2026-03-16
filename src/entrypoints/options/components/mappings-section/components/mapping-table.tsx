import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useVirtualizer } from '@tanstack/react-virtual';
import Button from '@/shared/ui/primitives/button';
import {
  MappingAccordionItem,
  type MappingTableRowData,
} from './mapping-row';

/** Height of collapsed accordion row header in pixels */
const ROW_HEIGHT_COLLAPSED = 56;
/** Estimated height of expanded content per entry */
const ENTRY_HEIGHT_EXPANDED = 132;
/** Padding / rail / content chrome inside expanded section */
const EXPANDED_CHROME_HEIGHT = 20;

type MappingTableProps = {
  rows: MappingTableRowData[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onEdit: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onDeleteOverride: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onRejectCandidate: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onClearRejectedCandidate: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onBlockCandidate: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onClearBlockedCandidate: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onIgnoreTitle: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  onClearIgnoreTitle: (entry: MappingTableRowData['entries'][number]['entry']) => void;
  isMutating: boolean;
  emptyCopy?: string;
  sonarrUrl?: string | null;
  radarrUrl?: string | null;
};

export type { MappingTableRowData, MappingTableEntry } from './mapping-row';

export const MappingTable: React.FC<MappingTableProps> = ({
  rows,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onEdit,
  onDeleteOverride,
  onRejectCandidate,
  onClearRejectedCandidate,
  onBlockCandidate,
  onClearBlockedCandidate,
  onIgnoreTitle,
  onClearIgnoreTitle,
  isMutating,
  emptyCopy,
  sonarrUrl,
  radarrUrl,
}) => {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedItems), [expandedItems]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const estimateSize = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return ROW_HEIGHT_COLLAPSED;

      if (expandedSet.has(row.id)) {
        return (
          ROW_HEIGHT_COLLAPSED +
          EXPANDED_CHROME_HEIGHT +
          row.entries.length * ENTRY_HEIGHT_EXPANDED
        );
      }

      return ROW_HEIGHT_COLLAPSED;
    },
    [rows, expandedSet],
  );

  const getItemKey = useCallback(
    (index: number) => rows[index]?.id ?? index,
    [rows],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: 6,
    getItemKey,
  });

  const handleValueChange = useCallback(
    (newValue: string[]) => {
      const nextExpanded = newValue.length > 0 ? [newValue[newValue.length - 1]!] : [];
      setExpandedItems(nextExpanded);

      requestAnimationFrame(() => {
        virtualizer.measure();
      });
    },
    [virtualizer],
  );

  if (isLoading) {
    return <div className="px-5 py-8 text-sm text-text-secondary">Loading mappings...</div>;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const hasRows = rows.length > 0;

  return (
    <div>
      <div
        ref={scrollContainerRef}
        className="max-h-[70vh] min-h-60 overflow-auto"
      >
        {hasRows ? (
          <Accordion.Root
            type="multiple"
            value={expandedItems}
            onValueChange={handleValueChange}
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
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
                    rowIndex={virtualRow.index}
                    isMutating={isMutating}
                    isExpanded={isExpanded}
                    onEdit={onEdit}
                    onDeleteOverride={onDeleteOverride}
                    onRejectCandidate={onRejectCandidate}
                    onClearRejectedCandidate={onClearRejectedCandidate}
                    onBlockCandidate={onBlockCandidate}
                    onClearBlockedCandidate={onClearBlockedCandidate}
                    onIgnoreTitle={onIgnoreTitle}
                    onClearIgnoreTitle={onClearIgnoreTitle}
                    providerUrl={providerUrl ?? null}
                  />
                </div>
              );
            })}
          </Accordion.Root>
        ) : (
          <div className="px-5 py-8 text-sm text-text-secondary">
            {emptyCopy ?? 'No mappings match this filter.'}
          </div>
        )}
      </div>

      {hasNextPage ? (
        <div className="border-t border-border-primary/70 bg-bg-primary/24 px-4 py-3 text-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={onLoadMore}
            isLoading={isFetchingNextPage}
            className="rounded-xl border border-border-primary/70 bg-bg-primary/25 hover:bg-bg-secondary/70"
          >
            {isFetchingNextPage ? 'Loading more...' : 'Load more results'}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default MappingTable;
