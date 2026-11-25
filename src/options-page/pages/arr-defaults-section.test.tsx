// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { useUpdatePublicOptions } from "@/queries/options";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { ProviderFormResources } from "@/providers/types";
import { ArrDefaultsSection } from "./arr-defaults-section";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
	if (root) await act(async () => root?.unmount());
	container?.remove();
	root = null;
	container = null;
});

const resources = {
	rootFolders: [{ path: "/movies" }],
	qualityProfiles: [{ id: 7, name: "HD" }],
	tags: [],
} as unknown as ProviderFormResources;

const savedDefaults = { freeformTags: [] } as RadarrFormState;

const button = (name: string) =>
	[...container!.querySelectorAll("button")].find(
		(el) => el.textContent === name,
	)!;

async function mount(formResources?: ProviderFormResources, mutate = vi.fn()) {
	if (!container) {
		container = document.createElement("div");
		document.body.append(container);
	}
	root ??= createRoot(container);
	const saveOptions = {
		mutate,
		isPending: false,
		error: null,
	} as unknown as ReturnType<typeof useUpdatePublicOptions>;
	await act(async () =>
		root!.render(
			<ArrDefaultsSection
				provider="radarr"
				description="desc"
				savedDefaults={savedDefaults}
				formResources={formResources}
				isFetching={false}
				saveOptions={saveOptions}
				toUpdate={(defaults) => ({ type: "radarrDefaults", defaults })}
				renderFields={({ values, onChange }) => (
					<input
						data-testid="field"
						value={values.minimumAvailability ?? ""}
						onChange={(event) =>
							onChange(
								"minimumAvailability",
								event.target.value as RadarrFormState["minimumAvailability"],
							)
						}
					/>
				)}
			/>,
		),
	);
	return mutate;
}

it("saves edits, cancels to initial values, and keeps resource-derived defaults unsaved", async () => {
	const mutate = await mount(resources);

	// Resource-derived defaults are the initial draft: nothing to cancel, but
	// they differ from saved values, so they stay explicitly saveable.
	expect(button("Cancel").disabled).toBe(true);
	expect(button("Save defaults").disabled).toBe(false);

	const input = container!.querySelector<HTMLInputElement>("input")!;
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)!.set!;
	await act(async () => {
		setValue.call(input, "released");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	expect(button("Cancel").disabled).toBe(false);

	await act(async () => button("Cancel").click());
	expect(input.value).toBe("");
	expect(button("Cancel").disabled).toBe(true);

	await act(async () => {
		setValue.call(input, "released");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(async () => button("Save defaults").click());
	expect(mutate).toHaveBeenCalledWith({
		type: "radarrDefaults",
		defaults: {
			freeformTags: [],
			rootFolderPath: "/movies",
			qualityProfileId: 7,
			minimumAvailability: "released",
		},
	});
});

it("shows resource-derived defaults when resources arrive without saving them", async () => {
	const mutate = await mount();
	expect(button("Save defaults").disabled).toBe(true);

	await mount(resources, mutate);
	expect(button("Save defaults").disabled).toBe(false);
	expect(mutate).not.toHaveBeenCalled();
});
