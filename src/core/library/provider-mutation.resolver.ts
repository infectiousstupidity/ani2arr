/** Shared library-mutation resolution helpers for provider add and update flows. */
// src/core/library/provider-mutation.resolver.ts

import { resolveProviderTagIds } from '@/core/library/provider-tags.resolver';
import { createError, ErrorCode } from '@/shared/errors';
import type { ProviderCredentials, ProviderTag } from '@/shared/types/providers';
import { normalizePathForCompare } from '@/shared/utils/provider-library-paths';

type ProviderTagMutationApi = {
  getTags(credentials: ProviderCredentials): Promise<ProviderTag[]>;
  createTag(credentials: ProviderCredentials, label: string): Promise<ProviderTag>;
};

type ResolveRequiredQualityProfileIdInput = {
  value: number | '';
  fallback: number | '' | undefined;
  providerLabel: 'Sonarr' | 'Radarr';
  entityLabel: 'series' | 'movie';
  actionLabel: 'add' | 'update';
};

type ResolveRequiredRootFolderPathInput = {
  value: string;
  fallback: string | undefined;
  providerLabel: 'Sonarr' | 'Radarr';
  entityLabel: 'series' | 'movie';
  actionLabel: 'add' | 'update';
};

export function resolveRequiredQualityProfileId(
  input: ResolveRequiredQualityProfileIdInput,
): number {
  const { value, fallback, providerLabel, entityLabel, actionLabel } = input;
  const resolvedValue =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof fallback === 'number' && Number.isFinite(fallback)
        ? fallback
        : undefined;

  if (typeof resolvedValue !== 'number') {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Missing ${providerLabel} quality profile for ${actionLabel}.`,
      `Select a ${providerLabel} quality profile before ${actionLabel === 'add' ? 'adding' : 'updating'} this ${entityLabel}.`,
    );
  }

  return resolvedValue;
}

export function resolveRequiredRootFolderPath(
  input: ResolveRequiredRootFolderPathInput,
): string {
  const { value, fallback, providerLabel, entityLabel, actionLabel } = input;
  const resolvedValue = value.trim() || fallback?.trim() || '';

  if (!resolvedValue) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `Missing ${providerLabel} root folder for ${actionLabel}.`,
      `Select a ${providerLabel} root folder before ${actionLabel === 'add' ? 'adding' : 'updating'} this ${entityLabel}.`,
    );
  }

  return resolvedValue;
}

export async function resolveMutationTagIds(
  api: ProviderTagMutationApi,
  credentials: ProviderCredentials,
  existingIdsFromForm: number[],
  freeformLabelsFromForm: string[],
  serviceLabel: 'Sonarr' | 'Radarr',
): Promise<number[]> {
  const existingTags = await api.getTags(credentials);

  return resolveProviderTagIds({
    api,
    credentials,
    existingIdsFromForm,
    freeformLabelsFromForm,
    existingTags,
    serviceLabel,
  });
}

export function shouldMoveProviderFiles(
  currentPath: string | null | undefined,
  nextPath: string,
): boolean {
  const currentPathNormalized = normalizePathForCompare(currentPath);
  const nextPathNormalized = normalizePathForCompare(nextPath);

  return (
    currentPathNormalized !== null &&
    nextPathNormalized !== null &&
    currentPathNormalized !== nextPathNormalized
  );
}
