/** Radarr setup form for media modal add and edit flows. */
// src/features/media-modal/radarr/radarr-setup-form.tsx

import { useState, type FormEvent } from "react";
import type { AniListId } from "@/anilist";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { ProviderFormResources } from "@/providers";
import {
	normalizeRadarrFormState,
	type RadarrFormState,
} from "@/providers/radarr/form-state";
import { useAddMovie, useUpdateMovie } from "@/queries/radarr";
import { BaseProviderSetupPanel } from "../setup/provider-setup-panel";
import type { ProviderRootFolderPathPreview } from "../setup/provider-root-folder-select";
import { RadarrAddOptionsFields } from "./radarr-add-options-fields";
import { RadarrEditOptionsFields } from "./radarr-edit-options-fields";
import {
	buildAddPathPreview,
	buildEditPathPreview,
} from "../setup/provider-path-preview";
import {
	getRadarrSetupStatusNotice,
	type RadarrSetupTarget,
} from "./radarr-setup-values";

export type RadarrSetupFooterState = {
	isBusy: boolean;
	isDirty: boolean;
	isSubmitting: boolean;
	setupMutationsBlocked: boolean;
	setupUnavailable: boolean;
	submitLabel: string;
};

type RadarrDraftState = {
	targetKey: string | null;
	values: RadarrFormState;
	isDirty: boolean;
};

type RadarrDraftController = {
	values: RadarrFormState;
	isDirty: boolean;
	onFieldChange: <K extends keyof RadarrFormState>(
		field: K,
		value: RadarrFormState[K],
	) => void;
};

type RadarrSetupFormProps = {
	formId: string;
	anilistId: AniListId;
	target: RadarrSetupTarget | null;
	providerPayloadTitle?: string | undefined;
	fallbackLookupTitle?: string | undefined;
	resolvedMetadata: AniListMediaHint | null;
	isConfigured: boolean;
	formResources: ProviderFormResources | null;
	portalContainer: HTMLElement | ShadowRoot | null;
	verificationFailed: boolean;
	verificationSettled: boolean;
	onClose: () => void;
};

type RadarrSetupFormResult = {
	content: React.JSX.Element;
	footerState: RadarrSetupFooterState;
};

function getHeaderDescription(mode: "add" | "edit"): string {
	return mode === "edit"
		? "Update the folder and quality settings for this Radarr item."
		: "Choose the root folder and add options for this movie.";
}

function getInitialValues(target: RadarrSetupTarget | null): RadarrFormState {
	return normalizeRadarrFormState(target?.initialFormValues);
}

function getCleanDraftState(target: RadarrSetupTarget | null): RadarrDraftState {
	return {
		targetKey: target?.key ?? null,
		values: getInitialValues(target),
		isDirty: false,
	};
}

function useRadarrDraftState(
	target: RadarrSetupTarget | null,
): RadarrDraftController {
	const [draftState, setDraftState] = useState<RadarrDraftState>(() =>
		getCleanDraftState(target),
	);
	const targetKey = target?.key ?? null;
	const resetDraftState =
		draftState.targetKey === targetKey ? null : getCleanDraftState(target);

	if (resetDraftState !== null) {
		setDraftState(resetDraftState);
	}

	const activeDraftState = resetDraftState ?? draftState;
	const getActiveValues = (state: RadarrDraftState): RadarrFormState =>
		state.targetKey === targetKey
			? state.values
			: getCleanDraftState(target).values;

	const onFieldChange = <K extends keyof RadarrFormState>(
		field: K,
		value: RadarrFormState[K],
	): void => {
		setDraftState((state) => ({
			targetKey,
			values: { ...getActiveValues(state), [field]: value },
			isDirty: true,
		}));
	};

	return {
		values: activeDraftState.values,
		isDirty: activeDraftState.isDirty,
		onFieldChange,
	};
}

function getPathPreview(input: {
	currentDraft: RadarrFormState;
	target: RadarrSetupTarget | null;
}): ProviderRootFolderPathPreview | null {
	const { currentDraft, target } = input;
	if (target === null) return null;

	const selectedRootFolderPath = currentDraft.rootFolderPath ?? null;
	if (target.mode === "edit") {
		return buildEditPathPreview({
			selectedRootFolderPath,
			existingMedia: target.movie,
		});
	}

	return buildAddPathPreview({
		selectedRootFolderPath,
		providerFolderName: target.providerFolderName,
	});
}

export function useRadarrSetupForm(
	props: RadarrSetupFormProps,
): RadarrSetupFormResult {
	const {
		formId,
		anilistId,
		target,
		providerPayloadTitle,
		fallbackLookupTitle,
		resolvedMetadata,
		isConfigured,
		formResources,
		portalContainer,
		verificationFailed,
		verificationSettled,
		onClose,
	} = props;
	const addMovie = useAddMovie();
	const updateMovie = useUpdateMovie();
	const draft = useRadarrDraftState(target);
	const currentDraft = draft.values;
	const mode = target?.mode ?? "add";
	const pathPreview = getPathPreview({ currentDraft, target });
	const isSubmitting = addMovie.isPending || updateMovie.isPending;
	const setupMutationsBlocked =
		target === null ||
		providerPayloadTitle === undefined ||
		!verificationSettled ||
		verificationFailed;
	const setupUnavailable = target === null || pathPreview === null;
	const isBusy = isSubmitting;

	const footerState = {
		isBusy,
		isDirty: draft.isDirty,
		isSubmitting,
		setupMutationsBlocked,
		setupUnavailable,
		submitLabel: mode === "edit" ? "Save changes" : "Add movie",
	} satisfies RadarrSetupFooterState;

	const handleSubmit = async (
		event: FormEvent<HTMLFormElement>,
	): Promise<void> => {
		event.preventDefault();

		if (
			setupMutationsBlocked ||
			target === null ||
			providerPayloadTitle === undefined
		) {
			return;
		}

		const payload = {
			anilistId,
			title: providerPayloadTitle,
			form: currentDraft,
			...(fallbackLookupTitle === undefined
				? {}
				: { primaryTitleHint: fallbackLookupTitle }),
			...(resolvedMetadata === null ? {} : { metadata: resolvedMetadata }),
		};

		await (target.mode === "edit"
			? updateMovie.mutateAsync({
					...payload,
					tmdbId: target.tmdbId,
				})
			: addMovie.mutateAsync({
					...payload,
					tmdbId: target.tmdbId,
				}));

		onClose();
	};
	const statusNotice = getRadarrSetupStatusNotice({
		verificationFailed,
	});
	const panel = (
		<BaseProviderSetupPanel
			providerName="Radarr"
			isConfigured={isConfigured}
			hasFormResources={!!formResources}
			statusNotice={statusNotice}
			headerDescription={getHeaderDescription(mode)}
		>
			{target && formResources && pathPreview ? (
				mode === "edit" ? (
					<RadarrEditOptionsFields
						values={currentDraft}
						onChange={draft.onFieldChange}
						disabled={isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formResources={formResources}
						pathPreview={pathPreview}
					/>
				) : (
					<RadarrAddOptionsFields
						values={currentDraft}
						onChange={draft.onFieldChange}
						disabled={isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formResources={formResources}
						pathPreview={pathPreview}
					/>
				)
			) : null}
		</BaseProviderSetupPanel>
	);

	if (setupUnavailable) {
		return { content: panel, footerState };
	}

	return {
		content: (
			<form
				id={formId}
				onSubmit={(event) => void handleSubmit(event)}
				className="h-full flex flex-col min-h-0"
			>
				{panel}
			</form>
		),
		footerState,
	};
}
