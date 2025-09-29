// src/rpc/schemas.ts
import type { CheckSeriesStatusResponse, SonarrFormState } from '@/types';

export interface ResolveInput {
  anilistId: number;
  primaryTitleHint?: string;
}

export interface MappingOutput {
  tvdbId: number;
  successfulSynonym?: string;
}

export interface StatusInput {
  anilistId: number;
  title?: string;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean;
}

export type StatusOutput = CheckSeriesStatusResponse;

export interface AddInput {
  anilistId: number;
  title: string;
  primaryTitleHint?: string;
  form: SonarrFormState;
}

