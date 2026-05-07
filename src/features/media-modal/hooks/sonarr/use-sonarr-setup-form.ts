/** Owns Sonarr setup form state for the current media modal setup target. */
// src/features/media-modal/hooks/sonarr/use-sonarr-setup-form.ts

import { useEffect, useMemo, useRef, type FormEvent } from "react";
import { useForm, type Path, type PathValue } from "react-hook-form";

import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { SonarrEditMonitoringAction } from "@/providers/sonarr/schemas";

import type { ProviderRootFolderPathPreview } from "@/components/provider-add-options/provider-root-folder-select";
import {
	buildAddPathPreview,
	buildEditPathPreview,
} from "../../provider-path-preview";
import type { SonarrSetupTarget } from "../../setup-target";

type SonarrSetupFormValues = SonarrFormState & {
	monitoringAction: SonarrEditMonitoringAction;
};

export type SonarrSetupFormState = {
	currentDraft: SonarrFormState;
	monitoringAction: SonarrEditMonitoringAction;
	handleFieldChange: <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	) => void;
	handleMonitoringActionChange: (value: SonarrEditMonitoringAction) => void;
	handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
	isBusy: boolean;
	isDirty: boolean;
	pathPreview: ProviderRootFolderPathPreview;
};

type UseSonarrSetupFormInput = {
	target: SonarrSetupTarget | null;
	providerRequestTitle: string;
	storedDefaults: SonarrFormState;
	isSubmitting: boolean;
	onSubmitDraft: (input: {
		form: SonarrFormState;
		monitoringAction: SonarrEditMonitoringAction;
	}) => Promise<void>;
};

function getInitialValues(
	target: SonarrSetupTarget | null,
	storedDefaults: SonarrFormState,
): SonarrSetupFormValues {
	return {
		...(target?.initialFormDraft ?? storedDefaults),
		monitoringAction: target?.initialMonitoringAction ?? "noChange",
	};
}

function getDraft(values: SonarrSetupFormValues): SonarrFormState {
	const draft: Partial<SonarrSetupFormValues> = { ...values };
	delete draft.monitoringAction;
	return draft as SonarrFormState;
}

export function useSonarrSetupForm({
	target,
	storedDefaults,
	isSubmitting,
	onSubmitDraft,
}: UseSonarrSetupFormInput): SonarrSetupFormState | null {
	const form = useForm<SonarrSetupFormValues>({
		defaultValues: getInitialValues(target, storedDefaults),
	});

	const resetValuesRef = useRef(getInitialValues(target, storedDefaults));
	resetValuesRef.current = getInitialValues(target, storedDefaults);

	const { reset } = form;

	useEffect(() => {
		reset(resetValuesRef.current);
	}, [reset, target?.key]);

	const currentValues = form.watch();
	const currentDraft = getDraft(currentValues);
	const monitoringAction = currentValues.monitoringAction;

	const handleFieldChange = <K extends keyof SonarrFormState>(
		field: K,
		value: SonarrFormState[K],
	): void => {
		const fieldName = field as Path<SonarrSetupFormValues>;

		form.setValue(
			fieldName,
			value as PathValue<SonarrSetupFormValues, typeof fieldName>,
			{ shouldDirty: true },
		);
	};

	const handleMonitoringActionChange = (
		value: SonarrEditMonitoringAction,
	): void => {
		form.setValue("monitoringAction", value, { shouldDirty: true });
	};

	const submitForm = form.handleSubmit(async (values) => {
		await onSubmitDraft({
			form: getDraft(values),
			monitoringAction: values.monitoringAction,
		});
	});

	const handleSubmit = async (
		event: FormEvent<HTMLFormElement>,
	): Promise<void> => {
		await submitForm(event);
	};

	const pathPreview = useMemo(() => {
		if (target === null) return null;

		const selectedRootFolderPath = currentDraft.rootFolderPath ?? null;

		if (target.setupMode === "edit") {
			return buildEditPathPreview({
				selectedRootFolderPath,
				existingMedia: target.existingItem,
			});
		}

		return buildAddPathPreview({
			selectedRootFolderPath,
			providerFolderName: target.providerFolderName,
		});
	}, [currentDraft.rootFolderPath, target]);

	if (target === null || pathPreview === null) {
		return null;
	}

	return {
		currentDraft,
		monitoringAction: monitoringAction ?? target.initialMonitoringAction,
		handleFieldChange,
		handleMonitoringActionChange,
		handleSubmit,
		isBusy: isSubmitting,
		isDirty: form.formState.isDirty,
		pathPreview,
	};
}
