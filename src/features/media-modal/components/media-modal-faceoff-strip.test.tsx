/** Tests for the persistent source-versus-target strip used by modal surfaces. */
// src/features/media-modal/components/media-modal-faceoff-strip.test.tsx

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaModalFaceoffStrip } from './media-modal-faceoff-strip';

describe('media modal faceoff strip', () => {
  it('renders the current source and current target when no preview is selected', () => {
    const view = renderToStaticMarkup(
      React.createElement(MediaModalFaceoffStrip, {
        sourceTitle: 'Source Title',
        sourceCoverImage: null,
        sourceFormat: 'TV',
        sourceYear: 2024,
        sourceAniListId: 101,
        provider: 'sonarr',
        baseUrl: 'https://example.com',
        currentMapping: {
          provider: 'sonarr',
          providerId: 700,
          title: 'Current Target',
          inLibrary: true,
        },
      }),
    );

    expect(view).toContain('SOURCE: ANILIST');
    expect(view).toContain('Source Title');
    expect(view).toContain('AniList 101');
    expect(view).toContain('TARGET: SONARR');
    expect(view).toContain('Current Target');
    expect(view).not.toContain('No match selected');
  });

  it('renders the preview target when a new mapping is selected', () => {
    const view = renderToStaticMarkup(
      React.createElement(MediaModalFaceoffStrip, {
        sourceTitle: 'Source Title',
        sourceCoverImage: null,
        sourceFormat: 'MOVIE',
        sourceYear: 2022,
        sourceAniListId: 102,
        provider: 'radarr',
        baseUrl: 'https://example.com',
        currentMapping: {
          provider: 'radarr',
          providerId: 800,
          title: 'Current Movie',
          inLibrary: false,
        },
      }),
    );

    expect(view).toContain('TARGET: RADARR');
    expect(view).toContain('Current Movie');
    expect(view).toContain('Current target');
  });
});
