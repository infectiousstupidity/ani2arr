/** Regression tests for source-only anime-page provider actions. */

import { renderToStaticMarkup } from "react-dom/server";
import * as Tooltip from "@radix-ui/react-tooltip";
import { describe, expect, it, vi } from "vitest";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import { ContentRoot } from "./root";

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
	useSeerrTargets: vi.fn(() => ({ data: undefined })),
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
		open: vi.fn(),
		close: vi.fn(),
	})),
}));

describe("ContentRoot", () => {
	it("renders a source-only MAL Arr action while alias lookup is pending", () => {
		const source = { source: "mal", id: parseMyAnimeListId(59_571) } as const;

		const view = renderToStaticMarkup(
			<Tooltip.Provider>
				<ContentRoot
					target={{
						source,
						format: "MOVIE",
						title: "Kaguya-sama: The First Kiss That Never Ends",
					}}
				/>
			</Tooltip.Provider>,
		);

		expect(view).toContain("Checking Radarr");
		expect(useRadarrMediaAction).toHaveBeenCalledWith(
			expect.objectContaining({
				source,
				enabled: true,
				statusBlocked: false,
			}),
		);
		expect(useRadarrMediaAction).not.toHaveBeenCalledWith(
			expect.objectContaining({ anilistId: expect.anything() }),
		);
		expect(view).not.toContain("Actions");
		expect(view).not.toContain("Seerr");
	});
});
