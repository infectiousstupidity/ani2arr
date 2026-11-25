// @vitest-environment happy-dom

import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/shared/errors/error.types";
import { createError } from "@/shared/errors/error-utils";
import { DetailsPanel } from "../details/details-panel";
import { RadarrMappingPanel } from "../radarr/radarr-mapping-panel";
import { SonarrMappingPanel } from "../sonarr/sonarr-mapping-panel";
import type { MediaModalTargetSummary } from "../types";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/queries/sonarr", () => ({ useSonarrLookupSearch: lookup }));
vi.mock("@/queries/radarr", () => ({ useRadarrLookupSearch: lookup }));

// Exercise the result UI after an explicit search without a trusted DOM event.
vi.mock("./mapping-search-shell", async (importOriginal) => {
	const { MappingSearchShell } =
		await importOriginal<typeof import("./mapping-search-shell")>();
	return {
		MappingSearchShell: (props: Parameters<typeof MappingSearchShell>[0]) => (
			<MappingSearchShell {...props} hasSearchTerm />
		),
	};
});

const title = "Example title";
const overview = "Lookup overview";
const posterUrl = "https://posters.example.invalid/cover.jpg";
const id = 123;

describe.each([
	{
		provider: "sonarr" as const,
		label: "Sonarr",
		Panel: SonarrMappingPanel,
		idsKey: "libraryTvdbIds",
		linkedKey: "linkedAniListIdsByTvdbId",
		result: { tvdbId: id, title, overview, titleSlug: "example-title" },
		stats: { statsMap: { [id]: { episodeCount: 12, episodeFileCount: 3 } } },
		inLibraryLabel: "In Sonarr: 3/12 eps",
	},
	{
		provider: "radarr" as const,
		label: "Radarr",
		Panel: RadarrMappingPanel,
		idsKey: "libraryTmdbIds",
		linkedKey: "linkedAniListIdsByTmdbId",
		result: {
			tmdbId: id,
			title,
			overview,
			titleSlug: "example-title",
			hasFile: true,
		},
		stats: {},
		inLibraryLabel: "In Radarr: 1 file",
	},
])(
	"$label mapping search",
	({
		provider,
		label,
		Panel,
		idsKey,
		linkedKey,
		result,
		stats,
		inLibraryLabel,
	}) => {
		const onSelect =
			vi.fn<(candidate: { summary: MediaModalTargetSummary } | null) => void>();
		let container: HTMLDivElement;
		let root: ReturnType<typeof createRoot>;

		beforeEach(() => {
			vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
			container = document.createElement("div");
			document.body.append(container);
			root = createRoot(container);
		});

		afterEach(() => {
			act(() => root.unmount());
			container.remove();
		});

		function mountPanel(): void {
			root.render(
				<Tooltip.Provider>
					<Panel
						contentContainer={null}
						currentTarget={null}
						selectedCandidate={null}
						onSelectCandidate={onSelect}
					/>
				</Tooltip.Provider>,
			);
		}

		it.each([
			{ libraryIds: null, membership: null, state: "unknown" },
			{ libraryIds: [], membership: false, state: "absent" },
			{ libraryIds: [id], membership: true, state: "present" },
		])(
			"renders and selects a candidate with $state membership without waiting for its poster",
			({ libraryIds, membership }) => {
				// Simulate a poster request that never emits load or error.
				vi.stubGlobal(
					"Image",
					class extends EventTarget {
						complete = false;
					},
				);
				lookup.mockReturnValue({
					data: {
						results: [{ ...result, remotePoster: posterUrl }],
						[idsKey]: libraryIds,
						[linkedKey]: { [id]: [21] },
						...stats,
					},
				});
				act(mountPanel);

				expect(container.textContent).toContain("1 linked");
				expect(container.textContent?.includes(inLibraryLabel)).toBe(
					membership === true,
				);
				expect(
					container.querySelector(
						`[aria-label=${CSS.escape(`Open in ${label}`)}]`,
					) !== null,
				).toBe(membership !== null);
				act(() =>
					container
						.querySelector<HTMLButtonElement>(
							`[aria-label=${CSS.escape(`Preview match: ${title}`)}]`,
						)
						?.click(),
				);

				const summary = onSelect.mock.lastCall?.[0]?.summary;
				expect(summary).toMatchObject({
					title,
					overview,
					isInLibrary: membership,
					posterUrl,
					linkedAniListIds: [21],
				});
				expect(summary?.providerRouteSlug).toBe(
					membership === true ? "example-title" : undefined,
				);
				if (provider === "sonarr") {
					expect(summary?.episodeFileCount).toBe(
						membership === true ? 3 : undefined,
					);
				}

				const view = renderToStaticMarkup(
					<Tooltip.Provider>
						<QueryClientProvider client={new QueryClient()}>
							<DetailsPanel
								provider={provider}
								contentContainer={null}
								effectiveMapping={null}
								previewMapping={summary ?? null}
								isInMappingMode
							/>
						</QueryClientProvider>
					</Tooltip.Provider>,
				);
				if (membership === null) {
					expect(view).toContain(`${label} library status unknown`);
					expect(view).not.toContain(`Not in ${label}`);
					expect(view).not.toContain(`aria-label="Open in ${label}"`);
				} else {
					expect(view).toContain(
						membership ? inLibraryLabel : `Not in ${label}`,
					);
				}
			},
		);

		it("renders lookup errors", () => {
			lookup.mockReturnValue({
				error: createError(
					ErrorCode.API_ERROR,
					"Internal error",
					"Lookup failed.",
				),
			});
			act(mountPanel);
			expect(container.textContent).toContain("Lookup failed.");
		});
	},
);
