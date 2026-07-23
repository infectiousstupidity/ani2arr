/** Tests for browse-card provider resolution inputs. */
// src/content/browse/browse-card-overlay.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import type { MappingIdentity } from "@/rpc/types";
import type { HostMediaTarget } from "./types";
import { resolveBrowseCardProvider } from "./browse-card-provider";
import { BrowseCardOverlay } from "./browse-card-overlay";
import { SonarrCardOverlay } from "@/features/media-overlay/sonarr-card-overlay";
import { RadarrCardOverlay } from "@/features/media-overlay/radarr-card-overlay";
import { SeerrCardStackActions } from "@/features/media-overlay/seerr-card-overlay";
import { createDefaultPublicOptions } from "@/settings/schema";

const mountTarget = {} as HTMLElement;

function createTarget(format: HostMediaTarget["format"]): HostMediaTarget {
	const anilistId = parseAniListId(210_031);
	return {
		source: { source: "anilist", id: anilistId },
		anilistId,
		title: "Example",
		format,
		mountTarget,
	};
}

describe("resolveBrowseCardProvider", () => {
	it("uses metadata format when host card format is unknown", () => {
		expect(
			resolveBrowseCardProvider({
				parsed: createTarget(null),
				metadata: {
					titles: null,
					synonyms: null,
					startYear: null,
					format: "TV",
					relationPrequelIds: null,
					coverImage: null,
				},
				mappedIdentities: [],
			}),
		).toBe("sonarr");
	});

	it("uses mapped identity when both host and metadata formats are unknown", () => {
		const mappedIdentities: MappingIdentity[] = [
			{
				source: { source: "anilist", id: parseAniListId(210_031) },
				anilistId: parseAniListId(210_031),
				provider: "sonarr",
				result: {
					kind: "mapped",
					source: "auto",
					providerId: 123,
				},
			},
		];

		expect(
			resolveBrowseCardProvider({
				parsed: createTarget(null),
				metadata: null,
				mappedIdentities,
			}),
		).toBe("sonarr");
	});
});

describe("BrowseCardOverlay", () => {
	it.each([
		["TV" as const, SonarrCardOverlay],
		["MOVIE" as const, RadarrCardOverlay],
	])("renders the source-only %s Arr action", (format, expectedComponent) => {
		const parsed: HostMediaTarget = {
			source: { source: "mal", id: parseMyAnimeListId(5114) },
			title: "Fullmetal Alchemist: Brotherhood",
			format,
			mountTarget,
		};

		const overlay = BrowseCardOverlay({
			parsed,
			adapter: {
				cardSelector: ".card",
				parseCard: () => null,
				getObserverRoot: () => document.body,
				getScanRoot: () => document.body,
				anchorCorner: "top-left",
				stackDirection: "down",
			},
			publicOptions: undefined,
			mappedIdentities: [],
			metadata: null,
			onOpenMediaModal: () => {},
			tooltipContainer: null,
		});

		expect(overlay).not.toBeNull();
		expect(overlay).toMatchObject({
			type: expectedComponent,
			props: {
				anilistId: undefined,
				source: parsed.source,
				extraAction: null,
			},
		});
	});

	it.each(["status-column", "action-row"] as const)(
		"keeps Arr before Seerr for %s targets",
		(presentation) => {
			const parsed = {
				...createTarget("TV"),
				presentation,
			};
			const publicOptions = createDefaultPublicOptions();
			publicOptions.ui.browseCards.primaryStatus = "seerr";
			publicOptions.seerr.isConfigured = true;

			const overlay = BrowseCardOverlay({
				parsed,
				adapter: {
					cardSelector: ".card",
					parseCard: () => null,
				},
				publicOptions,
				mappedIdentities: [],
				metadata: null,
				onOpenMediaModal: () => {},
				tooltipContainer: null,
			});

			expect(overlay).toMatchObject({
				type: SonarrCardOverlay,
				props: {
					presentation,
					extraAction: {
						type: SeerrCardStackActions,
						props: { presentation },
					},
				},
			});
		},
	);
});
