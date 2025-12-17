import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useDebounced } from '@/shared/hooks/common/use-debounced';
import { useMappingSearch } from './use-mapping-search';
import type { MappingSearchResult } from '@/shared/types';
import { useMappingOverrides } from './use-mapping-overrides';
import type { MappingSearchController } from './types';

export interface UseMappingControllerInput {
  service: 'sonarr' | 'radarr';
  anilistId: number;
  currentMapping: MappingSearchResult | null;
  overrideActive: boolean;
}

export interface MappingTabState {
  query: string;
  lastQuery: string;
  selected: MappingSearchResult | null;
  isDirty: boolean;
}

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SELECT_RESULT'; result: MappingSearchResult; isDirty: boolean }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET_FROM_CURRENT' };

function targetsEqual(
  a?: MappingSearchResult['target'] | null,
  b?: MappingSearchResult['target'] | null,
): boolean {
  if (!a || !b) return false;
  return a.id === b.id && a.idType === b.idType;
}

function reducer(state: MappingTabState, action: Action): MappingTabState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.query };
    case 'SELECT_RESULT':
      return {
        ...state,
        selected: action.result,
        lastQuery: state.query,
        isDirty: action.isDirty,
      };
    case 'CLEAR_SELECTION':
      return { ...state, selected: null, isDirty: false };
    case 'RESET_FROM_CURRENT':
      return {
        query: '',
        lastQuery: '',
        selected: null,
        isDirty: false,
      };
    default:
      return state;
  }
}

// Debounced hook moved to shared `useDebounced`

type OptimisticState = 'set' | 'clear' | null;

export interface UseMappingControllerResult extends MappingSearchController {
  currentMapping: MappingSearchResult | null;
  clearSelection(): void;
  resetToCurrent(): void;
  handleSubmit(options?: { force?: boolean }): Promise<void>;
  handleRevertToAutomatic(): Promise<void>;
  canSubmit: boolean;
  isSubmitting: boolean;
  canRevert: boolean;
}

export function useMappingController(input: UseMappingControllerInput): UseMappingControllerResult {
  const [state, dispatch] = useReducer(reducer, {
    query: '',
    lastQuery: '',
    selected: null,
    isDirty: false,
  } satisfies MappingTabState);

  const overrides = useMappingOverrides(input.anilistId);

  const debouncedQuery = useDebounced(state.query, 300);
  const searchQuery = useMappingSearch({
    service: input.service,
    query: debouncedQuery,
    enabled: debouncedQuery.trim().length >= 2,
  });

  const [isSubmitting, setSubmitting] = useState(false);
  const [optimisticMapping, setOptimisticMapping] = useState<MappingSearchResult | null>(null);
  const [optimisticOverrideState, setOptimisticOverrideState] = useState<OptimisticState>(null);

  useEffect(() => {
    if (
      optimisticOverrideState === 'set' &&
      input.overrideActive &&
      optimisticMapping &&
      input.currentMapping &&
      targetsEqual(optimisticMapping.target, input.currentMapping.target)
    ) {
      setOptimisticOverrideState(null);
    }
    if (optimisticOverrideState === 'clear' && !input.overrideActive && !input.currentMapping) {
      setOptimisticOverrideState(null);
    }
  }, [input.currentMapping, input.overrideActive, optimisticMapping, optimisticOverrideState]);

  const effectiveCurrentMapping = useMemo<MappingSearchResult | null>(() => {
    if (optimisticOverrideState === 'set') {
      if (
        optimisticMapping &&
        input.currentMapping &&
        targetsEqual(optimisticMapping.target, input.currentMapping.target)
      ) {
        return input.currentMapping;
      }
      return optimisticMapping;
    }
    if (optimisticOverrideState === 'clear') {
      return null;
    }
    if (input.currentMapping) return input.currentMapping;
    return optimisticMapping ?? null;
  }, [input.currentMapping, optimisticMapping, optimisticOverrideState]);

  const effectiveTarget = effectiveCurrentMapping?.target ?? null;

  const hasActiveOverride = optimisticOverrideState === 'set' || input.overrideActive === true;

  const setQuery = useCallback((q: string) => dispatch({ type: 'SET_QUERY', query: q }), []);
  const selectResult = useCallback(
    (r: MappingSearchResult) =>
      dispatch({ type: 'SELECT_RESULT', result: r, isDirty: !targetsEqual(r?.target ?? null, effectiveTarget) }),
    [effectiveTarget],
  );
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []);
  const resetToCurrent = useCallback(() => {
    dispatch({ type: 'RESET_FROM_CURRENT' });
  }, []);

  const canSubmit = Boolean(
    state.selected &&
    !targetsEqual(state.selected?.target ?? null, effectiveTarget),
  );

  const handleSubmit = useCallback(async (options?: { force?: boolean }) => {
    if (!state.selected) return;
    setSubmitting(true);
    try {
      await overrides.setOverride(state.selected.target, { force: options?.force === true });
      setOptimisticOverrideState('set');
      setOptimisticMapping(state.selected);
      dispatch({ type: 'RESET_FROM_CURRENT' });
    } finally {
      setSubmitting(false);
    }
  }, [overrides, state.selected]);

  const handleRevertToAutomatic = useCallback(async () => {
    setSubmitting(true);
    try {
      await overrides.clearOverride();
      setOptimisticOverrideState('clear');
      setOptimisticMapping(null);
      dispatch({ type: 'RESET_FROM_CURRENT' });
    } finally {
      setSubmitting(false);
    }
  }, [overrides]);

  return {
    state,
    currentMapping: effectiveCurrentMapping,
    setQuery,
    selectResult,
    clearSelection,
    resetToCurrent,
    searchQuery,
    handleSubmit,
    handleRevertToAutomatic,
    canSubmit,
    isSubmitting,
    canRevert: hasActiveOverride,
  };
}

export type { MappingSearchResult };
