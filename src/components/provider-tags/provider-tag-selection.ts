/** Pure label and id mapping helpers for reusable provider tag selection UI. */
// src/components/provider-tags/provider-tag-selection.ts

import type { ProviderTag, ProviderTagId } from '@/providers';

export interface ProviderTagMaps {
  idToLabel: Map<ProviderTagId, string>;
  lookupKeyToId: Map<string, ProviderTagId>;
  existingLabels: string[];
}

const normalizeProviderTagLabel = (label: string | null | undefined): string | null => {
  const trimmed = label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const toProviderTagLookupKey = (label: string): string => label.toLocaleLowerCase();

export function buildProviderTagMaps(tags: ReadonlyArray<ProviderTag>): ProviderTagMaps {
  const idToLabel = new Map<ProviderTagId, string>();
  const lookupKeyToId = new Map<string, ProviderTagId>();
  const existingLabels: string[] = [];
  const seenLookupKeys = new Set<string>();

  for (const tag of tags) {
    const label = normalizeProviderTagLabel(tag.label);
    if (!label) {
      continue;
    }

    const lookupKey = toProviderTagLookupKey(label);

    idToLabel.set(tag.id, label);

    if (!lookupKeyToId.has(lookupKey)) {
      lookupKeyToId.set(lookupKey, tag.id);
    }

    if (!seenLookupKeys.has(lookupKey)) {
      seenLookupKeys.add(lookupKey);
      existingLabels.push(label);
    }
  }

  return { idToLabel, lookupKeyToId, existingLabels };
}

export function deriveSelectedProviderTagLabels(
  selectedTagIds: ReadonlyArray<ProviderTagId> | null | undefined,
  selectedFreeformTags: ReadonlyArray<string> | null | undefined,
  idToLabel: ReadonlyMap<ProviderTagId, string>,
): string[] {
  const labels: string[] = [];
  const seenLookupKeys = new Set<string>();

  for (const tagId of selectedTagIds ?? []) {
    const label = idToLabel.get(tagId);
    if (!label) {
      continue;
    }

    const lookupKey = toProviderTagLookupKey(label);
    if (seenLookupKeys.has(lookupKey)) {
      continue;
    }

    seenLookupKeys.add(lookupKey);
    labels.push(label);
  }

  for (const freeformTag of selectedFreeformTags ?? []) {
    const label = normalizeProviderTagLabel(freeformTag);
    if (!label) {
      continue;
    }

    const lookupKey = toProviderTagLookupKey(label);
    if (seenLookupKeys.has(lookupKey)) {
      continue;
    }

    seenLookupKeys.add(lookupKey);
    labels.push(label);
  }

  return labels;
}

export function splitProviderTagLabels(
  labels: ReadonlyArray<string>,
  lookupKeyToId: ReadonlyMap<string, ProviderTagId>,
): { tagIds: ProviderTagId[]; freeformTags: string[] } {
  const uniqueLabels: string[] = [];
  const seenLookupKeys = new Set<string>();

  for (const value of labels) {
    const label = normalizeProviderTagLabel(value);
    if (!label) {
      continue;
    }

    const lookupKey = toProviderTagLookupKey(label);
    if (seenLookupKeys.has(lookupKey)) {
      continue;
    }

    seenLookupKeys.add(lookupKey);
    uniqueLabels.push(label);
  }

  const tagIds: ProviderTagId[] = [];
  const freeformTags: string[] = [];

  for (const label of uniqueLabels) {
    const lookupKey = toProviderTagLookupKey(label);
    const tagId = lookupKeyToId.get(lookupKey);

    if (typeof tagId === 'number') {
      tagIds.push(tagId);
    } else {
      freeformTags.push(label);
    }
  }

  return { tagIds, freeformTags };
}
