/** Owns media modal mapping mutation routing and external callbacks. */
// src/features/media-modal/hooks/use-media-modal-mapping-actions.ts

import type { AniListId } from "@/anilist";
import { useConfirm } from "@/shared/hooks/use-confirm";

type MappingMutationActions = {
	submitSelection: () => Promise<boolean>;
	revertToAutomatic: () => Promise<boolean>;
	ignoreTitle: () => Promise<boolean>;
	rejectCandidate: () => Promise<boolean>;
	clearRejectedCandidate: () => Promise<boolean>;
};

type MappingSaveEvent<TMapping> = {
	anilistId: AniListId;
	mapping: TMapping;
};

type MappingSaveErrorEvent = {
	anilistId: AniListId;
	error: Error;
};

interface UseMediaModalMappingActionsInput<TMapping> {
	anilistId: AniListId;
	selectedMapping: TMapping | null;
	mappingActions: MappingMutationActions;
	routeToMappingTarget: (mapping: TMapping) => Promise<boolean>;
	onClose: () => void;
	onMappingSaved?: (event: MappingSaveEvent<TMapping>) => void;
	onMappingSaveError?: (event: MappingSaveErrorEvent) => void;
}

interface MediaModalMappingActions {
	handleApplyMapping: () => Promise<void>;
	handleResetMapping: () => Promise<void>;
	handleIgnoreTitle: () => Promise<void>;
	handleRejectCandidate: () => Promise<void>;
	handleClearRejectedCandidate: () => Promise<void>;
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string" && error.length > 0) return new Error(error);
	return new Error("Unknown mapping save error.");
}

export function useMediaModalMappingActions<TMapping>({
	anilistId,
	selectedMapping,
	mappingActions,
	routeToMappingTarget,
	onClose,
	onMappingSaved,
	onMappingSaveError,
}: UseMediaModalMappingActionsInput<TMapping>): MediaModalMappingActions {
	const confirm = useConfirm();

	const notifyMappingSaveError = (error: unknown): Error => {
		const normalizedError = toError(error);
		onMappingSaveError?.({ anilistId, error: normalizedError });
		return normalizedError;
	};

	const handleApplyMapping = async (): Promise<void> => {
		if (selectedMapping === null) return;
		try {
			const didSave = await mappingActions.submitSelection();
			if (!didSave) return;

			const didRouteToSetup = await routeToMappingTarget(selectedMapping);
			if (didRouteToSetup) {
				onMappingSaved?.({ anilistId, mapping: selectedMapping });
			}
		} catch (error) {
			throw notifyMappingSaveError(error);
		}
	};

	const handleResetMapping = async (): Promise<void> => {
		try {
			await mappingActions.revertToAutomatic();
		} catch (error) {
			throw notifyMappingSaveError(error);
		}
	};

	const handleIgnoreTitle = async (): Promise<void> => {
		const didConfirm = await confirm({
			title: "Ignore this title entirely?",
			description:
				"ani2arr will stop using automatic or upstream matches for this AniList entry until you remove the title ignore or save a manual mapping.",
			confirmText: "Ignore title",
			cancelText: "Cancel",
		});

		if (!didConfirm) return;

		try {
			const didIgnore = await mappingActions.ignoreTitle();
			if (didIgnore) onClose();
		} catch (error) {
			throw notifyMappingSaveError(error);
		}
	};

	const handleRejectCandidate = async (): Promise<void> => {
		try {
			await mappingActions.rejectCandidate();
		} catch (error) {
			throw notifyMappingSaveError(error);
		}
	};

	const handleClearRejectedCandidate = async (): Promise<void> => {
		try {
			await mappingActions.clearRejectedCandidate();
		} catch (error) {
			throw notifyMappingSaveError(error);
		}
	};

	return {
		handleApplyMapping,
		handleResetMapping,
		handleIgnoreTitle,
		handleRejectCandidate,
		handleClearRejectedCandidate,
	};
}
