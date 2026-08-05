/** Viewport gating tests for the shared Seerr card action. */

import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { useSeerrMediaAction } from "@/features/media-action/use-seerr-media-action";
import {
	SeerrCardStackActions,
	SeerrStandaloneCardOverlay,
} from "./seerr-card-overlay";

const mediaActionMock = vi.hoisted(() =>
	vi.fn(() => ({
		status: {
			state: "unconfigured" as const,
			label: "Configure Seerr",
			disabled: false,
		},
		visualStatus: undefined,
		visualTitle: "Configure Seerr",
		openProvider: null,
		runPrimaryAction: vi.fn(),
	})),
);
const viewportMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("./card-overlay-viewport", () => ({
	useCardOverlayInViewport: viewportMock,
}));
vi.mock("@/features/media-action/use-seerr-media-action", () => ({
	useSeerrMediaAction: mediaActionMock,
}));
vi.mock("@/shared/ui/primitives/tooltip", () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const anilistId = parseAniListId(21_003);
const props = {
	source: { source: "anilist" as const, id: anilistId },
	anilistId,
	title: "Frieren",
	metadata: { format: "TV" as const },
	mediaType: "tv" as const,
	isConfigured: true,
	onOpenModal: () => {},
};

beforeEach(() => {
	vi.clearAllMocks();
	viewportMock.mockReturnValue(false);
});

it.each([SeerrCardStackActions, SeerrStandaloneCardOverlay] as ComponentType<
	typeof props
>[])("hides %s poster actions outside the viewport", (Component) => {
	expect(renderToStaticMarkup(createElement(Component, props))).toBe("");
});

it("passes viewport enablement to the shared action", () => {
	renderToStaticMarkup(
		<SeerrCardStackActions {...props} presentation="status-column" />,
	);
	expect(useSeerrMediaAction).toHaveBeenLastCalledWith(
		expect.objectContaining({ enabled: false }),
	);

	viewportMock.mockReturnValue(true);
	renderToStaticMarkup(<SeerrCardStackActions {...props} />);
	expect(useSeerrMediaAction).toHaveBeenLastCalledWith(
		expect.objectContaining({ enabled: true }),
	);
});
