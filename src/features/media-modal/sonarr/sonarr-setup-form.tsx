/** Sonarr setup form for media modal add and edit flows. */
// src/features/media-modal/sonarr/sonarr-setup-form.tsx

import { useState, type FormEvent } from "react";
import type { ProviderFormResources } from "@/providers";
import {
	normalizeSonarrFormState,
	type SonarrFormState,
} from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";
import { useAddSeries, useUpdateSeries } from "@/queries/sonarr";
import {
	buildAddPathPreview,
	buildEditPathPreview,
} from "../setup/provider-path-preview";
import { BaseProviderSetupPanel } from "../setup/provider-setup-panel";
import type { ProviderRootFolderPathPreview } from "../setup/provider-root-folder-select";
import { SonarrAddOptionsFields } from "./sonarr-add-options-fields";
import { SonarrEditOptionsFields } from "./sonarr-edit-options-fields";
import {
	getSonarrSetupStatusNotice,
	type SonarrSetupTarget,
} from "./sonarr-setup-values";
import type { AniListId } from "@/anilist";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";

type SonarrSetupFormValues = SonarrFormState & {
	monitoringAction: SonarrEditMonitoringAction;
};

type SonarrDraftState = {
	targetKey: string | null;
	values: SonarrSetupFormValues;
	isDirty: boolean;
};

type SonarrDraftController = {
	values: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
	isDirty: boolean;
	onFieldChange: <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	) => void;
	onMonitoringActionChange: (value: SonarrEditMonitoringAction) => void;
};

export type SonarrSetupFooterState = {
	isBusy: boolean;
	isDirty: boolean;
	isSubmitting: boolean;
	setupMutationsBlocked: boolean;
	setupUnavailable: boolean;
	submitLabel: string;
};

type SonarrSetupFormProps = {
	formId: string;
	anilistId: AniListId;
	target: SonarrSetupTarget | null;
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

type SonarrSetupFormResult = {
	content: React.JSX.Element;
	footerState: SonarrSetupFooterState;
};

function getHeaderDescription(mode: "add" | "edit"): string {
	return mode === "edit"
		? "Update the folder and whole-series settings, then optionally apply a one-time episode monitoring action."
		: "Choose the root folder and monitoring settings for this series.";
}

function getInitialValues(
	target: SonarrSetupTarget | null,
): SonarrSetupFormValues {
	return {
		...normalizeSonarrFormState(target?.initialFormValues),
		monitoringAction:
			target?.initialMonitoringAction ?? "noChange",
	};
}

function getCleanDraftState(target: SonarrSetupTarget | null): SonarrDraftState {
	return {
		targetKey: target?.key ?? null,
		values: getInitialValues(target),
		isDirty: false,
	};
}

function getDraft(values: SonarrSetupFormValues): SonarrFormState {
	const draft: Partial<SonarrSetupFormValues> = { ...values };
	delete draft.monitoringAction;
	return draft as SonarrFormState;
}

function useSonarrDraftState(
	target: SonarrSetupTarget | null,
): SonarrDraftController {
	const [draftState, setDraftState] = useState<SonarrDraftState>(() =>
		getCleanDraftState(target),
	);
	const targetKey = target?.key ?? null;
	const resetDraftState =
		draftState.targetKey === targetKey ? null : getCleanDraftState(target);

	if (resetDraftState !== null) {
		setDraftState(resetDraftState);
	}

	const activeDraftState = resetDraftState ?? draftState;
	const activeValues = activeDraftState.values;
	const getActiveValues = (state: SonarrDraftState): SonarrSetupFormValues =>
		state.targetKey === targetKey
			? state.values
			: getCleanDraftState(target).values;

	const onFieldChange = <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	): void => {
		setDraftState((state) => ({
			targetKey,
			values: { ...getActiveValues(state), [field]: value },
			isDirty: true,
		}));
	};

	const onMonitoringActionChange = (
		value: SonarrEditMonitoringAction,
	): void => {
		setDraftState((state) => ({
			targetKey,
			values: { ...getActiveValues(state), monitoringAction: value },
			isDirty: true,
		}));
	};

	return {
		values: getDraft(activeValues),
		monitoringAction:
			activeValues.monitoringAction ??
			target?.initialMonitoringAction ??
			"noChange",
		isDirty: activeDraftState.isDirty,
		onFieldChange,
		onMonitoringActionChange,
	};
}

function getPathPreview(input: {
	currentDraft: SonarrFormState;
	target: SonarrSetupTarget | null;
}): ProviderRootFolderPathPreview | null {
	const { currentDraft, target } = input;
	if (target === null) return null;

	const selectedRootFolderPath = currentDraft.rootFolderPath ?? null;
	if (target.mode === "edit") {
		return buildEditPathPreview({
			selectedRootFolderPath,
			existingMedia: target.series,
		});
	}

	return buildAddPathPreview({
		selectedRootFolderPath,
		providerFolderName: target.providerFolderName,
	});
}

export function useSonarrSetupForm(
	props: SonarrSetupFormProps,
): SonarrSetupFormResult {
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
	const addSeries = useAddSeries();
	const updateSeries = useUpdateSeries();
	const draft = useSonarrDraftState(target);
	const currentDraft = draft.values;
	const mode = target?.mode ?? "add";
	const pathPreview = getPathPreview({ currentDraft, target });
	const isSubmitting = addSeries.isPending || updateSeries.isPending;
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
		submitLabel: mode === "edit" ? "Save changes" : "Add series",
	} satisfies SonarrSetupFooterState;

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
			? updateSeries.mutateAsync({
					...payload,
					tvdbId: target.tvdbId,
					monitoringAction: draft.monitoringAction,
				})
			: addSeries.mutateAsync({
					...payload,
					tvdbId: target.tvdbId,
				}));

		onClose();
	};
	const statusNotice = getSonarrSetupStatusNotice({
		verificationFailed,
	});
	const panel = (
		<BaseProviderSetupPanel
			providerName="Sonarr"
			isConfigured={isConfigured}
			hasFormResources={!!formResources}
			statusNotice={statusNotice}
			headerDescription={getHeaderDescription(mode)}
		>
			{target && formResources && pathPreview ? (
				mode === "edit" ? (
					<SonarrEditOptionsFields
						values={currentDraft}
						monitoringAction={draft.monitoringAction}
						onChange={draft.onFieldChange}
						onMonitoringActionChange={draft.onMonitoringActionChange}
						disabled={isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formResources={formResources}
						pathPreview={pathPreview}
					/>
				) : (
					<SonarrAddOptionsFields
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
