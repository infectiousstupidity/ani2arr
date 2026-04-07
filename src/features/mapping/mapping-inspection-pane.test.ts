/** Tests for the inspection-first mapping pane helpers and rendering. */
// src/features/mapping/mapping-inspection-pane.test.ts

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MappingInspectionPayload } from '@/mapping/inspection/inspection-types';
import type { MappingSearchController } from './types';
import {
  applySuggestedCandidateSearchShortcut,
  MappingInspectionPaneContent,
  shouldShowManualSearch,
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

describe('mapping inspection pane', () => {
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

  it('keeps manual search immediately reachable when there is no current mapping', () => {
    expect(shouldShowManualSearch({
      currentMapping: null,
      query: '',
      selected: null,
      manualSearchRequested: false,
    })).toBe(true);

    expect(shouldShowManualSearch({
      currentMapping: {
        provider: 'sonarr',
        providerId: 777,
        title: 'Current Mapping',
        inLibrary: true,
      },
      query: '',
      selected: null,
      manualSearchRequested: false,
    })).toBe(false);
  });
});
