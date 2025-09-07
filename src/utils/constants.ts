// src/utils/constants.ts

/**
 * @file Defines static, shared constants used throughout the extension.
 */
import { SonarrMonitorOption } from '../types';

/**
 * Defines the options and descriptive text for the 'Monitor' dropdown menus
 * in the UI. Sourced directly from Sonarr's API documentation.
 */
export const MONITOR_OPTIONS_WITH_DESCRIPTIONS = [
  { value: 'all' as SonarrMonitorOption, label: 'All Episodes', description: 'Monitor all episodes except specials.' },
  { value: 'future' as SonarrMonitorOption, label: 'Future Episodes', description: 'Monitor episodes that have not aired yet.' },
  { value: 'missing' as SonarrMonitorOption, label: 'Missing Episodes', description: 'Monitor episodes that do not have files or have not aired yet.' },
  { value: 'existing' as SonarrMonitorOption, label: 'Existing Episodes', description: 'Monitor episodes that have files or have not aired yet.' },
  { value: 'firstSeason' as SonarrMonitorOption, label: 'First Season', description: 'Monitor all episodes of the first season. All other seasons will be ignored.' },
  { value: 'lastSeason' as SonarrMonitorOption, label: 'Last Season', description: 'Monitor all episodes of the last season.' },
  { value: 'pilot' as SonarrMonitorOption, label: 'Pilot Episode', description: 'Only monitor the first episode of the first season.' },
  { value: 'recent' as SonarrMonitorOption, label: 'Recent Episodes', description: 'Monitor episodes aired within the last 90 days and future episodes.' },
  { value: 'monitorSpecials' as SonarrMonitorOption, label: 'Monitor Specials', description: 'Monitor all special episodes without changing the monitored status of other episodes.' },
  { value: 'unmonitorSpecials' as SonarrMonitorOption, label: 'Unmonitor Specials', description: 'Unmonitor all special episodes without changing the monitored status of other episodes.' },
  { value: 'none' as SonarrMonitorOption, label: 'None', description: 'No episodes will be monitored.' },
];

/**
 * Defines the options and descriptive text for the 'Series Type' dropdown menus.
 */
export const SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS = [
  { value: 'anime', label: 'Anime', description: 'Episodes released using an absolute episode number.' },
  { value: 'daily', label: 'Daily', description: 'Episodes released daily or less frequently that use year-month-day (2023-08-04).' },
  { value: 'standard', label: 'Standard', description: 'Episodes released with SxxEyy pattern.' },
];

/**
 * The cache Time-To-Live (TTL) for an individual series' status check.
 * This cache is for the `sonarrStatusBatcher` and prevents re-checking the same
 * series multiple times within a short period on dynamic pages.
 *
 * NOTE: This is different from the main Sonarr series list cache, which uses a
 * stale-while-revalidate strategy.
 */
export const SERIES_STATUS_TTL_MS = 5 * 60 * 1_000; // 5 minutes