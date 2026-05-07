/** Owns Sonarr setup submit and default-save mutations for the media modal. */
// src/features/media-modal/hooks/sonarr/use-sonarr-setup-actions.ts

import type { AniListId } from "@/anilist";
import { useAddSeries, useUpdateSeries } from "@/queries/sonarr";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import type { SonarrSetupTarget } from "../../setup-target";

type AddSeriesVariables = Parameters<
	ReturnType<typeof useAddSeries>["mutateAsync"]
>[0];
type SonarrResolvedMetadata = AddSeriesVariables extends {
	metadata?: infer Metadata;
}
	? Metadata
	: never;
type SonarrPrimaryTitleHint = AddSeriesVariables extends {
	primaryTitleHint?: infer TitleHint;
}
	? TitleHint
	: string;

interface UseSonarrSetupActionsInput {
	anilistId: AniListId;
	setupTarget: SonarrSetupTarget | null;
	providerRequestTitle: AddSeriesVariables["title"];
	fallbackLookupTitle?: SonarrPrimaryTitleHint;
	resolvedMetadata?: SonarrResolvedMetadata;
	verificationSettled: boolean;
	verificationFailed: boolean;
	onClose: () => void;
}

interface SonarrSubmitDraftInput {
	form: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
}

interface SonarrSetupActions {
	isSubmitting: boolean;
	setupMutationsBlocked: boolean;
	submitDraft: (input: SonarrSubmitDraftInput) => Promise<void>;
}

export function useSonarrSetupActions({
	anilistId,
	setupTarget,
	providerRequestTitle,
	fallbackLookupTitle,
	resolvedMetadata,
	verificationSettled,
	verificationFailed,
	onClose,
}: UseSonarrSetupActionsInput): SonarrSetupActions {
	const addSeries = useAddSeries();
	const updateSeries = useUpdateSeries();

	const setupMutationsBlocked =
		setupTarget === null || !verificationSettled || verificationFailed;
	const isSubmitting = addSeries.isPending || updateSeries.isPending;

	const submitDraft = async ({
		form,
		monitoringAction,
	}: SonarrSubmitDraftInput): Promise<void> => {
		if (setupMutationsBlocked || setupTarget === null) {
			return;
		}

		const payload = {
			anilistId,
			title: providerRequestTitle,
			form,
			...(fallbackLookupTitle === undefined
				? {}
				: { primaryTitleHint: fallbackLookupTitle }),
			...(resolvedMetadata === undefined ? {} : { metadata: resolvedMetadata }),
		};

		await (setupTarget.setupMode === "edit"
			? updateSeries.mutateAsync({
					...payload,
					tvdbId: setupTarget.tvdbId,
					monitoringAction,
				})
			: addSeries.mutateAsync({
					...payload,
					tvdbId: setupTarget.tvdbId,
				}));

		onClose();
	};

	return {
		isSubmitting,
		setupMutationsBlocked,
		submitDraft,
	};
}
