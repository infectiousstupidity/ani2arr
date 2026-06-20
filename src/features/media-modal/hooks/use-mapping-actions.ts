/** Shared mapping mutation actions for media modal provider flows. */
// src/features/media-modal/hooks/use-mapping-actions.ts

import { useState } from "react";
import type { AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type {
	TmdbId,
	TvdbId,
} from "@/providers/schemas";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import {
	useClearManualMapping,
	useClearMappingRejectedCandidate,
	useSetMappingIgnore,
	useSetMappingRejectedCandidate,
	useSetManualMapping,
} from "@/queries/mapping";
import { normalizeError } from "@/shared/errors/error-utils";
import { useConfirm } from "@/shared/hooks/use-confirm";

type UseMappingActionsInput = {
	anilistId: AniListId;
	source?: SourceIdentity | undefined;
	provider: Provider;
	selectedProviderId: ProviderExternalId | null;
	rejectProviderId: ProviderExternalId | null;
	clearRejectedProviderId: ProviderExternalId | null;
	requiresApplyConfirmation: boolean;
	onMappingApplied: () => void;
	onMappingReset: () => void;
	onIgnored: () => void;
};

type ProviderExternalId = TvdbId | TmdbId;

type ProviderMappingTarget =
	| { provider: "sonarr"; providerId: TvdbId }
	| { provider: "radarr"; providerId: TmdbId };

function createProviderMappingTarget(
	provider: Provider,
	value: unknown,
): ProviderMappingTarget | null {
	if (provider === "sonarr") {
		const providerId = parseTvdbIdOrNull(value);
		return providerId === null ? null : { provider, providerId };
	}

	const providerId = parseTmdbIdOrNull(value);
	return providerId === null ? null : { provider, providerId };
}

export function useMappingActions({
	anilistId,
	source,
	provider,
	selectedProviderId,
	rejectProviderId,
	clearRejectedProviderId,
	requiresApplyConfirmation,
	onMappingApplied,
	onMappingReset,
	onIgnored,
}: UseMappingActionsInput) {
	const [actionError, setActionError] = useState<string | null>(null);
	const confirm = useConfirm();
	const setManualMapping = useSetManualMapping();
	const clearManualMapping = useClearManualMapping();
	const setIgnore = useSetMappingIgnore();
	const setRejectedCandidate = useSetMappingRejectedCandidate();
	const clearRejectedCandidate = useClearMappingRejectedCandidate();
	const selectedTarget = createProviderMappingTarget(provider, selectedProviderId);
	const rejectTarget = createProviderMappingTarget(provider, rejectProviderId);
	const clearRejectedTarget = createProviderMappingTarget(
		provider,
		clearRejectedProviderId,
	);
	const sourceInput =
		source === undefined ? { anilistId } : { anilistId, source };

	const applyMapping = async (): Promise<void> => {
		if (selectedTarget === null) return;
		setActionError(null);

		if (requiresApplyConfirmation) {
			const providerLabel = getProviderLabel(provider);
			const didConfirm = await confirm({
				title: "Discard setup changes?",
				description: `Changing the ${providerLabel} target will replace the current setup form and discard unsaved setup changes.`,
				confirmText: "Discard changes",
				cancelText: "Keep editing",
			});

			if (!didConfirm) return;
		}

		try {
			await setManualMapping.mutateAsync({ ...sourceInput, ...selectedTarget });
			onMappingApplied();
		} catch (error) {
			const normalizedError = normalizeError(error);
			const conflictingAniListIds =
				normalizedError.details?.conflictingAniListIds;

			if (
				Array.isArray(conflictingAniListIds) &&
				conflictingAniListIds.length > 0
			) {
				const providerIdLabel = getProviderExternalIdLabel(provider);
				const didConfirm = await confirm({
					title: `Share ${providerIdLabel} ID ${selectedTarget.providerId}?`,
					description: normalizedError.userMessage,
					confirmText: "Share ID",
					cancelText: "Cancel",
				});

				if (!didConfirm) return;

				try {
					await setManualMapping.mutateAsync({
						...sourceInput,
						...selectedTarget,
						force: true,
					});
					onMappingApplied();
				} catch (retryError) {
					setActionError(normalizeError(retryError).userMessage);
				}
				return;
			}

			setActionError(normalizedError.userMessage);
		}
	};

	const resetMapping = async (): Promise<void> => {
		await clearManualMapping.mutateAsync({ ...sourceInput, provider });
		onMappingReset();
	};

	const ignoreTitle = async (): Promise<void> => {
		const didConfirm = await confirm({
			title: "Ignore this title entirely?",
			description:
				"ani2arr will stop using automatic or upstream matches for this AniList entry until you remove the title ignore or save a manual mapping.",
			confirmText: "Ignore title",
			cancelText: "Cancel",
		});

		if (!didConfirm) return;

		await setIgnore.mutateAsync({ ...sourceInput, provider });
		onIgnored();
	};

	const rejectCandidate = async (): Promise<void> => {
		if (rejectTarget === null) return;

		await setRejectedCandidate.mutateAsync({ ...sourceInput, ...rejectTarget });
	};

	const clearRejectedCandidateAction = async (): Promise<void> => {
		if (clearRejectedTarget === null) return;

		await clearRejectedCandidate.mutateAsync({
			...sourceInput,
			...clearRejectedTarget,
		});
	};

	return {
		applyMapping, resetMapping, ignoreTitle, rejectCandidate,
		clearRejectedCandidate: clearRejectedCandidateAction,
		actionError,
		isSubmittingMapping: setManualMapping.isPending,
		isRevertingMapping: clearManualMapping.isPending,
		isIgnoring: setIgnore.isPending,
		isRejectingCandidate: setRejectedCandidate.isPending,
		isClearingRejectedCandidate: clearRejectedCandidate.isPending,
	};
}
