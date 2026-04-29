/** Owns Radarr setup form state for the current media modal setup target. */
// src/features/media-modal/hooks/radarr/use-radarr-setup-form.ts

import { useEffect, useMemo, useRef, type FormEvent } from "react";
import { useForm, type Path, type PathValue } from "react-hook-form";

import { deriveProviderSetupPathPreview } from "@/providers/library/paths";
import type { RadarrFormState } from "@/providers/settings/provider-settings.schema";

import type { RadarrSetupTarget } from "../../setup-target";

export type RadarrSetupFormState = {
	currentDraft: RadarrFormState;
	handleFieldChange: <K extends keyof RadarrFormState>(
		field: K,
		value: RadarrFormState[K],
	) => void;
	handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
	isBusy: boolean;
	isDirty: boolean;
	pathPreview: ReturnType<typeof deriveProviderSetupPathPreview>;
};

type UseRadarrSetupFormInput = {
	target: RadarrSetupTarget | null;
	providerRequestTitle: string;
	storedDefaults: RadarrFormState;
	isSubmitting: boolean;
	onSubmitDraft: (draft: RadarrFormState) => Promise<void>;
};

function getInitialValues(
	target: RadarrSetupTarget | null,
	storedDefaults: RadarrFormState,
): RadarrFormState {
	return target?.initialFormDraft ?? storedDefaults;
}

export function useRadarrSetupForm({
	target,
	providerRequestTitle,
	storedDefaults,
	isSubmitting,
	onSubmitDraft,
}: UseRadarrSetupFormInput): RadarrSetupFormState | null {
	const form = useForm<RadarrFormState>({
		defaultValues: getInitialValues(target, storedDefaults),
	});

	const resetValuesRef = useRef(getInitialValues(target, storedDefaults));
	resetValuesRef.current = getInitialValues(target, storedDefaults);

	const { reset } = form;

	useEffect(() => {
		reset(resetValuesRef.current);
	}, [reset, target?.key]);

	const currentDraft = form.watch();

	const handleFieldChange = <K extends keyof RadarrFormState>(
		field: K,
		value: RadarrFormState[K],
	): void => {
		const fieldName = field as Path<RadarrFormState>;

		form.setValue(
			fieldName,
			value as PathValue<RadarrFormState, typeof fieldName>,
			{ shouldDirty: true },
		);
	};

	const submitForm = form.handleSubmit(async (values) => {
		await onSubmitDraft(values);
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
			return deriveProviderSetupPathPreview({
				mode: "edit",
				provider: "radarr",
				title: target.targetTitle,
				selectedRootFolderPath,
				existingMedia: target.existingItem,
			});
		}

		return deriveProviderSetupPathPreview({
			mode: "add",
			provider: "radarr",
			title: providerRequestTitle,
			selectedRootFolderPath,
			providerIdHint: target.tmdbId,
		});
	}, [currentDraft.rootFolderPath, providerRequestTitle, target]);

	if (target === null || pathPreview === null) {
		return null;
	}

	return {
		currentDraft,
		handleFieldChange,
		handleSubmit,
		isBusy: isSubmitting,
		isDirty: form.formState.isDirty,
		pathPreview,
	};
}
