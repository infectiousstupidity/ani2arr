// src/rpc/schemas.ts
import type { CheckSeriesStatusResponse, MediaMetadataHint, SonarrFormState, RequestPriority } from '@/types';

export interface ResolveInput {
  anilistId: number;
  primaryTitleHint?: string;
  metadata?: MediaMetadataHint | null;
}

export interface MappingOutput {
  tvdbId: number | null;
  successfulSynonym?: string;
}

export interface StatusInput {
  anilistId: number;
  title?: string;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean;
  metadata?: MediaMetadataHint | null;
  priority?: RequestPriority;
}

export type StatusOutput = CheckSeriesStatusResponse;

export interface AddInput {
  anilistId: number;
  title: string;
  primaryTitleHint?: string;
  metadata?: MediaMetadataHint | null;
  form: SonarrFormState;
}

