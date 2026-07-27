/** Regression tests for source-only anime-page provider actions. */

import { renderToStaticMarkup } from "react-dom/server";
import * as Tooltip from "@radix-ui/react-tooltip";
import { describe, expect, it, vi } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import { useSeerrTarget } from "@/queries/seerr";
import { ContentRoot, type AnimePageTarget } from "./root";

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

const source = { source: "mal", id: parseMyAnimeListId(1) } as const;

function createTarget(format: "MOVIE" | "TV"): AnimePageTarget {
	const title = format === "MOVIE" ? "Example Movie" : "Example Series";
	return {
		source,
		format,
		title,
		metadata: { titles: { english: title }, format },
	};
}

function renderTarget(target: AnimePageTarget): string {
	return renderToStaticMarkup(
		<Tooltip.Provider>
			<ContentRoot target={target} />
		</Tooltip.Provider>,
	);
}

describe("ContentRoot", () => {
	it("renders source-only MAL provider actions while alias lookup is pending", () => {
		const target = createTarget("MOVIE");
		const view = renderTarget(target);

		expect(view).toContain("Checking Radarr");
		expect(useRadarrMediaAction).toHaveBeenCalledWith(
			expect.objectContaining({
				source: target.source,
				metadata: target.metadata,
				enabled: true,
				statusBlocked: false,
			}),
		);
		expect(useRadarrMediaAction).not.toHaveBeenCalledWith(
			expect.objectContaining({ anilistId: expect.anything() }),
		);
		expect(useSeerrTarget).toHaveBeenCalledWith(
			{
				source: target.source,
				title: target.title,
				metadata: target.metadata,
			},
			{ enabled: false },
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
		const target = createTarget("TV");
		const view = renderTarget(target);
		const actionInput = vi.mocked(useSonarrMediaAction).mock.calls.at(-1)?.[0];

		expect(view).toContain("Find match");
		actionInput?.onOpenMapping?.();
		expect(modalOpen).toHaveBeenCalledWith({
			source: target.source,
			kind: "provider",
			provider: "sonarr",
			initialView: "mapping",
			openSource: "content",
			metadataHint: {
				title: "Example Series",
				format: "TV",
				coverImage: null,
			},
		});
	});
});
