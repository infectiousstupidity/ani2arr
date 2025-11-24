// src/shared/utils/sonarr-tags.ts
import type { SonarrTag, SonarrCredentialsPayload } from "@/shared/types";
import { createError, ErrorCode } from "@/shared/utils/error-handling";
import { SonarrApiService } from "@/api/sonarr.api";

const sonarrApi = new SonarrApiService();

export async function resolveSonarrTagIds(
  credentials: SonarrCredentialsPayload,
  existingIdsFromForm: number[],
  freeformLabelsFromForm: string[],
  existingTags: SonarrTag[],
): Promise<number[]> {
  const idToLabel = new Map<number, string>();
  const labelToId = new Map<string, number>();

  for (const tag of existingTags) {
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

  for (const label of labelsToCreate) {
    try {
      const created = await sonarrApi.createTag(credentials, label);
      if (!created || typeof created.id !== "number") {
        throw createError(
          ErrorCode.UNKNOWN_ERROR,
          "Sonarr returned invalid tag payload.",
          "Failed to create tag in Sonarr.",
        );
      }
      if (created.label && created.label.trim().length > 0) {
        const trimmed = created.label.trim();
        idToLabel.set(created.id, trimmed);
        labelToId.set(trimmed, created.id);
      }
    } catch {
      // Race: tag already exists, refresh tags once and retry lookup
      const refreshed = await sonarrApi.getTags(credentials);
      for (const tag of refreshed) {
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
    if (typeof id === "number") {
      idsFromFreeform.push(id);
    } else {
      throw createError(
        ErrorCode.UNKNOWN_ERROR,
        `Failed to resolve tag ID for label: ${label}`,
        "Unable to resolve tag ID for one or more tags.",
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
