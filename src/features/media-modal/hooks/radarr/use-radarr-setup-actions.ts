/** Owns Radarr setup submit and default-save mutations for the media modal. */
// src/features/media-modal/hooks/radarr/use-radarr-setup-actions.ts

import type { AniListId } from "@/anilist";
import { useAddMovie, useUpdateMovie } from "@/queries/radarr";
import { type RadarrFormState } from "@/providers/radarr/form-state";
import type { RadarrSetupTarget } from "../../setup-target";

type AddMovieVariables = Parameters<
	ReturnType<typeof useAddMovie>["mutateAsync"]
>[0];
type RadarrResolvedMetadata = AddMovieVariables extends {
	metadata?: infer Metadata;
}
	? Metadata
	: never;
type RadarrPrimaryTitleHint = AddMovieVariables extends {
	primaryTitleHint?: infer TitleHint;
}
	? TitleHint
	: string;

interface UseRadarrSetupActionsInput {
	anilistId: AniListId;
	setupTarget: RadarrSetupTarget | null;
	providerRequestTitle: AddMovieVariables["title"];
	fallbackLookupTitle?: RadarrPrimaryTitleHint;
	resolvedMetadata?: RadarrResolvedMetadata;
	verificationSettled: boolean;
	verificationFailed: boolean;
	onClose: () => void;
}

interface RadarrSetupActions {
	isSubmitting: boolean;
	setupMutationsBlocked: boolean;
	submitDraft: (currentDraft: RadarrFormState) => Promise<void>;
}

export function useRadarrSetupActions({
	anilistId,
	setupTarget,
	providerRequestTitle,
	fallbackLookupTitle,
	resolvedMetadata,
	verificationSettled,
	verificationFailed,
	onClose,
}: UseRadarrSetupActionsInput): RadarrSetupActions {
	const addMovie = useAddMovie();
	const updateMovie = useUpdateMovie();

	const setupMutationsBlocked =
		setupTarget === null || !verificationSettled || verificationFailed;
	const isSubmitting = addMovie.isPending || updateMovie.isPending;

	const submitDraft = async (currentDraft: RadarrFormState): Promise<void> => {
		if (setupMutationsBlocked || setupTarget === null) {
			return;
		}

		const payload = {
			anilistId,
			title: providerRequestTitle,
			form: currentDraft,
			...(fallbackLookupTitle === undefined
				? {}
				: { primaryTitleHint: fallbackLookupTitle }),
			...(resolvedMetadata === undefined ? {} : { metadata: resolvedMetadata }),
		};

		await (setupTarget.setupMode === "edit"
			? updateMovie.mutateAsync({
					...payload,
					tmdbId: setupTarget.tmdbId,
				})
			: addMovie.mutateAsync({
					...payload,
					tmdbId: setupTarget.tmdbId,
				}));

		onClose();
	};

	return {
		isSubmitting,
		setupMutationsBlocked,
		submitDraft,
	};
}
