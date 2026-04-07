/** Tests for mapping search-row metadata visibility across provider result types. */
// src/features/mapping/mapping-search-panel.test.ts

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MappingSearchController, MappingSearchResult } from './types';

vi.mock('@/shared/ui/primitives/tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

import { MappingSearchPanel } from './mapping-search-panel';

const createController = (results: MappingSearchResult[]): MappingSearchController => ({
  state: {
    query: 'na',
    selected: null,
    lastQuery: 'na',
    isDirty: false,
  },
  searchQuery: {
    data: results,
    isFetching: false,
  },
  setQuery: vi.fn(),
  selectResult: vi.fn(),
});

describe('mapping search panel', () => {
  it('hides Sonarr series-type pills for results that are not already in the library', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingSearchPanel, {
        controller: createController([
          {
            provider: 'sonarr',
            providerId: 100,
            title: 'Search Result',
            typeLabel: 'standard',
            inLibrary: false,
          },
        ]),
        currentMapping: null,
        provider: 'sonarr',
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).not.toContain('standard');
  });

  it('keeps Sonarr series-type pills for results that already exist in the library', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingSearchPanel, {
        controller: createController([
          {
            provider: 'sonarr',
            providerId: 101,
            title: 'Library Result',
            typeLabel: 'daily',
            inLibrary: true,
          },
        ]),
        currentMapping: null,
        provider: 'sonarr',
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).toContain('daily');
  });

  it('hides Radarr type labels for results that are not already in the library', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingSearchPanel, {
        controller: createController([
          {
            provider: 'radarr',
            providerId: 102,
            title: 'Search Result',
            typeLabel: 'Movie',
            inLibrary: false,
          },
        ]),
        currentMapping: null,
        provider: 'radarr',
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).not.toContain('Movie');
  });

  it('hides Radarr type labels even for results already in the library', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingSearchPanel, {
        controller: createController([
          {
            provider: 'radarr',
            providerId: 103,
            title: 'Library Result',
            typeLabel: 'Movie',
            inLibrary: true,
          },
        ]),
        currentMapping: null,
        provider: 'radarr',
        baseUrl: 'https://example.com',
      }),
    );

    expect(view).not.toContain('Movie');
  });
});
