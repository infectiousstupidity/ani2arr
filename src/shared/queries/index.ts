/** Shared query barrel for mapping, metadata, and provider hooks. */
// src/shared/queries/index.ts

export * from './query-keys';
export {
  useExtensionOptions,
  usePublicOptions,
  useSaveOptions,
} from '@/options';
export * from './metadata';
export * from '@/debug/anilist-debug.query';
export * from './mapping';
export * from '../providers/sonarr/queries';
export * from '../providers/radarr/queries';
