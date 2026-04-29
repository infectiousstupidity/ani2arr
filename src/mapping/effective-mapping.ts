import type { AniListId } from '@/anilist';
import type { Provider, ProviderTargetId } from '@/providers';
import type {
  MappingAcceptedEvidence,
  MappingIdentity,
  MappingSuppressionKind,
  MappingUnknownReason,
} from '@/mapping/types';
import type { AutoMappingRecord } from '@/mapping/auto-mapping/types';

export interface EffectiveMappingCandidate extends MappingIdentity {
  acceptedEvidence?: MappingAcceptedEvidence;
  recentEvaluation?: AutoMappingRecord['recentEvaluation'];
  suppressedProviderId?: ProviderTargetId | null;
  suppressionKind?: MappingSuppressionKind;
  exactUpstreamMatchProviderId?: ProviderTargetId | null;
  resolverState?: AutoMappingRecord['state'];
  mappingUnknownReason?: MappingUnknownReason;
  hadResolveAttempt?: boolean;
}

type EffectiveMapping = Omit<EffectiveMappingCandidate, 'suppressedProviderId' | 'suppressionKind'>;

export interface EffectiveMappingStateInput {
  provider: Provider;
  anilistId: AniListId;
  manualProviderId: ProviderTargetId | null;
  ignored: boolean;
  upstreamProviderIds: readonly ProviderTargetId[];
  rejectedProviderId?: ProviderTargetId | null;
  resolverState: AutoMappingRecord | null;
}

const withRejectedConflict = (
  candidate: EffectiveMappingCandidate,
  rejectedProviderId: ProviderTargetId | null | undefined,
): EffectiveMappingCandidate => {
  if (rejectedProviderId == null) {
    return candidate;
  }

  return {
    ...candidate,
    suppressedProviderId: rejectedProviderId,
    suppressionKind: candidate.suppressionKind ?? 'rejected-candidate',
  };
};

const shouldSuppressRejectedCandidate = (candidate: EffectiveMapping): boolean => (
  candidate.mappingEntryKind !== 'manual' && candidate.mappingEntryKind !== 'upstream'
);

const buildManualMappingIdentity = (
  input: EffectiveMappingStateInput,
  upstreamProviderId: ProviderTargetId | null,
): EffectiveMapping | null => {
  const { provider, anilistId, manualProviderId, resolverState } = input;
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
      ...(resolverState?.state === 'mapped' && resolverState.recentEvaluation
        ? { recentEvaluation: resolverState.recentEvaluation }
        : {}),
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
    resolverState: 'mapped',
    exactUpstreamMatchProviderId: upstreamProviderId,
    hadResolveAttempt: true,
  };
};

export const resolverStateToUnknownReason = (
  resolverState: AutoMappingRecord['state'] | undefined,
): MappingUnknownReason | undefined => {
  switch (resolverState) {
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
  input: EffectiveMappingStateInput,
): EffectiveMapping {
  const { provider, anilistId, ignored, upstreamProviderIds, rejectedProviderId, resolverState } = input;
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

  const manualIdentity = buildManualMappingIdentity(input, upstreamProviderId);
  if (manualIdentity) {
    return manualIdentity;
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
      ...(resolverState?.state === 'mapped' && resolverState.recentEvaluation
        ? { recentEvaluation: resolverState.recentEvaluation }
        : {}),
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
      resolverState: 'ambiguous',
      mappingUnknownReason: 'ambiguous',
      hadResolveAttempt: true,
    };
  }

  if (resolverState?.state === 'mapped') {
    return {
      provider,
      anilistId,
      providerId: resolverState.providerId,
      providerMappingState: 'mapped',
      mappingEntryKind: resolverState.acceptedEvidence.source,
      mappingSource: resolverState.acceptedEvidence.source,
      mappingReason: resolverState.acceptedEvidence.reason,
      acceptedEvidence: resolverState.acceptedEvidence,
      ...(resolverState.recentEvaluation ? { recentEvaluation: resolverState.recentEvaluation } : {}),
      resolverState: 'mapped',
      hadResolveAttempt: resolverState.acceptedEvidence.source === 'auto',
    };
  }

  if (rejectedProviderId != null) {
    return {
      provider,
      anilistId,
      providerId: null,
      providerMappingState: 'unmapped',
      mappingEntryKind: 'rejected',
      hadResolveAttempt: true,
    };
  }

  if (resolverState) {
    const mappingUnknownReason = resolverStateToUnknownReason(resolverState.state);
    return {
      provider,
      anilistId,
      providerId: null,
      providerMappingState: mappingUnknownReason ? 'unknown' : 'unmapped',
      mappingEntryKind: mappingUnknownReason ? 'unknown' : 'unmapped',
      ...(resolverState.recentEvaluation ? { recentEvaluation: resolverState.recentEvaluation } : {}),
      resolverState: resolverState.state,
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
  input: EffectiveMappingStateInput,
): EffectiveMappingCandidate {
  const candidate = buildEffectiveMapping(input);
  const effectiveCandidate: EffectiveMappingCandidate = candidate.mappingEntryKind === 'ignored'
    ? { ...candidate, suppressionKind: 'ignored-entry' }
    : candidate;
  if (!shouldSuppressRejectedCandidate(candidate)) {
    return effectiveCandidate;
  }
  return withRejectedConflict(effectiveCandidate, input.rejectedProviderId);
}
