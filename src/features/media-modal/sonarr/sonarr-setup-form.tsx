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

type SonarrDraftState = {
	targetKey: string | null;
	values: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
	isDirty: boolean;
};

export type SonarrSetupFooterState = {
	canSubmit: boolean;
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
): SonarrFormState {
	return normalizeSonarrFormState(target?.initialFormValues);
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
	const targetKey = target?.key ?? null;
	const initialValues = getInitialValues(target);
	const initialMonitoringAction = target?.initialMonitoringAction ?? "noChange";
	const [draftState, setDraftState] = useState<SonarrDraftState>(() => ({
		targetKey,
		values: initialValues,
		monitoringAction: initialMonitoringAction,
		isDirty: false,
	}));
	let currentDraft = initialValues;
	let monitoringAction = initialMonitoringAction;
	let isDirty = false;
	if (draftState.targetKey === targetKey) {
		currentDraft = draftState.values;
		monitoringAction = draftState.monitoringAction;
		isDirty = draftState.isDirty;
	}
	const mode = target?.mode ?? "add";
	const pathPreview = getPathPreview({ currentDraft, target });
	const isSubmitting = addSeries.isPending || updateSeries.isPending;
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
		submitLabel: mode === "edit" ? "Save changes" : "Add series",
	} satisfies SonarrSetupFooterState;

	const onFieldChange = <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	): void => {
		setDraftState((state) => {
			const values = state.targetKey === targetKey ? state.values : initialValues;

			return {
				targetKey,
				values: { ...values, [field]: value },
				monitoringAction:
					state.targetKey === targetKey
						? state.monitoringAction
						: initialMonitoringAction,
				isDirty: true,
			};
		});
	};
	const onMonitoringActionChange = (
		value: SonarrEditMonitoringAction,
	): void => {
		setDraftState((state) => ({
			targetKey,
			values: state.targetKey === targetKey ? state.values : initialValues,
			monitoringAction: value,
			isDirty: true,
		}));
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
			? updateSeries.mutateAsync({
					...payload,
					tvdbId: target.tvdbId,
					monitoringAction,
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
						monitoringAction={monitoringAction}
						onChange={onFieldChange}
						onMonitoringActionChange={onMonitoringActionChange}
						disabled={isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formResources={formResources}
						pathPreview={pathPreview}
					/>
				) : (
					<SonarrAddOptionsFields
						values={currentDraft}
						onChange={onFieldChange}
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
