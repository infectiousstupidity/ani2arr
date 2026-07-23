/** Focused viewport tests for Seerr card overlay presentations. */

import { renderToStaticMarkup } from "react-dom/server";
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

vi.mock("./card-overlay-viewport", () => ({
	useCardOverlayInViewport: () => false,
}));

vi.mock("@/queries/seerr", () => queryMocks);

const anilistId = parseAniListId(21_003);

const overlayRenderers = [
	{
		name: "stacked",
		render: (presentation?: "status-column", isConfigured = false) => (
			<SeerrCardStackActions
				anilistId={anilistId}
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
				anilistId={anilistId}
				isConfigured={isConfigured}
				onOpenModal={() => {}}
				presentation={presentation}
			/>
		),
	},
];

beforeEach(() => {
	vi.clearAllMocks();
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
			anilistId={anilistId}
			isConfigured={true}
			onOpenModal={() => {}}
			presentation="status-column"
		/>,
	);

	expect(queryMocks.useSeerrTarget).toHaveBeenCalledWith(anilistId, {
		enabled: false,
	});
	expect(queryMocks.useSeerrMediaStatus).toHaveBeenCalledWith({
		requestInput: null,
		enabled: false,
	});
});
