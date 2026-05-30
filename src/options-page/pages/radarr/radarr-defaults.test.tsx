/** Tests for Radarr options-page default add-options rendering. */
// src/options-page/pages/radarr/radarr-defaults.test.tsx

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
import { RadarrDefaults } from "./radarr-defaults";

const mocks = vi.hoisted(() => ({
	publicOptions: undefined as PublicOptions | undefined,
	formResources: undefined as ProviderFormResources | undefined,
	isFetching: false,
	savePublicOptions: vi.fn(),
}));

vi.mock("@/queries/options", () => ({
	usePublicOptions: () => ({ data: mocks.publicOptions }),
	useSavePublicOptions: () => ({ mutateAsync: mocks.savePublicOptions }),
}));

vi.mock("@/queries/radarr", () => ({
	useRadarrFormResources: () => ({
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
			radarr: {
				...options.providers.radarr,
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
				<RadarrDefaults />
			</FormProvider>
		);
	}

	return renderToStaticMarkup(<Harness />);
}

describe("RadarrDefaults", () => {
	beforeEach(() => {
		mocks.publicOptions = configuredPublicOptions(true);
		mocks.formResources = undefined;
		mocks.isFetching = false;
		mocks.savePublicOptions.mockReset();
	});

	it("renders static defaults when provider resources are unavailable", () => {
		const view = getDefaultsMarkup();

		expect(view).toContain("Default add options");
		expect(view).toContain("Minimum availability");
		expect(view).toContain("Monitor movie");
		expect(view).toContain("Search Movie");
		expect(view).toContain("radarr-root-folder:disabled");
		expect(view).toContain("radarr-quality-profile:disabled");
		expect(view).toContain("Static defaults remain editable.");
	});

	it("renders fetched folders, quality profiles, and tags when available", () => {
		mocks.formResources = {
			qualityProfiles: [
				{ id: parseProviderQualityProfileId(1), name: "HD" },
			],
			rootFolders: [{ id: 1, path: "/movies" }],
			tags: [{ id: parseProviderTagId(2), label: "seasonal" }],
		};

		const view = getDefaultsMarkup();

		expect(view).toContain("radarr-root-folder:enabled");
		expect(view).toContain("/movies");
		expect(view).toContain("radarr-quality-profile:enabled");
		expect(view).toContain("HD");
		expect(view).toContain("radarr-tags:tags:seasonal");
	});

	it("renders the connect message when Radarr is not configured", () => {
		mocks.publicOptions = configuredPublicOptions(false);

		const view = getDefaultsMarkup();

		expect(view).toContain("Connect Radarr to configure defaults.");
	});
});
