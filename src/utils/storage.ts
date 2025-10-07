// src/utils/storage.ts

/**
 * @file Defines and exports user-configurable extension settings.
 * This file uses `@wxt-dev/storage` for its powerful features like
 * versioning, defaults, and cross-device synchronization ('sync' storage).
 */
import { storage } from '@wxt-dev/storage';
import type { ExtensionOptions } from '../types';

/**
 * A factory function that returns the default state for the extension options.
 * This ensures a consistent default object is always available.
 */
const getDefaultOptions = (): ExtensionOptions => ({
  sonarrUrl: '',
  sonarrApiKey: '',
  defaults: {
    qualityProfileId: '',
    rootFolderPath: '',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    tags: [],
  }
});

/**
 * The primary storage item for all user-configured settings.
 *
 * - It is stored in `local` storage (device-only, not synced to browser account)
 *   to keep Sonarr credentials local and avoid exposing them to cloud sync.
 * - It uses a `fallback` to provide default values if none are set.
 * - It is versioned to allow for future migrations if the options structure changes.
 */
export const extensionOptions = storage.defineItem<ExtensionOptions>('local:options', {
  fallback: getDefaultOptions(),
  version: 1,
});