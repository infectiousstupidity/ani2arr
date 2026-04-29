import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import {
  MAPPINGS_REVISION_CHANGE_KEY,
  RADARR_LIBRARY_REVISION_CHANGE_KEY,
  SONARR_LIBRARY_REVISION_CHANGE_KEY,
  bumpMappingsRevision,
  bumpProviderLibraryRevision,
  resetAllRevisions,
} from './revisions';

describe('revision signals', () => {
  it('writes named revision signals for mappings and libraries', async () => {
    await bumpMappingsRevision();
    await bumpProviderLibraryRevision('sonarr');
    await bumpProviderLibraryRevision('radarr');

    const stored = await browser.storage.local.get([
      MAPPINGS_REVISION_CHANGE_KEY,
      SONARR_LIBRARY_REVISION_CHANGE_KEY,
      RADARR_LIBRARY_REVISION_CHANGE_KEY,
    ]);

    expect(stored[MAPPINGS_REVISION_CHANGE_KEY]).toEqual(expect.any(Number));
    expect(stored[SONARR_LIBRARY_REVISION_CHANGE_KEY]).toEqual(expect.any(Number));
    expect(stored[RADARR_LIBRARY_REVISION_CHANGE_KEY]).toEqual(expect.any(Number));
  });

  it('clears all revision signals', async () => {
    await bumpMappingsRevision();
    await bumpProviderLibraryRevision('sonarr');

    await resetAllRevisions();

    const stored = await browser.storage.local.get([
      MAPPINGS_REVISION_CHANGE_KEY,
      SONARR_LIBRARY_REVISION_CHANGE_KEY,
      RADARR_LIBRARY_REVISION_CHANGE_KEY,
    ]);

    expect(stored).toEqual({});
  });
});
