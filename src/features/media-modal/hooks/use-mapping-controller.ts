/** Owns manual mapping state and actions for the media modal. */
// src/features/media-modal/hooks/use-mapping-controller.ts

import { useCallback, useState } from "react";
import type { AniListId } from "@/anilist";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import {
	createProviderMappingTarget,
	type EffectiveMappingKind,
	type ProviderExternalId,
} from "@/mapping/types";
import type { Provider } from "@/providers";
import { useDebounced } from "@/shared/hooks/use-debounced";
import {
	useClearManualMapping,
	useClearMappingRejectedCandidate,
	useSetMappingIgnore,
	useSetManualMapping,
	useSetMappingRejectedCandidate,
} from "@/shared/queries";
import { useMappingSearch } from "./use-mapping-search";

type AuthoritativeMappingState = {
	mappingEntryKind: EffectiveMappingKind;
	suppressedProviderId?: ProviderExternalId | null;
	providerId: ProviderExternalId | null;
};

export interface MappingControllerState {
	query: string;
	results: MappingSearchResult[];
	isSearching: boolean;
	selectedResult: MappingSearchResult | null;
	previewMapping: MappingSearchResult | null;
	effectiveMapping: MappingSearchResult | null;
	isDirty: boolean;
	canSubmit: boolean;
	canRevert: boolean;
	canIgnoreTitle: boolean;
	canRejectCandidate: boolean;
	canClearRejectedCandidate: boolean;
	rejectCandidateProviderId: ProviderExternalId | null;
	clearRejectedCandidateProviderId: ProviderExternalId | null;
	isSubmitting: boolean;
	isReverting: boolean;
	isIgnoring: boolean;
	isRejectingCandidate: boolean;
	isClearingRejectedCandidate: boolean;
}

export interface MappingControllerActions {
	setQuery(query: string): void;
	selectResult(result: MappingSearchResult): void;
	clearSelection(): void;
	resetDraft(): void;
	submitSelection(options?: { force?: boolean }): Promise<boolean>;
	revertToAutomatic(): Promise<boolean>;
	ignoreTitle(): Promise<boolean>;
	rejectCandidate(): Promise<boolean>;
	clearRejectedCandidate(): Promise<boolean>;
}

export interface MappingController {
	state: MappingControllerState;
	actions: MappingControllerActions;
}

type DraftState = {
	scopeKey: string;
	query: string;
	selectedDraft: MappingSearchResult | null;
};

function getScopeKey(input: {
	provider: Provider;
	anilistId: AniListId;
}): string {
	return `${input.provider}:${input.anilistId}`;
}

function createEmptyDraft(scopeKey: string): DraftState {
	return { scopeKey, query: "", selectedDraft: null };
}

function targetsEqual(
	a?: Pick<MappingSearchResult, "provider" | "providerId"> | null,
	b?: Pick<MappingSearchResult, "provider" | "providerId"> | null,
): boolean {
	return (
		!!a && !!b && a.provider === b.provider && a.providerId === b.providerId
	);
}

export function isSelectedDraftDirty(input: {
	selectedDraft: MappingSearchResult | null;
	effectiveMapping: MappingSearchResult | null;
}): boolean {
	return (
		input.selectedDraft !== null &&
		!targetsEqual(input.selectedDraft, input.effectiveMapping)
	);
}

function getRejectCandidateProviderId(input: {
	authoritativeMapping: AuthoritativeMappingState | null | undefined;
	manualMappingActive: boolean;
}): ProviderExternalId | null {
	if (input.manualMappingActive) {
		return null;
	}

	const authoritativeMapping = input.authoritativeMapping;
	if (!authoritativeMapping) {
		return null;
	}

	if (
		(authoritativeMapping.mappingEntryKind === "auto" ||
			authoritativeMapping.mappingEntryKind === "upstream") &&
		authoritativeMapping.providerId != null
	) {
		return authoritativeMapping.providerId;
	}

	return null;
}

function getClearRejectedCandidateProviderId(
	authoritativeMapping: AuthoritativeMappingState | null | undefined,
): ProviderExternalId | null {
	return authoritativeMapping?.suppressedProviderId ?? null;
}

export function useMediaModalMappingController(input: {
	provider: Provider;
	anilistId: AniListId;
	currentMapping: MappingSearchResult | null;
	manualMappingActive: boolean;
	authoritativeMapping?: AuthoritativeMappingState | null;
}): MappingController {
	const scopeKey = getScopeKey(input);

	const [draft, setDraft] = useState<DraftState>(() =>
		createEmptyDraft(scopeKey),
	);

	const setManualMappingMutation = useSetManualMapping();
	const clearManualMappingMutation = useClearManualMapping();
	const setIgnoreMutation = useSetMappingIgnore();
	const setRejectedCandidateMutation = useSetMappingRejectedCandidate();
	const clearRejectedCandidateMutation = useClearMappingRejectedCandidate();

	const scopedDraft =
		draft.scopeKey === scopeKey ? draft : createEmptyDraft(scopeKey);

	const debouncedQuery = useDebounced(scopedDraft.query, 300);
	const searchQuery = useMappingSearch({
		provider: input.provider,
		query: debouncedQuery,
		enabled: debouncedQuery.trim().length >= 2,
	});

	const effectiveMapping = input.currentMapping;

	const setQuery = useCallback(
		(query: string) => {
			setDraft((state) => ({
				...(state.scopeKey === scopeKey ? state : createEmptyDraft(scopeKey)),
				query,
			}));
		},
		[scopeKey],
	);

	const selectResult = useCallback(
		(result: MappingSearchResult) => {
			setDraft((state) => ({
				...(state.scopeKey === scopeKey ? state : createEmptyDraft(scopeKey)),
				selectedDraft: result,
			}));
		},
		[scopeKey],
	);

	const clearSelection = useCallback(() => {
		setDraft((state) => ({
			...(state.scopeKey === scopeKey ? state : createEmptyDraft(scopeKey)),
			selectedDraft: null,
		}));
	}, [scopeKey]);

	const resetDraft = useCallback(() => {
		setDraft(createEmptyDraft(scopeKey));
	}, [scopeKey]);

	const isDirty = isSelectedDraftDirty({
		selectedDraft: scopedDraft.selectedDraft,
		effectiveMapping,
	});

	const canSubmit = isDirty;
	const rejectCandidateProviderId = getRejectCandidateProviderId({
		authoritativeMapping: input.authoritativeMapping,
		manualMappingActive: input.manualMappingActive,
	});
	const clearRejectedCandidateProviderId = getClearRejectedCandidateProviderId(
		input.authoritativeMapping,
	);
	const canIgnoreTitle =
		input.authoritativeMapping?.mappingEntryKind !== "ignored";
	const canRejectCandidate = rejectCandidateProviderId !== null;
	const canClearRejectedCandidate = clearRejectedCandidateProviderId !== null;

	const submitSelection = useCallback(
		async (options?: { force?: boolean }) => {
			const selectedDraft = scopedDraft.selectedDraft;
			if (!selectedDraft) {
				return false;
			}
			const target = createProviderMappingTarget(
				selectedDraft.provider,
				selectedDraft.providerId,
			);
			if (target === null) {
				return false;
			}

			await setManualMappingMutation.mutateAsync({
				anilistId: input.anilistId,
				...target,
				...(options?.force === undefined ? {} : { force: options.force }),
				optimisticMapping: selectedDraft,
			});
			resetDraft();
			return true;
		},
		[
			scopedDraft.selectedDraft,
			input.anilistId,
			resetDraft,
			setManualMappingMutation,
		],
	);

	const revertToAutomatic = useCallback(async () => {
		await clearManualMappingMutation.mutateAsync({
			anilistId: input.anilistId,
			provider: input.provider,
		});
		resetDraft();
		return true;
	}, [clearManualMappingMutation, input.anilistId, input.provider, resetDraft]);

	const ignoreTitle = useCallback(async () => {
		await setIgnoreMutation.mutateAsync({
			anilistId: input.anilistId,
			provider: input.provider,
		});
		return true;
	}, [input.anilistId, input.provider, setIgnoreMutation]);

	const rejectCandidate = useCallback(async () => {
		if (rejectCandidateProviderId == null) {
			return false;
		}
		const target = createProviderMappingTarget(
			input.provider,
			rejectCandidateProviderId,
		);
		if (target === null) {
			return false;
		}

		await setRejectedCandidateMutation.mutateAsync({
			anilistId: input.anilistId,
			...target,
		});
		return true;
	}, [
		input.anilistId,
		input.provider,
		rejectCandidateProviderId,
		setRejectedCandidateMutation,
	]);

	const clearRejectedCandidate = useCallback(async () => {
		if (clearRejectedCandidateProviderId == null) {
			return false;
		}
		const target = createProviderMappingTarget(
			input.provider,
			clearRejectedCandidateProviderId,
		);
		if (target === null) {
			return false;
		}

		await clearRejectedCandidateMutation.mutateAsync({
			anilistId: input.anilistId,
			...target,
		});
		return true;
	}, [
		clearRejectedCandidateMutation,
		clearRejectedCandidateProviderId,
		input.anilistId,
		input.provider,
	]);

	return {
		state: {
			query: scopedDraft.query,
			results: searchQuery.data ?? [],
			isSearching: searchQuery.isFetching,
			selectedResult: scopedDraft.selectedDraft,
			previewMapping: canSubmit ? scopedDraft.selectedDraft : null,
			effectiveMapping,
			isDirty,
			canSubmit,
			canRevert: input.manualMappingActive,
			canIgnoreTitle,
			canRejectCandidate,
			canClearRejectedCandidate,
			rejectCandidateProviderId,
			clearRejectedCandidateProviderId,
			isSubmitting: setManualMappingMutation.isPending,
			isReverting: clearManualMappingMutation.isPending,
			isIgnoring: setIgnoreMutation.isPending,
			isRejectingCandidate: setRejectedCandidateMutation.isPending,
			isClearingRejectedCandidate: clearRejectedCandidateMutation.isPending,
		},
		actions: {
			setQuery,
			selectResult,
			clearSelection,
			resetDraft,
			submitSelection,
			revertToAutomatic,
			ignoreTitle,
			rejectCandidate,
			clearRejectedCandidate,
		},
	};
}
