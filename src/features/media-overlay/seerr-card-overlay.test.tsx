/** Focused viewport tests for Seerr card overlay presentations. */

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import {
	SeerrCardStackActions,
	SeerrStandaloneCardOverlay,
} from "./seerr-card-overlay";

const queryMocks = vi.hoisted(() => ({
	useSeerrTarget: vi.fn(() => ({ data: null })),
	useSeerrMediaStatus: vi.fn(() => ({
		data: undefined,
		isEnabled: false,
		isError: false,
	})),
}));
const viewportMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("./card-overlay-viewport", () => ({
	useCardOverlayInViewport: viewportMock,
}));

vi.mock("@/queries/seerr", () => queryMocks);

vi.mock("@/shared/ui/primitives/tooltip", () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const anilistId = parseAniListId(21_003);

const overlayRenderers = [
	{
		name: "stacked",
		render: (presentation?: "status-column", isConfigured = false) => (
			<SeerrCardStackActions
				source={{ source: "anilist", id: anilistId }}
				anilistId={anilistId}
				title="Frieren"
				metadata={{ format: "TV", startYear: 2023 }}
				isConfigured={isConfigured}
				onOpenModal={() => {}}
				presentation={presentation}
			/>
		),
	},
	{
		name: "standalone",
		render: (presentation?: "status-column", isConfigured = false) => (
			<SeerrStandaloneCardOverlay
				source={{ source: "anilist", id: anilistId }}
				anilistId={anilistId}
				title="Frieren"
				metadata={{ format: "TV", startYear: 2023 }}
				isConfigured={isConfigured}
				onOpenModal={() => {}}
				presentation={presentation}
			/>
		),
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	viewportMock.mockReturnValue(false);
});

describe.each(overlayRenderers)("$name Seerr overlay outside the viewport", ({
	render,
}) => {
	it("renders Configure Seerr for the status-column presentation", () => {
		const view = renderToStaticMarkup(render("status-column"));

		expect(view).toContain('data-presentation="status-column"');
		expect(view).toContain("Configure Seerr");
	});

	it("does not render the poster presentation", () => {
		expect(renderToStaticMarkup(render())).toBe("");
	});
});

it("keeps configured Seerr status queries disabled outside the viewport", () => {
	renderToStaticMarkup(
		<SeerrCardStackActions
			source={{ source: "anilist", id: anilistId }}
			anilistId={anilistId}
			title="Frieren"
			metadata={{ format: "TV", startYear: 2023 }}
			isConfigured={true}
			onOpenModal={() => {}}
			presentation="status-column"
		/>,
	);

	expect(queryMocks.useSeerrTarget).toHaveBeenCalledWith(
		{
			source: { source: "anilist", id: anilistId },
			anilistId,
			title: "Frieren",
			metadata: { format: "TV", startYear: 2023 },
		},
		{ enabled: false },
	);
	expect(queryMocks.useSeerrMediaStatus).toHaveBeenCalledWith({
		requestInput: null,
		enabled: false,
	});
});

it("requests automatic resolution with card metadata inside the viewport", () => {
	viewportMock.mockReturnValue(true);

	renderToStaticMarkup(
		<SeerrCardStackActions
			source={{ source: "anilist", id: anilistId }}
			anilistId={anilistId}
			title="Frieren"
			metadata={{ format: "TV", startYear: 2023 }}
			isConfigured={true}
			onOpenModal={() => {}}
		/>,
	);

	expect(queryMocks.useSeerrTarget).toHaveBeenCalledWith(
		{
			source: { source: "anilist", id: anilistId },
			anilistId,
			title: "Frieren",
			metadata: { format: "TV", startYear: 2023 },
		},
		{ enabled: true },
	);
});
