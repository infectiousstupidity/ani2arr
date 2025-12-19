import type { SonarrApiService } from '@/api/sonarr.api';
import type { SonarrCredentialsPayload, SonarrTag } from '@/shared/types';
import { createError, ErrorCode } from '@/shared/errors/error-utils';

/**
 * Resolves the complete tag ID list for a Sonarr payload, creating freeform tags when needed.
 * Networked behavior lives alongside API flows to keep side effects out of generic utils.
 */
export async function resolveSonarrTagIds(
  api: SonarrApiService,
  credentials: SonarrCredentialsPayload,
  existingIdsFromForm: number[],
  freeformLabelsFromForm: string[],
  existingTags?: SonarrTag[],
): Promise<number[]> {
  const tags = existingTags ?? (await api.getTags(credentials));
  const idToLabel = new Map<number, string>();
  const labelToId = new Map<string, number>();

  for (const tag of tags) {
    if (tag.label && tag.label.trim().length > 0) {
      const trimmed = tag.label.trim();
      idToLabel.set(tag.id, trimmed);
      labelToId.set(trimmed, tag.id);
    }
  }

  const normalizedFreeform = freeformLabelsFromForm
    .filter(label => label && label.trim().length > 0)
    .map(label => label.trim());

  const labelsToCreate: string[] = [];
  const seenCreate = new Set<string>();

  for (const label of normalizedFreeform) {
    if (!labelToId.has(label) && !seenCreate.has(label)) {
      seenCreate.add(label);
      labelsToCreate.push(label);
    }
  }

  let refreshedTags: SonarrTag[] | null = null;

  for (const label of labelsToCreate) {
    try {
      const created = await api.createTag(credentials, label);
      if (!created || typeof created.id !== 'number') {
        throw createError(
          ErrorCode.API_ERROR,
          'Sonarr returned invalid tag payload.',
          'Failed to create tag in Sonarr.',
        );
      }
      if (created.label && created.label.trim().length > 0) {
        const trimmed = created.label.trim();
        idToLabel.set(created.id, trimmed);
        labelToId.set(trimmed, created.id);
      }
    } catch {
      // Race: tag already exists, refresh tags once for the batch and retry lookup
      if (!refreshedTags) {
        refreshedTags = await api.getTags(credentials);
      }
      for (const tag of refreshedTags) {
        if (tag.label && tag.label.trim().length > 0) {
          const trimmed = tag.label.trim();
          idToLabel.set(tag.id, trimmed);
          labelToId.set(trimmed, tag.id);
        }
      }
    }
  }

  const idsFromFreeform: number[] = [];
  for (const label of normalizedFreeform) {
    const id = labelToId.get(label);
    if (typeof id === 'number') {
      idsFromFreeform.push(id);
    } else {
      throw createError(
        ErrorCode.API_ERROR,
        `Failed to resolve tag ID for label: ${label}`,
        'Unable to resolve tag ID for one or more tags.',
      );
    }
  }

  const allIds = [...(existingIdsFromForm ?? []), ...idsFromFreeform];
  const deduped: number[] = [];
  const seenIds = new Set<number>();

  for (const id of allIds) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      deduped.push(id);
    }
  }

  return deduped;
}
