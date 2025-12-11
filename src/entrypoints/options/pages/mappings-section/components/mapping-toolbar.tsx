import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ArrowUpDown, Check, ChevronDown, Filter, LibraryBig, Search, X } from 'lucide-react';
import type { MappingSource } from '@/shared/types';
import Button from '@/shared/components/button';
import { cn } from '@/shared/utils/cn';

export type SourceFilterSet = Set<MappingSource>;
export type LibraryFilter = 'all' | 'in-library' | 'not-in-library';

export type MappingSort =
  | 'updated-desc'
  | 'updated-asc'
  | 'title-asc'
  | 'title-desc'
  | 'linked-desc'
  | 'linked-asc'
  | 'source';

type MappingToolbarProps = {
  searchQuery: string;
  sourceFilters: SourceFilterSet;
  sortOption: MappingSort;
  libraryFilter: LibraryFilter;
  onSearchQueryChange: (value: string) => void;
  onSourceFiltersChange: (value: SourceFilterSet) => void;
  onSortChange: (value: MappingSort) => void;
  onLibraryFilterChange: (value: LibraryFilter) => void;
};

const sourceOptions: { value: MappingSource; label: string; color: string }[] = [
  { value: 'manual', label: 'Manual', color: 'bg-blue-500' },
  { value: 'auto', label: 'Auto', color: 'bg-purple-500' },
  { value: 'upstream', label: 'Upstream', color: 'bg-slate-400' },
  { value: 'ignored', label: 'Ignored', color: 'bg-red-500' },
];

const sortOptions: { value: MappingSort; label: string; description?: string }[] = [
  { value: 'updated-desc', label: 'Updated (newest)' },
  { value: 'updated-asc', label: 'Updated (oldest)' },
  { value: 'title-asc', label: 'Title (A-Z)' },
  { value: 'title-desc', label: 'Title (Z-A)' },
  { value: 'linked-desc', label: 'Linked (most first)' },
  { value: 'linked-asc', label: 'Linked (fewest first)' },
  { value: 'source', label: 'Source (manual first)', description: 'Manual -> ignored -> upstream -> auto' },
];

const libraryOptions: { value: LibraryFilter; label: string; description?: string }[] = [
  { value: 'all', label: 'All entries' },
  { value: 'in-library', label: 'In library only', description: 'Show mappings that already exist in Sonarr/Radarr' },
  { value: 'not-in-library', label: 'Missing from library', description: 'Hide entries already in Sonarr/Radarr' },
];

export const MappingToolbar: React.FC<MappingToolbarProps> = ({
  searchQuery,
  sourceFilters,
  sortOption,
  libraryFilter,
  onSearchQueryChange,
  onSourceFiltersChange,
  onSortChange,
  onLibraryFilterChange,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const toggleSource = (source: MappingSource) => {
    const updatedSourceFilters = new Set(sourceFilters);
    if (updatedSourceFilters.has(source)) {
      updatedSourceFilters.delete(source);
    } else {
      updatedSourceFilters.add(source);
    }
    onSourceFiltersChange(updatedSourceFilters);
  };

  const selectAll = () => {
    onSourceFiltersChange(new Set(sourceOptions.map((option) => option.value)));
  };

  const clearAll = () => {
    onSourceFiltersChange(new Set());
  };

  const allSelected = sourceFilters.size === sourceOptions.length;
  const noneSelected = sourceFilters.size === 0;

  const filterLabel = noneSelected
    ? 'All sources'
    : sourceFilters.size === sourceOptions.length
      ? 'All sources'
      : sourceFilters.size === 1
        ? sourceOptions.find((option) => sourceFilters.has(option.value))?.label ?? 'Filter'
        : `${sourceFilters.size} sources`;

  const sortLabel = sortOptions.find((option) => option.value === sortOption)?.label ?? 'Sort';
  const libraryLabel = libraryOptions.find((option) => option.value === libraryFilter)?.label ?? 'Library';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-primary bg-bg-primary px-3 py-2 sm:max-w-xs">
        <Search className="h-4 w-4 shrink-0 text-text-secondary" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search title, AniList ID, or target ID"
          className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            className="shrink-0 text-text-tertiary hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
          <Popover.Trigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortLabel}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sortOpen && 'rotate-180')} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-64 rounded-lg border border-border-primary bg-bg-secondary p-1 shadow-xl"
              side="bottom"
              align="end"
              sideOffset={4}
            >
              <div className="space-y-0.5">
                {sortOptions.map((option) => {
                  const isSelected = option.value === sortOption;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onSortChange(option.value);
                        setSortOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary"
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isSelected
                            ? 'border-accent-primary bg-accent-primary'
                            : 'border-border-primary bg-bg-primary',
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-text-primary">{option.label}</div>
                        {option.description ? (
                          <div className="truncate text-xs text-text-secondary">{option.description}</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Popover.Root open={libraryOpen} onOpenChange={setLibraryOpen}>
          <Popover.Trigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <LibraryBig className="h-3.5 w-3.5" />
              {libraryLabel}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', libraryOpen && 'rotate-180')} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-64 rounded-lg border border-border-primary bg-bg-secondary p-1 shadow-xl"
              side="bottom"
              align="end"
              sideOffset={4}
            >
              <div className="space-y-0.5">
                {libraryOptions.map((option) => {
                  const isSelected = option.value === libraryFilter;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onLibraryFilterChange(option.value);
                        setLibraryOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary"
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isSelected
                            ? 'border-accent-primary bg-accent-primary'
                            : 'border-border-primary bg-bg-primary',
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-text-primary">{option.label}</div>
                        {option.description ? (
                          <div className="truncate text-xs text-text-secondary">{option.description}</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Popover.Root open={filterOpen} onOpenChange={setFilterOpen}>
          <Popover.Trigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-3.5 w-3.5" />
              {filterLabel}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', filterOpen && 'rotate-180')} />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-48 rounded-lg border border-border-primary bg-bg-secondary p-1 shadow-xl"
              side="bottom"
              align="end"
              sideOffset={4}
            >
              <div className="space-y-0.5">
                {sourceOptions.map((option) => {
                  const isSelected = sourceFilters.has(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleSource(option.value)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary"
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isSelected
                            ? 'border-accent-primary bg-accent-primary'
                            : 'border-border-primary bg-bg-primary',
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', option.color)} />
                      <span className="text-text-primary">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 flex items-center gap-1 border-t border-border-primary/50 pt-1">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={allSelected}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    allSelected
                      ? 'text-text-tertiary'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                  )}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={noneSelected}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    noneSelected
                      ? 'text-text-tertiary'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                  )}
                >
                  Clear all
                </button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
};

export default MappingToolbar;
