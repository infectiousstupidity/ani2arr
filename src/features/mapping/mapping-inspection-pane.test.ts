/** Tests for the inspection-first mapping pane helpers and rendering. */
// src/features/mapping/mapping-inspection-pane.test.ts

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MappingInspectionPayload } from '@/mapping/inspection/inspection-types';
import type { MappingSearchController } from './types';
const { mockUseMappingInspection } = vi.hoisted(() => ({
  mockUseMappingInspection: vi.fn(),
}));

vi.mock('@/shared/queries', () => ({
  useMappingInspection: mockUseMappingInspection,
}));

import {
  applySuggestedCandidateSearchShortcut,
  handleSearchEscapeKeyDown,
  MappingInspectionPaneContent,
  MappingInspectionPane,
  MappingInspectionSuggestedShortcuts,
} from './mapping-inspection-pane';

const createInspectionPayload = (
  overrides?: Partial<MappingInspectionPayload>,
): MappingInspectionPayload => ({
  effectiveMapping: {
    provider: 'sonarr',
    anilistId: 101,
    providerId: null,
    status: 'unresolved',
    libraryStatus: 'unmapped',
  },
  providerContext: {
    provider: 'sonarr',
    providerId: null,
    linkedAniListIds: [],
    linkedAniListCount: 0,
  },
  linkedAniListEntries: [],
  whyThisExists: [
    {
      kind: 'resolver-outcome',
      summary: 'No effective mapping is currently stored for this AniList entry.',
    },
  ],
  suggestedCandidates: {
    accepted: [],
    rejected: [],
    suppressed: [],
    notAccepted: [],
  },
  review: {
    needsReview: false,
  },
  ...overrides,
});

const createController = (overrides?: Partial<MappingSearchController>): MappingSearchController => ({
  state: {
    query: '',
    selected: null,
    lastQuery: '',
    isDirty: false,
    ...overrides?.state,
  },
  searchQuery: {
    data: [],
    isFetching: false,
    ...overrides?.searchQuery,
  },
  setQuery: overrides?.setQuery ?? vi.fn(),
  selectResult: overrides?.selectResult ?? vi.fn(),
});

beforeEach(() => {
  mockUseMappingInspection.mockReset();
  mockUseMappingInspection.mockReturnValue({
    isPending: false,
    error: null,
    data: createInspectionPayload(),
  });
});

describe('mapping inspection pane', () => {
  it('always renders the search input, even when a current mapping exists', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPane, {
        anilistId: 101,
        provider: 'sonarr',
        controller: createController(),
        currentMapping: {
          provider: 'sonarr',
          providerId: 777,
          title: 'Current Mapping',
          inLibrary: true,
        },
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).toContain('placeholder="Search Sonarr / TVDB"');
  });

  it('renders suggested shortcuts instead of the full diagnostics body when the query is empty', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPane, {
        anilistId: 101,
        provider: 'sonarr',
        controller: createController({
          state: {
            query: '',
            selected: null,
            lastQuery: '',
            isDirty: false,
          },
        }),
        currentMapping: null,
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).toContain('Suggested matches');
    expect(view).toContain('No recent candidate trace is available yet. Start typing to search manually.');
    expect(view).not.toContain('No results found.');
    expect(view).not.toContain('Why this mapping exists');
  });

  it('renders search mode only when the query is non-empty', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPane, {
        anilistId: 101,
        provider: 'sonarr',
        controller: createController({
          state: {
            query: 'ab',
            selected: null,
            lastQuery: '',
            isDirty: false,
          },
        }),
        currentMapping: null,
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).toContain('No results found.');
    expect(view).not.toContain('Why this mapping exists');
    expect(view).not.toContain('No effective mapping is currently stored for this AniList entry.');
  });

  it('renders unresolved inspection payloads with the empty linked-entry state', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPaneContent, {
        inspection: createInspectionPayload(),
        provider: 'sonarr',
        onUseSuggestion: () => {},
      }),
    );

    expect(view).toContain('No effective mapping is currently stored for this AniList entry.');
    expect(view).toContain('No linked AniList entries are currently attached to this provider ID.');
    expect(view).toContain('No recent candidate trace is available yet.');
  });

  it('renders mapped payloads with linked AniList entries', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPaneContent, {
        inspection: createInspectionPayload({
          effectiveMapping: {
            provider: 'sonarr',
            anilistId: 101,
            providerId: 777,
            status: 'in-library',
            libraryStatus: 'in-provider',
            effectiveSource: 'upstream',
          },
          linkedAniListEntries: [
            { anilistId: 101, title: 'Season One', format: 'TV', year: 2020, relation: 'current' },
            { anilistId: 102, title: 'Season Two', format: 'TV', year: 2021 },
          ],
        }),
        provider: 'sonarr',
        onUseSuggestion: () => {},
      }),
    );

    expect(view).toContain('Season One');
    expect(view).toContain('Season Two');
    expect(view).toContain('TVDB 777');
    expect(view).toContain('Current');
  });

  it('renders review payloads with visible review state', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPaneContent, {
        inspection: createInspectionPayload({
          review: {
            needsReview: true,
            summary: {
              count: 1,
              primaryReason: 'manual-upstream-disagreement',
              reasons: ['manual-upstream-disagreement'],
            },
            items: [
              {
                reason: 'manual-upstream-disagreement',
                summary: 'Manual mapping conflicts with exact upstream mapping.',
                current: {
                  source: 'manual',
                  providerId: 900,
                },
                actions: ['keep-current'],
              },
            ],
          },
        }),
        provider: 'sonarr',
        onUseSuggestion: () => {},
      }),
    );

    expect(view).toContain('Needs review');
    expect(view).toContain('Manual mapping conflicts with exact upstream mapping.');
  });

  it('renders suggested candidates as evidence groups', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPaneContent, {
        inspection: createInspectionPayload({
          suggestedCandidates: {
            attemptedAt: 123,
            searchTerms: ['Shared Title'],
            accepted: [
              {
                providerId: 700,
                title: 'Shared Title',
                source: 'auto',
                reason: 'fuzzy-match',
                status: 'accepted',
                summary: 'Accepted fuzzy candidate',
              },
            ],
            rejected: [
              {
                providerId: 701,
                title: 'Wrong Title',
                source: 'auto',
                reason: 'fuzzy-match',
                status: 'rejected',
                summary: 'Rejected fuzzy candidate',
              },
            ],
            suppressed: [],
            notAccepted: [],
          },
        }),
        provider: 'sonarr',
        onUseSuggestion: () => {},
      }),
    );

    expect(view).toContain('Accepted trace');
    expect(view).toContain('Rejected trace');
    expect(view).toContain('Accepted fuzzy candidate');
    expect(view).toContain('Rejected fuzzy candidate');
  });

  it('renders compact suggested shortcuts from the inspection trace', () => {
    const inspection = createInspectionPayload({
      suggestedCandidates: {
        searchTerms: ['Shared Title'],
        accepted: [
          {
            providerId: 700,
            title: 'Shared Title',
            source: 'auto',
            reason: 'fuzzy-match',
            status: 'accepted',
            summary: 'Accepted fuzzy candidate',
          },
        ],
        rejected: [
          {
            providerId: 701,
            title: 'Wrong Title',
            source: 'auto',
            reason: 'fuzzy-match',
            status: 'rejected',
            summary: 'Rejected fuzzy candidate',
          },
        ],
        suppressed: [],
        notAccepted: [],
      },
    });

    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionSuggestedShortcuts, {
        inspection,
        provider: 'sonarr',
        onUseSuggestion: () => {},
      }),
    );

    expect(view).toContain('Suggested matches');
    expect(view).toContain('Shared Title');
    expect(view).toContain('Wrong Title');
    expect(view).toContain('Trace terms: Shared Title');
  });

  it('uses suggested candidates to prefill search without selecting a replacement directly', () => {
    const setQuery = vi.fn();
    const selectResult = vi.fn();
    const controller: MappingSearchController = {
      state: {
        query: '',
        selected: null,
        lastQuery: '',
        isDirty: false,
      },
      searchQuery: {
        data: [],
        isFetching: false,
      },
      setQuery,
      selectResult,
    };

    const nextQuery = applySuggestedCandidateSearchShortcut(
      controller,
      {
        providerId: 700,
        title: 'Shared Title',
        source: 'auto',
        reason: 'fuzzy-match',
        status: 'accepted',
        summary: 'Accepted fuzzy candidate',
      },
      {
        attemptedAt: 123,
        searchTerms: ['Shared Title'],
        accepted: [],
        rejected: [],
        suppressed: [],
        notAccepted: [],
      },
    );

    expect(nextQuery).toBe('Shared Title');
    expect(setQuery).toHaveBeenCalledWith('Shared Title');
    expect(selectResult).not.toHaveBeenCalled();
  });

  it('clears a non-empty query on Escape and stops propagation', () => {
    const setQuery = vi.fn();
    const stopPropagation = vi.fn();

    const handled = handleSearchEscapeKeyDown({
      query: 'naruto',
      setQuery,
      event: {
        key: 'Escape',
        stopPropagation,
      },
    });

    expect(handled).toBe(true);
    expect(setQuery).toHaveBeenCalledWith('');
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('lets Escape bubble when the query is already empty', () => {
    const setQuery = vi.fn();
    const stopPropagation = vi.fn();

    const handled = handleSearchEscapeKeyDown({
      query: '',
      setQuery,
      event: {
        key: 'Escape',
        stopPropagation,
      },
    });

    expect(handled).toBe(false);
    expect(setQuery).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('shows the minimum-character message for a too-short query', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingInspectionPane, {
        anilistId: 101,
        provider: 'sonarr',
        controller: createController({
          state: {
            query: 'a',
            selected: null,
            lastQuery: '',
            isDirty: false,
          },
        }),
        currentMapping: null,
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).toContain('Enter at least 2 characters to search Sonarr.');
    expect(view).not.toContain('No results found.');
  });
});
