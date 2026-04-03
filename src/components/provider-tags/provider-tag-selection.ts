/** Pure label and id mapping helpers for reusable provider tag selection UI. */
// src/components/provider-tags/provider-tag-selection.ts

import type { ProviderTag } from '@/integrations/providers';

export interface ProviderTagMaps {
  idToLabel: Map<number, string>;
  labelToId: Map<string, number>;
}

const normalizeProviderTagLabel = (label: string | null | undefined): string | null => {
  const trimmed = label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export function buildProviderTagMaps(tags: ReadonlyArray<ProviderTag>): ProviderTagMaps {
  const idToLabel = new Map<number, string>();
  const labelToId = new Map<string, number>();

  for (const tag of tags) {
    const label = normalizeProviderTagLabel(tag.label);
    if (!label) {
      continue;
    }

    idToLabel.set(tag.id, label);
    labelToId.set(label, tag.id);
  }

  return { idToLabel, labelToId };
}

export function deriveSelectedProviderTagLabels(
  selectedTagIds: ReadonlyArray<number> | null | undefined,
  selectedFreeformTags: ReadonlyArray<string> | null | undefined,
  idToLabel: ReadonlyMap<number, string>,
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const tagId of selectedTagIds ?? []) {
    const label = idToLabel.get(tagId);
    if (!label || seen.has(label)) {
      continue;
    }

    seen.add(label);
    labels.push(label);
  }

  for (const freeformTag of selectedFreeformTags ?? []) {
    const label = normalizeProviderTagLabel(freeformTag);
    if (!label || seen.has(label)) {
      continue;
    }

    seen.add(label);
    labels.push(label);
  }

  return labels;
}

export function splitProviderTagLabels(
  labels: ReadonlyArray<string>,
  labelToId: ReadonlyMap<string, number>,
): { tagIds: number[]; freeformTags: string[] } {
  const uniqueLabels: string[] = [];
  const seen = new Set<string>();

  for (const value of labels) {
    const label = normalizeProviderTagLabel(value);
    if (!label || seen.has(label)) {
      continue;
    }

    seen.add(label);
    uniqueLabels.push(label);
  }

  const tagIds: number[] = [];
  const freeformTags: string[] = [];

  for (const label of uniqueLabels) {
    const tagId = labelToId.get(label);
    if (typeof tagId === 'number') {
      tagIds.push(tagId);
      continue;
    }

    freeformTags.push(label);
  }

  return { tagIds, freeformTags };
}
