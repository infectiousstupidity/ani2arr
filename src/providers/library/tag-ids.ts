/** Provider tag lookup and creation workflow for library mutations. */
// src/providers/library/tag-ids.ts

import { createError, ErrorCode } from '@/shared/errors';
import type { ProviderTag } from '@/providers';

type ProviderTagApi<TCredentials> = {
  getTags(credentials: TCredentials): Promise<ProviderTag[]>;
  createTag(credentials: TCredentials, label: string): Promise<ProviderTag>;
};

interface ResolveProviderTagIdsInput<TCredentials> {
  api: ProviderTagApi<TCredentials>;
  credentials: TCredentials;
  existingIdsFromForm: number[];
  freeformLabelsFromForm: string[];
  existingTags?: ProviderTag[];
  serviceLabel: string;
}

type NormalizedProviderTagLabel = {
  displayLabel: string;
  key: string;
};

const normalizeProviderTagLabel = (label: string | null | undefined): NormalizedProviderTagLabel | null => {
  if (typeof label !== 'string') {
    return null;
  }

  const displayLabel = label.trim();
  if (!displayLabel) {
    return null;
  }

  return {
    displayLabel,
    key: displayLabel.toLowerCase(),
  };
};

const addProviderTagsToMap = (tags: ProviderTag[], labelToId: Map<string, number>): void => {
  for (const tag of tags) {
    const normalized = normalizeProviderTagLabel(tag.label);
    if (!normalized || typeof tag.id !== 'number' || Number.isNaN(tag.id)) {
      continue;
    }

    if (!labelToId.has(normalized.key)) {
      labelToId.set(normalized.key, tag.id);
    }
  }
};

export async function resolveProviderTagIds<TCredentials>(
  input: ResolveProviderTagIdsInput<TCredentials>,
): Promise<number[]> {
  const {
    api,
    credentials,
    existingIdsFromForm,
    freeformLabelsFromForm,
    existingTags,
    serviceLabel,
  } = input;

  const labelToId = new Map<string, number>();
  addProviderTagsToMap(existingTags ?? (await api.getTags(credentials)), labelToId);

  const normalizedFreeform: NormalizedProviderTagLabel[] = [];
  for (const label of freeformLabelsFromForm) {
    const normalized = normalizeProviderTagLabel(label);
    if (normalized) {
      normalizedFreeform.push(normalized);
    }
  }

  const labelsToCreate: NormalizedProviderTagLabel[] = [];
  const seenCreateKeys = new Set<string>();

  for (const normalized of normalizedFreeform) {
    if (!labelToId.has(normalized.key) && !seenCreateKeys.has(normalized.key)) {
      seenCreateKeys.add(normalized.key);
      labelsToCreate.push(normalized);
    }
  }

  for (const normalized of labelsToCreate) {
    try {
      const created = await api.createTag(credentials, normalized.displayLabel);
      const createdLabel = normalizeProviderTagLabel(created.label);

      if (!createdLabel || typeof created.id !== 'number' || Number.isNaN(created.id)) {
        throw createError(
          ErrorCode.API_ERROR,
          `${serviceLabel} returned invalid tag payload.`,
          `Failed to create tag in ${serviceLabel}.`,
        );
      }

      if (!labelToId.has(createdLabel.key)) {
        labelToId.set(createdLabel.key, created.id);
      }
    } catch (error) {
      addProviderTagsToMap(await api.getTags(credentials), labelToId);

      if (labelToId.has(normalized.key)) {
        continue;
      }

      throw error;
    }
  }

  const idsFromFreeform: number[] = [];

  for (const normalized of normalizedFreeform) {
    const id = labelToId.get(normalized.key);
    if (typeof id === 'number') {
      idsFromFreeform.push(id);
      continue;
    }

    throw createError(
      ErrorCode.API_ERROR,
      `Failed to resolve tag ID for label: ${normalized.displayLabel}`,
      'Unable to resolve tag ID for one or more tags.',
    );
  }

  const deduped: number[] = [];
  const seenIds = new Set<number>();

  for (const id of [...existingIdsFromForm, ...idsFromFreeform]) {
    if (typeof id !== 'number' || Number.isNaN(id) || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    deduped.push(id);
  }

  return deduped;
}
