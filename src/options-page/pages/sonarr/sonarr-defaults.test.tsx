/** Tests for Sonarr options-page default add-options rendering. */
// src/options-page/pages/sonarr/sonarr-defaults.test.tsx

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProviderQualityProfileId, parseProviderTagId } from "@/providers";
import type { ProviderFormResources } from "@/providers";
import {
	createDefaultExtensionOptions,
	toPublicOptions,
	type PublicOptions,
} from "@/settings";
import { SonarrDefaults } from "./sonarr-defaults";

const mocks = vi.hoisted(() => ({
	publicOptions: undefined as PublicOptions | undefined,
	formResources: undefined as ProviderFormResources | undefined,
	isFetching: false,
}));

vi.mock("@/queries/options", () => ({
	usePublicOptions: () => ({ data: mocks.publicOptions }),
}));

vi.mock("@/queries/sonarr", () => ({
	useSonarrFormResources: () => ({
		data: mocks.formResources,
		isFetching: mocks.isFetching,
	}),
}));

vi.mock("../../components/ui/select", () => ({
	Select: (props: {
		disabled?: boolean;
		id?: string;
		options: { label: string; value: string }[];
		placeholder?: string;
	}) =>
		`${props.id ?? ""}:${props.disabled ? "disabled" : "enabled"}:${props.placeholder ?? ""}:${props.options.map((option) => option.label).join(",")}`,
}));

vi.mock("../../components/ui/switch", () => ({
	Switch: () => "switch",
}));

vi.mock("@/shared/ui/provider-tag-field", () => ({
	ProviderTagField: (props: {
		availableTags: { label: string }[];
		id?: string;
	}) =>
		`${props.id ?? ""}:tags:${props.availableTags.map((tag) => tag.label).join(",")}`,
}));

function configuredPublicOptions(configured: boolean): PublicOptions {
	const options = toPublicOptions(createDefaultExtensionOptions());
	return {
		...options,
		providers: {
			...options.providers,
			sonarr: {
				...options.providers.sonarr,
				isConfigured: configured,
			},
		},
	};
}

function getDefaultsMarkup(): string {
	function Harness(): React.JSX.Element {
		const form = useForm<PublicOptions>({
			defaultValues:
				mocks.publicOptions ?? toPublicOptions(createDefaultExtensionOptions()),
		});
		return (
			<FormProvider {...form}>
				<SonarrDefaults />
			</FormProvider>
		);
	}

	return renderToStaticMarkup(<Harness />);
}

describe("SonarrDefaults", () => {
	beforeEach(() => {
		mocks.publicOptions = configuredPublicOptions(true);
		mocks.formResources = undefined;
		mocks.isFetching = false;
	});

	it("renders static defaults when provider resources are unavailable", () => {
		const view = getDefaultsMarkup();

		expect(view).toContain("Default add options");
		expect(view).toContain("Series type");
		expect(view).toContain("Monitor episodes");
		expect(view).toContain("Season Folders");
		expect(view).toContain("Search Missing");
		expect(view).toContain("sonarr-root-folder:disabled");
		expect(view).toContain("sonarr-quality-profile:disabled");
		expect(view).toContain("Static defaults remain editable.");
	});

	it("renders fetched folders, quality profiles, and tags when available", () => {
		mocks.formResources = {
			qualityProfiles: [
				{ id: parseProviderQualityProfileId(1), name: "HD" },
			],
			rootFolders: [{ id: 1, path: "/anime" }],
			tags: [{ id: parseProviderTagId(2), label: "seasonal" }],
		};

		const view = getDefaultsMarkup();

		expect(view).toContain("sonarr-root-folder:enabled");
		expect(view).toContain("/anime");
		expect(view).toContain("sonarr-quality-profile:enabled");
		expect(view).toContain("HD");
		expect(view).toContain("sonarr-tags:tags:seasonal");
	});

	it("renders the connect message when Sonarr is not configured", () => {
		mocks.publicOptions = configuredPublicOptions(false);

		const view = getDefaultsMarkup();

		expect(view).toContain("Connect Sonarr to configure defaults.");
	});
});
