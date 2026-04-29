/** Shared provider action state derivation for content entry points. */

import type { MappingSuppressionKind, ProviderMappingState } from '@/mapping/types';
import type { MappingRowStatus } from '@/mapping/queries/list-mappings';
import type { MappingReviewSummary } from '@/mapping/queries/mapping-issues';

type SteadyProviderActionState = Extract<
  MappingRowStatus,
  'in-library' | 'can-add' | 'unmapped' | 'unknown'
>;

export type ProviderActionState =
  | 'unconfigured'
  | 'checking'
  | 'adding'
  | 'error'
  | SteadyProviderActionState;

export type ProviderPrimaryAction =
  | 'configure'
  | 'quick-add'
  | 'open-mapping'
  | 'retry-status'
  | 'retry-add'
  | 'none';

export type ProviderActionErrorSource = 'status' | 'add' | null;

export interface ProviderActionSummary {
  state: ProviderActionState;
  errorSource: ProviderActionErrorSource;
  hasMapping: boolean;
}

export interface ProviderActionModel extends ProviderActionSummary {
  primaryAction: ProviderPrimaryAction;
  showSetupAction: boolean;
  showMappingAction: boolean;
  showExternalAction: boolean;
  disablePrimaryAction: boolean;
}

export const deriveMappingRowStatus = (input: {
  reviewSummary?: MappingReviewSummary;
  suppressionKind?: MappingSuppressionKind;
  providerMappingState: ProviderMappingState;
  isInLibrary: boolean | null;
}): MappingRowStatus => {
  if (input.reviewSummary) {
    return 'needs-review';
  }
  if (input.suppressionKind) {
    return 'suppressed';
  }
  if (input.providerMappingState === 'unknown') {
    return 'unknown';
  }
  if (input.providerMappingState === 'unmapped') {
    return 'unmapped';
  }
  if (input.isInLibrary === true) {
    return 'in-library';
  }
  if (input.isInLibrary === false) {
    return 'can-add';
  }
  return 'unknown';
};

function toSteadyProviderActionState(input: {
  providerMappingState: ProviderMappingState | null | undefined;
  isInLibrary: boolean | null;
}): SteadyProviderActionState {
  if (!input.providerMappingState) {
    return 'can-add';
  }

  const mappingRowStatus = deriveMappingRowStatus({
    providerMappingState: input.providerMappingState,
    isInLibrary: input.providerMappingState === 'mapped' ? input.isInLibrary : null,
  });

  switch (mappingRowStatus) {
    case 'in-library':
    case 'can-add':
    case 'unmapped':
    case 'unknown': {
      return mappingRowStatus;
    }
    default: {
      return 'unknown';
    }
  }
}

export function deriveProviderActionSummary(input: {
  isConfigured: boolean;
  isChecking: boolean;
  providerMappingState: ProviderMappingState | null | undefined;
  isInLibrary: boolean | null;
  hasStatusError: boolean;
  isAdding: boolean;
  hasAddError: boolean;
  addSucceeded: boolean;
  hasMapping: boolean;
}): ProviderActionSummary {
  const hasResolvedMapping =
    input.hasMapping || input.addSucceeded || input.isInLibrary === true;

  if (input.addSucceeded || input.isInLibrary === true) {
    return {
      state: 'in-library',
      errorSource: null,
      hasMapping: hasResolvedMapping,
    };
  }

  if (input.isAdding) {
    return {
      state: 'adding',
      errorSource: null,
      hasMapping: hasResolvedMapping,
    };
  }

  if (input.isChecking) {
    return {
      state: 'checking',
      errorSource: null,
      hasMapping: hasResolvedMapping,
    };
  }

  if (!input.isConfigured) {
    return {
      state: 'unconfigured',
      errorSource: null,
      hasMapping: false,
    };
  }

  if (input.hasStatusError) {
    return {
      state: 'error',
      errorSource: 'status',
      hasMapping: hasResolvedMapping,
    };
  }

  if (input.hasAddError) {
    return {
      state: 'error',
      errorSource: 'add',
      hasMapping: hasResolvedMapping,
    };
  }

  return {
    state: toSteadyProviderActionState({
      providerMappingState: input.providerMappingState,
      isInLibrary: input.isInLibrary,
    }),
    errorSource: null,
    hasMapping: hasResolvedMapping,
  };
}

function getPrimaryAction(summary: ProviderActionSummary): ProviderPrimaryAction {
  switch (summary.state) {
    case 'unconfigured': {
      return 'configure';
    }
    case 'can-add': {
      return 'quick-add';
    }
    case 'unmapped': {
      return 'open-mapping';
    }
    case 'unknown': {
      return 'retry-status';
    }
    case 'error': {
      return summary.errorSource === 'add' ? 'retry-add' : 'retry-status';
    }
    default: {
      return 'none';
    }
  }
}

export function buildProviderActionModel(input: {
  summary: ProviderActionSummary;
  hasExternalHref: boolean;
  canQuickAdd: boolean;
}): ProviderActionModel {
  const primaryAction = getPrimaryAction(input.summary);
  const disablePrimaryAction =
    input.summary.state === 'checking' ||
    input.summary.state === 'adding' ||
    input.summary.state === 'in-library' ||
    (primaryAction === 'quick-add' && !input.canQuickAdd);

  return {
    ...input.summary,
    primaryAction,
    showSetupAction: input.summary.hasMapping,
    showMappingAction: input.summary.state !== 'unconfigured',
    showExternalAction:
      input.summary.state !== 'unconfigured' && input.hasExternalHref,
    disablePrimaryAction,
  };
}
