// @vitest-environment happy-dom
/** Viewport gating tests for the shared Seerr card action. */

import type { ComponentType, ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { useSeerrMediaAction } from "@/features/media-action/use-seerr-media-action";
import {
	SeerrCardStackActions,
	SeerrStandaloneCardOverlay,
} from "./seerr-card-overlay";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
	.IS_REACT_ACT_ENVIRONMENT = true;

const mediaActionMock = vi.hoisted(() =>
	vi.fn(() => ({
		status: {
			state: "unconfigured" as const,
			label: "Configure Seerr…",
			disabled: false,
		},
		visualStatus: undefined,
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
	renderToStaticMarkup(<SeerrCardStackActions {...props} presentation="status-column" />);
	expect(useSeerrMediaAction).toHaveBeenLastCalledWith(
		expect.objectContaining({ enabled: true }),
	);
});

it("enables floating actions when the card is already hovered or focused", async () => {
	viewportMock.mockReturnValue(true);
	const card = document.createElement("div");
	card.className = "media-card";
	const target = document.createElement("div");
	card.append(target);
	document.body.append(card);
	const matches = vi.spyOn(card, "matches").mockReturnValue(true);
	const root = createRoot(target);
	// eslint-disable-next-line testing-library/no-unnecessary-act
	await act(async () => {
		root.render(<SeerrCardStackActions {...props} observeTarget={target} />);
	});
	expect(matches).toHaveBeenCalledWith(":hover, :focus-within");
	expect(useSeerrMediaAction).toHaveBeenLastCalledWith(
		expect.objectContaining({ enabled: true }),
	);
	await act(async () => root.unmount());
	card.remove();
});

it("enables floating actions after engagement with the card ancestor", async () => {
	viewportMock.mockReturnValue(true);
	const card = document.createElement("div");
	card.className = "media-card";
	const target = document.createElement("div");
	card.append(target);
	document.body.append(card);
	const root = createRoot(target);
	// eslint-disable-next-line testing-library/no-unnecessary-act
	await act(async () => {
		root.render(<SeerrCardStackActions {...props} observeTarget={target} />);
	});
	expect(useSeerrMediaAction).toHaveBeenLastCalledWith(
		expect.objectContaining({ enabled: false }),
	);
	await act(async () => {
		card.dispatchEvent(new Event("pointerenter"));
	});
	expect(useSeerrMediaAction).toHaveBeenLastCalledWith(
		expect.objectContaining({ enabled: true }),
	);
	await act(async () => root.unmount());
	card.remove();
});
