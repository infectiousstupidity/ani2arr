/** Toolbar controls for filtering, sorting, and bulk mapping-table actions. */
// src/options-page/sections/mappings/components/mapping-toolbar.tsx

import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ArrowUpDown, Check, ChevronDown, Search, X } from 'lucide-react';
import { getProviderLabel, PROVIDERS, type Provider } from '@/providers';
import type { MappingEntryKind } from '@/mapping/types';
import Button from '@/shared/ui/primitives/button';
import TooltipWrapper from '@/shared/ui/primitives/tooltip';
import { cn } from '@/shared/utils/cn';

export type EntryKindFilterSet = Set<MappingEntryKind>;
export type ProviderFilterSet = Set<Provider>;
export type LibraryFilter = 'all' | 'in-library' | 'not-in-library';
export type MappingScope = 'all' | 'needs-attention' | 'manual-mappings' | 'suppressed';
export type ProviderFilter = 'all' | Provider;
export type EntryKindFilter = 'all' | MappingEntryKind;

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
  providerFilter: ProviderFilter;
  entryKindFilter: EntryKindFilter;
  sortOption: MappingSort;
  libraryFilter: LibraryFilter;
  activeScope: MappingScope;
  resultsSummary: string;
  resultsSummaryDetail?: string;
  hasActiveRefinements: boolean;
  searchPlaceholder?: string;
  onSearchQueryChange: (value: string) => void;
  onProviderFilterChange: (value: ProviderFilter) => void;
  onEntryKindFilterChange: (value: EntryKindFilter) => void;
  onSortChange: (value: MappingSort) => void;
  onLibraryFilterChange: (value: LibraryFilter) => void;
  onScopeChange: (value: MappingScope) => void;
  onClearRefinements: () => void;
  hideActions?: boolean;
  hideSort?: boolean;
  popoverContainer?: HTMLElement | null;
};

export const providerOptions: { value: Provider; label: string }[] =
  PROVIDERS.map((provider) => ({ value: provider, label: getProviderLabel(provider) }));

export const entryKindOptions: { value: MappingEntryKind; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'unmapped', label: 'Unmapped' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'auto', label: 'Auto' },
  { value: 'upstream', label: 'Upstream' },
];

export const ALL_MAPPING_ENTRY_KINDS = entryKindOptions.map((option) => option.value);

const scopeDefinitions: Array<{
  value: MappingScope;
  label: string;
  entryKinds: EntryKindFilterSet;
}> = [
  {
    value: 'needs-attention',
    label: 'Needs attention',
    entryKinds: new Set<MappingEntryKind>(['manual', 'rejected', 'ignored', 'unmapped', 'unknown']),
  },
  {
    value: 'manual-mappings',
    label: 'Manual mappings',
    entryKinds: new Set<MappingEntryKind>(['manual']),
  },
  {
    value: 'suppressed',
    label: 'Suppressed',
    entryKinds: new Set<MappingEntryKind>(['rejected', 'ignored']),
  },
  {
    value: 'all',
    label: 'All mappings',
    entryKinds: new Set<MappingEntryKind>(ALL_MAPPING_ENTRY_KINDS),
  },
];

const libraryOptions: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All entries' },
  { value: 'in-library', label: 'In library' },
  { value: 'not-in-library', label: 'Missing from library' },
];

export const getScopeEntryKindFilters = (scope: MappingScope): EntryKindFilterSet => {
  const match = scopeDefinitions.find((definition) => definition.value === scope);
  return new Set(match?.entryKinds ?? ALL_MAPPING_ENTRY_KINDS);
};

const sortOptions: { value: MappingSort; label: string; description?: string }[] = [
  { value: 'updated-desc', label: 'Updated (newest)' },
  { value: 'updated-asc', label: 'Updated (oldest)' },
  { value: 'title-asc', label: 'Title (A-Z)' },
  { value: 'title-desc', label: 'Title (Z-A)' },
  { value: 'linked-desc', label: 'Linked (most first)' },
  { value: 'linked-asc', label: 'Linked (fewest first)' },
  { value: 'source', label: 'Source (manual first)', description: 'Manual -> unmapped -> unknown -> rejected -> ignored -> upstream -> auto' },
];

const segmentedBaseClassName =
  'inline-flex rounded-xl border border-border-primary/80 bg-bg-primary/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]';
const segmentedItemClassName =
  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors';
const showSegmentedBaseClassName =
  'inline-flex rounded-xl border border-accent-primary/30 bg-bg-primary/55 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';
const showSegmentedItemClassName =
  'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors';

export const MappingToolbar: React.FC<MappingToolbarProps> = ({
  searchQuery,
  providerFilter,
  entryKindFilter,
  sortOption,
  libraryFilter,
  activeScope,
  resultsSummary,
  resultsSummaryDetail,
  hasActiveRefinements,
  searchPlaceholder = 'Search title, AniList ID, or target ID',
  onSearchQueryChange,
  onProviderFilterChange,
  onEntryKindFilterChange,
  onSortChange,
  onLibraryFilterChange,
  onScopeChange,
  onClearRefinements,
  hideActions = false,
  hideSort = false,
  popoverContainer,
}) => {
  const [sortOpen, setSortOpen] = useState(false);
  const [entryKindOpen, setEntryKindOpen] = useState(false);

  const sortLabel = sortOptions.find((option) => option.value === sortOption)?.label ?? 'Sort';
  const entryKindOptionsForScope = entryKindOptions.filter((option) => getScopeEntryKindFilters(activeScope).has(option.value));
  const entryKindLabel = entryKindFilter === 'all'
    ? (activeScope === 'all'
      ? 'Any kind'
      : 'Any in scope')
    : entryKindOptions.find((option) => option.value === entryKindFilter)?.label ?? 'Entry kind';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border-primary/80 bg-bg-primary/45 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] xl:max-w-md">
          <Search className="h-4 w-4 shrink-0 text-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="shrink-0 text-text-tertiary hover:text-text-secondary"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hideActions ? null : (
            <>
            </>
          )}

          {hideSort ? null : (
            <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
              <Popover.Trigger asChild>
                <Button variant="outline" size="sm" className="gap-2 rounded-xl border-border-primary/80 bg-bg-primary/35 hover:bg-bg-secondary/80">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {sortLabel}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sortOpen && 'rotate-180')} />
                </Button>
              </Popover.Trigger>
              <Popover.Portal container={popoverContainer ?? undefined}>
                <Popover.Content
                  className="z-50 w-64 rounded-xl border border-border-primary/85 bg-bg-secondary p-1.5 shadow-xl"
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
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary/90"
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
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-text-primary">Show</div>
          <div className={showSegmentedBaseClassName}>
            {scopeDefinitions.map((scope) => (
              <button
                key={scope.value}
                type="button"
                onClick={() => onScopeChange(scope.value)}
                className={cn(
                  showSegmentedItemClassName,
                  activeScope === scope.value
                    ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/15'
                    : 'text-text-secondary hover:bg-bg-secondary/80 hover:text-text-primary',
                )}
              >
                {scope.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)_minmax(0,1fr)] lg:items-end">
          <div className="space-y-1">
            <div className="text-sm font-medium text-text-secondary">Provider</div>
            <div className={segmentedBaseClassName}>
              <button
                type="button"
                onClick={() => onProviderFilterChange('all')}
                className={cn(
                  segmentedItemClassName,
                  providerFilter === 'all'
                    ? 'bg-bg-secondary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                All
              </button>
              {providerOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onProviderFilterChange(option.value)}
                  className={cn(
                    segmentedItemClassName,
                    providerFilter === option.value
                      ? 'bg-bg-secondary text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium text-text-secondary">Entry kind</div>
            <Popover.Root open={entryKindOpen} onOpenChange={setEntryKindOpen}>
              <Popover.Trigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between gap-2 rounded-xl border-border-primary/80 bg-bg-primary/35 hover:bg-bg-secondary/80">
                  <span>{entryKindLabel}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', entryKindOpen && 'rotate-180')} />
                </Button>
              </Popover.Trigger>
              <Popover.Portal container={popoverContainer ?? undefined}>
                <Popover.Content
                  className="z-50 w-56 rounded-xl border border-border-primary/85 bg-bg-secondary p-1.5 shadow-xl"
                  side="bottom"
                  align="start"
                  sideOffset={4}
                >
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        onEntryKindFilterChange('all');
                        setEntryKindOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary/90"
                    >
                      <div className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        entryKindFilter === 'all'
                          ? 'border-accent-primary bg-accent-primary'
                          : 'border-border-primary bg-bg-primary',
                      )}>
                        {entryKindFilter === 'all' ? <Check className="h-3 w-3 text-white" /> : null}
                      </div>
                      <span className="text-text-primary">{activeScope === 'all' ? 'Any kind' : 'Any in current scope'}</span>
                    </button>
                    {entryKindOptionsForScope.map((option) => {
                      const isSelected = entryKindFilter === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            onEntryKindFilterChange(option.value);
                            setEntryKindOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary/90"
                        >
                          <div className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'border-accent-primary bg-accent-primary'
                              : 'border-border-primary bg-bg-primary',
                          )}>
                            {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                          </div>
                          <span className="text-text-primary">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium text-text-secondary">Library status</div>
            <div className={segmentedBaseClassName}>
              {libraryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onLibraryFilterChange(option.value)}
                  className={cn(
                    segmentedItemClassName,
                    libraryFilter === option.value
                      ? 'bg-bg-secondary text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border-primary/60 pt-3 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          {resultsSummaryDetail ? (
            <TooltipWrapper content={resultsSummaryDetail} container={popoverContainer ?? null}>
              <div className="cursor-default">{resultsSummary}</div>
            </TooltipWrapper>
          ) : (
            <div>{resultsSummary}</div>
          )}
          {hasActiveRefinements ? (
            <button
              type="button"
              onClick={onClearRefinements}
              className="self-start font-medium text-accent-primary hover:text-accent-primary/80"
            >
              Clear refinements
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MappingToolbar;
