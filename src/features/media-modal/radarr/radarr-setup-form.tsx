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
	isRadarrSetupDraftDirty,
	getRadarrSetupStatusNotice,
	type RadarrSetupTarget,
} from "./radarr-setup-values";

export type RadarrSetupFooterState = {
	canSubmit: boolean;
	isBusy: boolean;
	isDirty: boolean;
	isSubmitting: boolean;
	setupMutationsBlocked: boolean;
	setupUnavailable: boolean;
	submitLabel: string;
};

type RadarrDraftState = {
	targetKey: string | null;
	baselineValues: RadarrFormState;
	values: RadarrFormState;
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
	targetLoading: boolean;
	verificationFailed: boolean;
	verificationSettled: boolean;
	onClose: () => void;
};

type RadarrSetupFormResult = {
	content: React.JSX.Element;
	footerState: RadarrSetupFooterState;
};

type RadarrSetupFieldsInput = {
	targetLoading: boolean;
	target: RadarrSetupTarget | null;
	formResources: ProviderFormResources | null;
	pathPreview: ProviderRootFolderPathPreview | null;
	currentDraft: RadarrFormState;
	isBusy: boolean;
	setupMutationsBlocked: boolean;
	portalContainer: HTMLElement | ShadowRoot | null;
	onFieldChange: <K extends keyof RadarrFormState>(
		field: K,
		value: RadarrFormState[K],
	) => void;
};

function getHeaderDescription(mode: "add" | "edit"): string {
	return mode === "edit"
		? "Update the folder and quality settings for this Radarr item."
		: "Choose the root folder and add options for this movie.";
}

function getInitialValues(
	target: RadarrSetupTarget | null,
): RadarrFormState {
	return normalizeRadarrFormState(target?.initialFormValues);
}

function canSubmitSetupForm(
	mode: "add" | "edit",
	isDirty: boolean,
	setupUnavailable: boolean,
	setupMutationsBlocked: boolean,
): boolean {
	if (setupUnavailable || setupMutationsBlocked) return false;

	return mode === "add" || isDirty;
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

function renderRadarrSetupFields(
	input: RadarrSetupFieldsInput,
): React.JSX.Element | null {
	const {
		targetLoading,
		target,
		formResources,
		pathPreview,
		currentDraft,
		isBusy,
		setupMutationsBlocked,
		portalContainer,
		onFieldChange,
	} = input;

	if (targetLoading) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
				<p>Loading Radarr target...</p>
			</div>
		);
	}

	if (!target || !formResources || !pathPreview) return null;

	if (target.mode === "edit") {
		return (
			<RadarrEditOptionsFields
				values={currentDraft}
				onChange={onFieldChange}
				disabled={isBusy || setupMutationsBlocked}
				portalContainer={portalContainer}
				formResources={formResources}
				pathPreview={pathPreview}
			/>
		);
	}

	return (
		<RadarrAddOptionsFields
			values={currentDraft}
			onChange={onFieldChange}
			disabled={isBusy || setupMutationsBlocked}
			portalContainer={portalContainer}
			formResources={formResources}
			pathPreview={pathPreview}
		/>
	);
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
		targetLoading,
		verificationFailed,
		verificationSettled,
		onClose,
	} = props;
	const addMovie = useAddMovie();
	const updateMovie = useUpdateMovie();
	const targetKey = target?.key ?? null;
	const initialValues = getInitialValues(target);
	const initialDraft = {
		targetKey,
		baselineValues: initialValues,
		values: initialValues,
	} satisfies RadarrDraftState;
	const [draftState, setDraftState] = useState<RadarrDraftState>(
		() => initialDraft,
	);
	const activeDraft =
		draftState.targetKey === targetKey ? draftState : initialDraft;
	const currentDraft = activeDraft.values;
	const isDirty = isRadarrSetupDraftDirty({
		baselineValues: activeDraft.baselineValues,
		values: currentDraft,
	});
	const mode = target?.mode ?? "add";
	const pathPreview = getPathPreview({ currentDraft, target });
	const isSubmitting = addMovie.isPending || updateMovie.isPending;
	const setupMutationsBlocked =
		target === null ||
		providerPayloadTitle === undefined ||
		!verificationSettled ||
		verificationFailed;
	const setupUnavailable = pathPreview === null;
	const isBusy = isSubmitting;
	const canSubmit = canSubmitSetupForm(
		mode,
		isDirty,
		setupUnavailable,
		setupMutationsBlocked,
	);

	const footerState = {
		canSubmit,
		isBusy,
		isDirty,
		isSubmitting,
		setupMutationsBlocked,
		setupUnavailable,
		submitLabel: mode === "edit" ? "Save changes" : "Add movie",
	} satisfies RadarrSetupFooterState;

	const onFieldChange = <K extends keyof RadarrFormState>(
		field: K,
		value: RadarrFormState[K],
	): void => {
		setDraftState((state) => {
			const draft = state.targetKey === targetKey ? state : initialDraft;

			return {
				...draft,
				values: { ...draft.values, [field]: value },
			};
		});
	};
	const handleSubmit = async (
		event: FormEvent<HTMLFormElement>,
	): Promise<void> => {
		event.preventDefault();

		if (
			!canSubmit ||
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
	const setupFields = renderRadarrSetupFields({
		targetLoading,
		target,
		formResources,
		pathPreview,
		currentDraft,
		isBusy,
		setupMutationsBlocked,
		portalContainer,
		onFieldChange,
	});
	const panel = (
		<BaseProviderSetupPanel
			providerName="Radarr"
			isConfigured={isConfigured}
			hasFormResources={targetLoading || !!formResources}
			statusNotice={statusNotice}
			headerDescription={getHeaderDescription(mode)}
		>
			{setupFields}
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
				className="min-w-0 md:h-full md:min-h-0"
			>
				{panel}
			</form>
		),
		footerState,
	};
}
