/** High-value behavior tests for the shared Seerr action. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import type { SeerrStatusSummary } from "@/providers/seerr/types";
import { useSeerrMediaStatus, useSeerrTarget } from "@/queries/seerr";
import { openSeerrPage } from "@/rpc/provider-page";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { SeerrRequestTarget } from "@/rpc/types";
import { useSeerrMediaAction } from "./use-seerr-media-action";

const queryState = vi.hoisted(() => ({
	target: {
		data: null as SeerrRequestTarget | null,
		isPending: false,
	},
	status: {
		data: undefined as SeerrStatusSummary | undefined,
		isPending: false,
	},
}));

vi.mock("@/queries/seerr", () => ({
	useSeerrTarget: vi.fn(() => queryState.target),
	useSeerrMediaStatus: vi.fn(() => queryState.status),
}));
vi.mock("@/rpc/provider-page", () => ({ openSeerrPage: vi.fn() }));
vi.mock("@/rpc/runtime-messages", () => ({ openOptionsPage: vi.fn() }));

const anilistId = parseAniListId(21_003);
const tmdbId = parseTmdbId(37_854);
const onOpenModal = vi.fn();
const baseInput: Parameters<typeof useSeerrMediaAction>[0] = {
	source: { source: "anilist", id: anilistId },
	anilistId,
	title: "Frieren",
	metadata: { format: "TV" },
	mediaType: "tv",
	isConfigured: true,
	enabled: true,
	onOpenModal,
};

function getAction(
	overrides: Partial<typeof baseInput> = {},
): ReturnType<typeof useSeerrMediaAction> {
	// The query hooks are mocks, so no React dispatcher is needed in this unit test.
	// eslint-disable-next-line react-hooks/rules-of-hooks
	return useSeerrMediaAction({ ...baseInput, ...overrides });
}

beforeEach(() => {
	vi.clearAllMocks();
	queryState.target.data = null;
	queryState.target.isPending = false;
	queryState.status.data = undefined;
	queryState.status.isPending = false;
});

describe("useSeerrMediaAction", () => {
	it("gates target and status work", () => {
		const disabledInputs: Array<Partial<typeof baseInput>> = [
			{ isConfigured: false },
			{ enabled: false },
			{ statusBlocked: true },
			{ mediaType: null },
		];

		for (const input of disabledInputs) {
			vi.mocked(useSeerrTarget).mockClear();
			vi.mocked(useSeerrMediaStatus).mockClear();
			const action = getAction(input);

			expect(useSeerrTarget).toHaveBeenLastCalledWith(
				input.mediaType === null ? null : expect.anything(),
				{ enabled: false },
			);
			expect(useSeerrMediaStatus).toHaveBeenLastCalledWith({
				requestInput: null,
				enabled: false,
			});
			if (input.statusBlocked) {
				expect(action.status.label).toBe("Checking Seerr...");
			}
		}
	});

	it("distinguishes a pending target from a settled missing target", () => {
		queryState.target.isPending = true;
		expect(getAction().status.label).toBe("Checking Seerr...");

		queryState.target.isPending = false;
		const action = getAction();
		expect(action.status.label).toBe("Choose Seerr target");

		action.runPrimaryAction();
		expect(onOpenModal).toHaveBeenCalledOnce();
	});

	it("checks status after resolving a usable target", () => {
		queryState.target.data = {
			source: "automatic",
			mediaType: "tv",
			tmdbId,
			seasons: [1],
		};
		queryState.status.isPending = true;

		const action = getAction();

		expect(useSeerrMediaStatus).toHaveBeenCalledWith({
			requestInput: { mediaType: "tv", tmdbId, seasons: [1] },
			enabled: true,
		});
		expect(action.status.label).toBe("Checking Seerr...");
		expect(action.openProvider).not.toBeNull();
	});

	it("keeps partial status actionable and opens the resolved provider target", () => {
		queryState.target.data = {
			source: "automatic",
			mediaType: "tv",
			tmdbId,
			seasons: [1],
		};
		queryState.status.data = {
			target: "not-requested",
			overall: "partial",
		};

		const action = getAction();

		expect(action.visualTitle).toBe(
			"Partially in Seerr. Request mapped season.",
		);
		action.runPrimaryAction();
		expect(onOpenModal).toHaveBeenCalledOnce();
		action.openProvider?.();
		expect(openSeerrPage).toHaveBeenCalledWith({ mediaType: "tv", tmdbId });
	});

	it.each(["available", "pending"] as const)(
		"keeps %s status actionable",
		(status) => {
			queryState.target.data = {
				source: "automatic",
				mediaType: "movie",
				tmdbId,
			};
			queryState.status.data = { target: status, overall: status };

			const action = getAction({ mediaType: "movie" });

			expect(action.status.disabled).toBe(false);
			action.runPrimaryAction();
			expect(onOpenModal).toHaveBeenCalledOnce();
		},
	);

	it("opens settings when Seerr is unconfigured", () => {
		getAction({ isConfigured: false }).runPrimaryAction();

		expect(openOptionsPage).toHaveBeenCalledWith({ sectionId: "seerr" });
		expect(onOpenModal).not.toHaveBeenCalled();
	});
});
