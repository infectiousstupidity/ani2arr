// src/features/media-modal/tabs/mapping-tab/hooks/use-mapping-controller.ts
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMappingSearch } from "@/shared/mapping";
import type { MappingSearchResult } from "@/shared/types";
import { useMappingOverrides } from "./use-mapping-overrides";

export interface UseMappingControllerInput {
  service: "sonarr" | "radarr";
  anilistId: number;
  currentMapping: MappingSearchResult | null;
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
  | { type: 'RESET_FROM_CURRENT'; current: MappingSearchResult | null };

function targetsEqual(
  a?: MappingSearchResult["target"] | null,
  b?: MappingSearchResult["target"] | null,
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
      return { ...state, selected: null };
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

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [value, delay]);
  return debounced;
}

export interface UseMappingControllerResult {
  state: MappingTabState;
  setQuery(q: string): void;
  selectResult(r: MappingSearchResult): void;
  clearSelection(): void;
  searchQuery: ReturnType<typeof useMappingSearch>;
  handleSubmit(): Promise<void>;
  handleRevertToAutomatic(): Promise<void>;
  canSubmit: boolean;
  isSubmitting: boolean;
  canRevert: boolean;
}

export function useMappingController(input: UseMappingControllerInput): UseMappingControllerResult {
  const currentTarget = input.currentMapping?.target ?? null;
  const currentRef = useRef<MappingSearchResult["target"] | null>(currentTarget);
  currentRef.current = currentTarget;

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

  const setQuery = useCallback((q: string) => dispatch({ type: 'SET_QUERY', query: q }), []);
  const selectResult = useCallback(
    (r: MappingSearchResult) =>
      dispatch({ type: 'SELECT_RESULT', result: r, isDirty: !targetsEqual(r?.target ?? null, currentRef.current) }),
    [],
  );
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []);

  const canSubmit = Boolean(state.selected && !targetsEqual(state.selected?.target ?? null, currentRef.current));
  const canRevert = Boolean(currentRef.current);

  const handleSubmit = useCallback(async () => {
    if (!state.selected) return;
    setSubmitting(true);
    try {
      await overrides.setOverride(state.selected.target);
      dispatch({ type: 'RESET_FROM_CURRENT', current: input.currentMapping });
    } finally {
      setSubmitting(false);
    }
  }, [input.currentMapping, overrides, state.selected]);

  const handleRevertToAutomatic = useCallback(async () => {
    setSubmitting(true);
    try {
      await overrides.clearOverride();
      dispatch({ type: 'RESET_FROM_CURRENT', current: null });
    } finally {
      setSubmitting(false);
    }
  }, [overrides]);

  return {
    state,
    setQuery,
    selectResult,
    clearSelection,
    searchQuery,
    handleSubmit,
    handleRevertToAutomatic,
    canSubmit,
    isSubmitting,
    canRevert,
  };
}

export type { MappingSearchResult };