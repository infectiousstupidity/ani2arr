import type { AniListId } from '@/anilist';
import type { Provider, ProviderTargetId } from '@/providers';
import type {
  MappingAcceptedEvidence,
  MappingIdentity,
  MappingSuppressionKind,
  MappingUnknownReason,
} from '@/mapping/types';
import type { AutoMappingRecord } from '@/mapping/auto-mapping/types';

export interface EffectiveMappingWithSuppression extends MappingIdentity {
  acceptedEvidence?: MappingAcceptedEvidence;
  recentEvaluation?: AutoMappingRecord['recentEvaluation'];
  suppressedProviderId?: ProviderTargetId | null;
  suppressionKind?: MappingSuppressionKind;
  exactUpstreamMatchProviderId?: ProviderTargetId | null;
  autoMappingStatus?: AutoMappingRecord['state'];
  /** @deprecated Use autoMappingStatus. Kept for existing response projections. */
  resolverState?: AutoMappingRecord['state'];
  mappingUnknownReason?: MappingUnknownReason;
  hadResolveAttempt?: boolean;
}

export type EffectiveMapping = Omit<EffectiveMappingWithSuppression, 'suppressedProviderId' | 'suppressionKind'>;

export interface EffectiveMappingInput {
  provider: Provider;
  anilistId: AniListId;
  manualProviderId: ProviderTargetId | null;
  ignored: boolean;
  upstreamProviderIds: readonly ProviderTargetId[];
  rejectedCandidateProviderId?: ProviderTargetId | null;
  autoMappingRecord: AutoMappingRecord | null;
}

const withRejectedSuppression = (
  effectiveMapping: EffectiveMappingWithSuppression,
  rejectedCandidateProviderId: ProviderTargetId | null | undefined,
): EffectiveMappingWithSuppression => (
  rejectedCandidateProviderId == null
    ? effectiveMapping
    : {
        ...effectiveMapping,
        suppressedProviderId: rejectedCandidateProviderId,
        suppressionKind: effectiveMapping.suppressionKind ?? 'rejected-candidate',
      }
);

const shouldApplyRejectedSuppression = (effectiveMapping: EffectiveMapping): boolean => (
  effectiveMapping.mappingEntryKind !== 'manual' && effectiveMapping.mappingEntryKind !== 'upstream'
);

const buildManualEffectiveMapping = (
  input: EffectiveMappingInput,
  upstreamProviderId: ProviderTargetId | null,
): EffectiveMapping | null => {
  const { provider, anilistId, manualProviderId, autoMappingRecord } = input;
  if (manualProviderId === null) {
    return null;
  }

  if (upstreamProviderId !== null && upstreamProviderId === manualProviderId) {
    return {
      provider,
      anilistId,
      providerId: manualProviderId,
      providerMappingState: 'mapped',
      mappingEntryKind: 'upstream',
      mappingSource: 'upstream',
      mappingReason: 'exact-upstream',
      acceptedEvidence: {
        source: 'upstream',
        reason: 'exact-upstream',
      },
      ...(autoMappingRecord?.state === 'mapped' && autoMappingRecord.recentEvaluation
        ? { recentEvaluation: autoMappingRecord.recentEvaluation }
        : {}),
      autoMappingStatus: 'mapped',
      resolverState: 'mapped',
      hadResolveAttempt: true,
    };
  }

  return {
    provider,
    anilistId,
    providerId: manualProviderId,
    providerMappingState: 'mapped',
    mappingEntryKind: 'manual',
    mappingSource: 'manual',
    mappingReason: 'manual-override',
    acceptedEvidence: {
      source: 'manual',
      reason: 'manual-override',
    },
    autoMappingStatus: 'mapped',
    resolverState: 'mapped',
    exactUpstreamMatchProviderId: upstreamProviderId,
    hadResolveAttempt: true,
  };
};

export const autoMappingStatusToUnknownReason = (
  autoMappingStatus: AutoMappingRecord['state'] | undefined,
): MappingUnknownReason | undefined => {
  switch (autoMappingStatus) {
    case 'ambiguous': {
      return 'ambiguous';
    }
    case 'verification-failed': {
      return 'verification-failed';
    }
    default: {
      return undefined;
    }
  }
};

export function buildEffectiveMapping(
  input: EffectiveMappingInput,
): EffectiveMapping {
  const { provider, anilistId, ignored, upstreamProviderIds, rejectedCandidateProviderId, autoMappingRecord } = input;
  const upstreamProviderId = upstreamProviderIds.length === 1 ? upstreamProviderIds[0]! : null;
  const hasAmbiguousUpstream = upstreamProviderIds.length > 1;

  if (ignored) {
    return {
      provider,
      anilistId,
      providerId: null,
      providerMappingState: 'unmapped',
      mappingEntryKind: 'ignored',
      exactUpstreamMatchProviderId: upstreamProviderId,
      hadResolveAttempt: true,
    };
  }

  const manualEffectiveMapping = buildManualEffectiveMapping(input, upstreamProviderId);
  if (manualEffectiveMapping) {
    return manualEffectiveMapping;
  }

  if (upstreamProviderId !== null) {
    return {
      provider,
      anilistId,
      providerId: upstreamProviderId,
      providerMappingState: 'mapped',
      mappingEntryKind: 'upstream',
      mappingSource: 'upstream',
      mappingReason: 'exact-upstream',
      acceptedEvidence: {
        source: 'upstream',
        reason: 'exact-upstream',
      },
      ...(autoMappingRecord?.state === 'mapped' && autoMappingRecord.recentEvaluation
        ? { recentEvaluation: autoMappingRecord.recentEvaluation }
        : {}),
      autoMappingStatus: 'mapped',
      resolverState: 'mapped',
    };
  }

  if (hasAmbiguousUpstream) {
    return {
      provider,
      anilistId,
      providerId: null,
      providerMappingState: 'unknown',
      mappingEntryKind: 'unknown',
      autoMappingStatus: 'ambiguous',
      resolverState: 'ambiguous',
      mappingUnknownReason: 'ambiguous',
      hadResolveAttempt: true,
    };
  }

  if (autoMappingRecord?.state === 'mapped') {
    return {
      provider,
      anilistId,
      providerId: autoMappingRecord.providerId,
      providerMappingState: 'mapped',
      mappingEntryKind: autoMappingRecord.acceptedEvidence.source,
      mappingSource: autoMappingRecord.acceptedEvidence.source,
      mappingReason: autoMappingRecord.acceptedEvidence.reason,
      acceptedEvidence: autoMappingRecord.acceptedEvidence,
      ...(autoMappingRecord.recentEvaluation ? { recentEvaluation: autoMappingRecord.recentEvaluation } : {}),
      autoMappingStatus: 'mapped',
      resolverState: 'mapped',
      hadResolveAttempt: autoMappingRecord.acceptedEvidence.source === 'auto',
    };
  }

  if (rejectedCandidateProviderId != null) {
    return {
      provider,
      anilistId,
      providerId: null,
      providerMappingState: 'unmapped',
      mappingEntryKind: 'rejected',
      hadResolveAttempt: true,
    };
  }

  if (autoMappingRecord) {
    const mappingUnknownReason = autoMappingStatusToUnknownReason(autoMappingRecord.state);
    return {
      provider,
      anilistId,
      providerId: null,
      providerMappingState: mappingUnknownReason ? 'unknown' : 'unmapped',
      mappingEntryKind: mappingUnknownReason ? 'unknown' : 'unmapped',
      ...(autoMappingRecord.recentEvaluation ? { recentEvaluation: autoMappingRecord.recentEvaluation } : {}),
      autoMappingStatus: autoMappingRecord.state,
      resolverState: autoMappingRecord.state,
      ...(mappingUnknownReason ? { mappingUnknownReason } : {}),
      hadResolveAttempt: true,
    };
  }

  return {
    provider,
    anilistId,
    providerId: null,
    providerMappingState: 'unmapped',
    mappingEntryKind: 'unmapped',
    hadResolveAttempt: false,
  };
}

export function buildEffectiveMappingCandidate(
  input: EffectiveMappingInput,
): EffectiveMappingWithSuppression {
  const effectiveMapping = buildEffectiveMapping(input);
  const effectiveMappingWithSuppression: EffectiveMappingWithSuppression = effectiveMapping.mappingEntryKind === 'ignored'
    ? { ...effectiveMapping, suppressionKind: 'ignored-entry' }
    : effectiveMapping;
  if (!shouldApplyRejectedSuppression(effectiveMapping)) {
    return effectiveMappingWithSuppression;
  }
  return withRejectedSuppression(effectiveMappingWithSuppression, input.rejectedCandidateProviderId);
}
