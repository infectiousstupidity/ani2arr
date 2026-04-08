/** Tests for the target-side preview panel labels and actions across modal modes. */
// src/features/mapping/mapping-preview-panel.test.tsx

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MappingInspectionPayload } from '@/mapping/inspection/inspection-types';

const { mockUseMappingInspection } = vi.hoisted(() => ({
  mockUseMappingInspection: vi.fn(),
}));

vi.mock('@/shared/queries', () => ({
  useMappingInspection: mockUseMappingInspection,
}));

vi.mock('@/shared/ui/primitives/tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

import { MappingPreviewPanel } from './mapping-preview-panel';

const createInspectionPayload = (): MappingInspectionPayload => ({
  effectiveMapping: {
    provider: 'sonarr',
    anilistId: 101,
    providerId: 700,
    status: 'in-library',
    libraryStatus: 'in-provider',
  },
  providerContext: {
    provider: 'sonarr',
    providerId: 700,
    linkedAniListIds: [101, 102],
    linkedAniListCount: 2,
  },
  linkedAniListEntries: [],
  whyThisExists: [
    {
      kind: 'resolver-outcome',
      summary: 'Current mapping exists.',
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
});

beforeEach(() => {
  mockUseMappingInspection.mockReset();
  mockUseMappingInspection.mockReturnValue({
    isPending: false,
    error: null,
    data: createInspectionPayload(),
  });
});

describe('mapping preview panel', () => {
  it('uses the change-match label in setup mode', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingPreviewPanel, {
        provider: 'sonarr',
        aniListEntry: {
          id: 101,
          title: 'Source Title',
        },
        baseUrl: 'https://example.com',
        currentMapping: {
          provider: 'sonarr',
          providerId: 700,
          title: 'Current Target',
          typeLabel: 'anime',
          fileCount: 38,
          inLibrary: true,
        },
        previewMapping: null,
        isInMappingMode: false,
        showResetPreview: false,
        onResetPreview: vi.fn(),
        onEditMapping: vi.fn(),
      }),
    );

    expect(view).toContain('CURRENT TARGET DETAILS');
    expect(view).toContain('In library');
    expect(view).toContain('Yes');
    expect(view).toContain('Episodes');
    expect(view).toContain('38');
    expect(view).toContain('Type');
    expect(view).toContain('Anime');
    expect(view).toContain('Change Sonarr match');
    expect(view).toContain('View Advanced Diagnostics');
    expect(view).not.toContain('Current Target');
  });

  it('uses preview labeling and advanced diagnostics in mapping mode', () => {
    const view = renderToStaticMarkup(
      React.createElement(MappingPreviewPanel, {
        provider: 'sonarr',
        aniListEntry: {
          id: 101,
          title: 'Source Title',
        },
        baseUrl: 'https://example.com',
        currentMapping: {
          provider: 'sonarr',
          providerId: 700,
          title: 'Current Target',
          inLibrary: true,
        },
        previewMapping: {
          provider: 'sonarr',
          providerId: 701,
          title: 'Preview Target',
          inLibrary: false,
        },
        isInMappingMode: true,
        showResetPreview: true,
        onResetPreview: vi.fn(),
        onEditMapping: vi.fn(),
      }),
    );

    expect(view).toContain('PREVIEWING SONARR MATCH');
    expect(view).toContain('Confirm selection to replace the current Sonarr target above.');
    expect(view).toContain('Preview Target');
    expect(view).toContain('View Advanced Diagnostics');
  });
});
