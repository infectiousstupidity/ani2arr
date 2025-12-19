import type { SonarrApiService } from '@/api/sonarr.api';
import type { SonarrCredentialsPayload, SonarrTag } from '@/shared/types';
import { createError, ErrorCode } from '@/shared/utils/error-handling';

/**
 * Resolves the complete tag ID list for a Sonarr payload, creating freeform tags when needed.
 * Networked behavior lives here instead of shared utils to keep side effects in service code.
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
    } catch (error) {
      // Intentionally swallow tag-creation race errors: tag may already exist, so refresh tags once for the batch and retry lookup.
      // This helps diagnose issues beyond the "tag already exists" race scenario.
      console.error('Failed to create Sonarr tag, attempting to recover by refreshing tags.', {
        label,
        error,
      });
      // Most likely race: tag already exists. Refresh tags once for the batch
      // and retry lookup for this specific label. If it still cannot be resolved,
      // surface the original error instead of assuming a race.
      if (!refreshedTags) {
        refreshedTags = await api.getTags(credentials);
        for (const tag of refreshedTags) {
          if (tag.label && tag.label.trim().length > 0) {
            const trimmed = tag.label.trim();
            idToLabel.set(tag.id, trimmed);
            labelToId.set(trimmed, tag.id);
          }
        }
      }

      // After refresh, if the specific label still does not resolve, rethrow.
      if (!labelToId.has(label)) {
        throw error;
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

  const allIds = [...existingIdsFromForm, ...idsFromFreeform];
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
