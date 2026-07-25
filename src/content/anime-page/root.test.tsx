/** Regression tests for source-only anime-page provider actions. */

import { renderToStaticMarkup } from "react-dom/server";
import * as Tooltip from "@radix-ui/react-tooltip";
import { describe, expect, it, vi } from "vitest";
import type { AniListMediaHint } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import { useSeerrTarget } from "@/queries/seerr";
import { ContentRoot } from "./root";

const modalOpen = vi.hoisted(() => vi.fn());

vi.mock("@/features/media-action/use-radarr-media-action", () => ({
	useRadarrMediaAction: vi.fn(() => ({
		status: {
			state: "checking",
			errorSource: null,
			hasMapping: false,
			disabled: true,
		},
		openProvider: null,
		runPrimaryAction: vi.fn(),
	})),
}));

vi.mock("@/features/media-action/use-sonarr-media-action", () => ({
	useSonarrMediaAction: vi.fn(),
}));

vi.mock("@/queries/mapping", () => ({
	useMappingIdentities: vi.fn(() => ({ data: undefined })),
	useSourceAniListIdMap: vi.fn(() => ({ data: undefined, isPending: true })),
}));

vi.mock("@/queries/anilist", () => ({
	useAniListMetadataBatch: vi.fn(() => ({
		data: undefined,
		isFetched: false,
		isError: false,
	})),
}));

vi.mock("@/queries/options", () => ({
	usePublicOptions: vi.fn(() => ({ data: undefined, isPending: false })),
}));

vi.mock("@/queries/seerr", () => ({
	useSeerrMediaStatus: vi.fn(() => ({
		data: undefined,
		isEnabled: false,
		isError: false,
	})),
	useSeerrTarget: vi.fn(() => ({ data: null })),
}));

vi.mock("@/queries/use-a2a-broadcasts", () => ({
	useA2aBroadcasts: vi.fn(),
}));

vi.mock("@/shared/hooks/use-theme", () => ({
	useTheme: vi.fn(),
}));

vi.mock("@/features/media-modal/hooks/use-media-modal-state", () => ({
	useMediaModalState: vi.fn(() => ({
		state: null,
		open: modalOpen,
		close: vi.fn(),
	})),
}));

describe("ContentRoot", () => {
	it("renders source-only MAL provider actions while alias lookup is pending", () => {
		const source = { source: "mal", id: parseMyAnimeListId(59_571) } as const;
		const metadata: AniListMediaHint = {
			titles: { english: "Kaguya-sama: The First Kiss That Never Ends" },
			synonyms: ["Kaguya-sama wa Kokurasetai: First Kiss wa Owaranai"],
			format: "MOVIE",
		};

		const view = renderToStaticMarkup(
			<Tooltip.Provider>
				<ContentRoot
					target={{
						source,
						format: "MOVIE",
						title: "Kaguya-sama: The First Kiss That Never Ends",
						metadata,
					}}
				/>
			</Tooltip.Provider>,
		);

		expect(view).toContain("Checking Radarr");
		expect(useRadarrMediaAction).toHaveBeenCalledWith(
			expect.objectContaining({
				source,
				metadata,
				enabled: true,
				statusBlocked: false,
			}),
		);
		expect(useRadarrMediaAction).not.toHaveBeenCalledWith(
			expect.objectContaining({ anilistId: expect.anything() }),
		);
		expect(view).toContain("Actions");
		expect(view).toContain("Configure Seerr");
		expect(useSeerrTarget).toHaveBeenCalledWith(
			{ source },
			{ enabled: true },
		);
	});

	it("opens manual mapping for a source-only MAL page", () => {
		vi.mocked(useSonarrMediaAction).mockReturnValueOnce({
			status: {
				state: "unmapped",
				action: "open-mapping",
				errorSource: null,
				hasMapping: false,
				disabled: false,
			},
			openProvider: null,
			runPrimaryAction: vi.fn(),
		});
		const source = { source: "mal", id: parseMyAnimeListId(63_816) } as const;
		const metadata: AniListMediaHint = {
			titles: {
				english: "Frieren: Beyond Journey's End - Golden Land Arc",
			},
			format: "TV",
		};

		const view = renderToStaticMarkup(
			<Tooltip.Provider>
				<ContentRoot
					target={{
						source,
						format: "TV",
						title: "Sousou no Frieren: Ougonkyou-hen",
						metadata,
					}}
				/>
			</Tooltip.Provider>,
		);
		const actionInput = vi.mocked(useSonarrMediaAction).mock.calls.at(-1)?.[0];

		expect(view).toContain("Find match");
		actionInput?.onOpenMapping?.();
		expect(modalOpen).toHaveBeenCalledWith({
			source,
			kind: "provider",
			provider: "sonarr",
			initialView: "mapping",
			openSource: "content",
			metadataHint: {
				title: "Frieren: Beyond Journey's End - Golden Land Arc",
				format: "TV",
				coverImage: null,
			},
		});
	});
});
