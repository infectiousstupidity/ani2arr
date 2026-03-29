/** Radarr library domain contracts and local type re-exports. */
// src/services/library/radarr/types.ts

import type {
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  MappingExternalId,
} from '@/shared/types';
import type {
  RadarrLookupMovie,
  RadarrMovie,
  RadarrMovieSnapshot,
} from '@/shared/types/providers';
import type {
  LibraryCaches as BaseLibraryCaches,
  LibraryMutationEmitter,
  LibraryStatusOptions,
  LibraryTitleIndexer,
} from '@/services/library/base-library.interface';
import type { ResolveExternalIdOptions, ResolvedMapping } from '@/services/mapping/types';

export type {
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  RadarrMovieSnapshot,
  MappingExternalId,
  RadarrLookupMovie,
  RadarrMovie,
};

export interface RadarrClient {
  getAllMovies(credentials: { url: string; apiKey: string }): Promise<RadarrMovie[]>;
  getMovieByTmdbId(tmdbId: number, credentials: { url: string; apiKey: string }): Promise<RadarrMovie | null>;
  lookupMovieByTmdbId(tmdbId: number, credentials: { url: string; apiKey: string }): Promise<RadarrLookupMovie | null>;
}

export interface MappingResolver {
  resolveExternalId(
    provider: 'radarr',
    anilistId: number,
    options?: ResolveExternalIdOptions,
  ): Promise<ResolvedMapping | null>;
  prioritizeAniListMedia?(anilistId: number, opts?: { schedule?: boolean }): void;
  getLinkedAniListIds?(provider: 'radarr', externalId: MappingExternalId): number[];
}

export interface TitleIndexer extends LibraryTitleIndexer<RadarrMovieSnapshot> {
  findTmdbIdInIndex(payload: CheckMovieStatusPayload): number | null;
}

export type LibraryCaches = BaseLibraryCaches<RadarrMovieSnapshot>;

export type RadarrLibraryStatusOptions = LibraryStatusOptions;

export type LibraryMutationPayload = {
  tmdbId: number;
  action: 'added' | 'removed';
};

export type RadarrLibraryMutationEmitter = LibraryMutationEmitter<LibraryMutationPayload>;
