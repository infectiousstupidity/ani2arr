import { createError, ErrorCode } from '@/shared/errors/error-utils';

type ArrTagLike = {
  id: number;
  label: string;
};

type ArrTagApi<TCredentials, TTag extends ArrTagLike> = {
  getTags(credentials: TCredentials): Promise<TTag[]>;
  createTag(credentials: TCredentials, label: string): Promise<TTag>;
};

interface ResolveArrTagIdsInput<TCredentials, TTag extends ArrTagLike> {
  api: ArrTagApi<TCredentials, TTag>;
  credentials: TCredentials;
  existingIdsFromForm: number[];
  freeformLabelsFromForm: string[];
  existingTags?: TTag[];
  serviceLabel: string;
}

export async function resolveArrTagIds<TCredentials, TTag extends ArrTagLike>(
  input: ResolveArrTagIdsInput<TCredentials, TTag>,
): Promise<number[]> {
  const {
    api,
    credentials,
    existingIdsFromForm,
    freeformLabelsFromForm,
    existingTags,
    serviceLabel,
  } = input;

  const tags = existingTags ?? (await api.getTags(credentials));
  const labelToId = new Map<string, number>();

  for (const tag of tags) {
    if (tag.label && tag.label.trim().length > 0) {
      const trimmed = tag.label.trim();
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

  let refreshedTags: TTag[] | null = null;

  for (const label of labelsToCreate) {
    try {
      const created = await api.createTag(credentials, label);
      if (!created || typeof created.id !== 'number') {
        throw createError(
          ErrorCode.API_ERROR,
          `${serviceLabel} returned invalid tag payload.`,
          `Failed to create tag in ${serviceLabel}.`,
        );
      }
      if (created.label && created.label.trim().length > 0) {
        labelToId.set(created.label.trim(), created.id);
      }
    } catch {
      if (!refreshedTags) {
        refreshedTags = await api.getTags(credentials);
      }
      for (const tag of refreshedTags) {
        if (tag.label && tag.label.trim().length > 0) {
          labelToId.set(tag.label.trim(), tag.id);
        }
      }
    }
  }

  const idsFromFreeform: number[] = [];
  for (const label of normalizedFreeform) {
    const id = labelToId.get(label);
    if (typeof id === 'number') {
      idsFromFreeform.push(id);
      continue;
    }

    throw createError(
      ErrorCode.API_ERROR,
      `Failed to resolve tag ID for label: ${label}`,
      'Unable to resolve tag ID for one or more tags.',
    );
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
