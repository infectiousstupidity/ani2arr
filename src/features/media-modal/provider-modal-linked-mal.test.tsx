/** Linked-MAL provider modal UI identity regression tests. */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { RadarrModal } from "./radarr/radarr-modal";
import { SonarrModal } from "./sonarr/sonarr-modal";

const mocks = vi.hoisted(() => ({
	detailsPanel: vi.fn(() => <div>details</div>),
	mappingInspection: vi.fn(() => ({ data: undefined })),
	modalHeader: vi.fn(() => <div>header</div>),
	movieStatus: vi.fn(() => ({
		data: null,
		isError: false,
		isFetchedAfterMount: true,
	})),
	openMappingSettingsAction: vi.fn(() => vi.fn()),
	seriesStatus: vi.fn(() => ({
		data: null,
		isError: false,
		isFetchedAfterMount: true,
	})),
	sourceAniListIdMap: vi.fn(),
}));

vi.mock("@/queries/mapping", () => ({
	useMappingInspection: mocks.mappingInspection,
	useSourceAniListIdMap: mocks.sourceAniListIdMap,
}));

vi.mock("@/queries/sonarr", () => ({
	useSeriesStatus: mocks.seriesStatus,
	useSonarrFormResources: vi.fn(() => ({ data: null })),
}));

vi.mock("@/queries/radarr", () => ({
	useMovieStatus: mocks.movieStatus,
	useRadarrFormResources: vi.fn(() => ({ data: null })),
}));

vi.mock("./hooks/use-media-modal-base-data", () => ({
	useMediaModalBaseData: vi.fn(() => ({
		options: undefined,
		anilistHeaderData: {
			title: "Linked MAL entry",
			bannerImage: null,
			coverImage: null,
			format: null,
			year: null,
		},
		resolvedMetadata: null,
		providerRequestTitle: "Linked MAL entry",
		providerPayloadTitle: undefined,
		fallbackLookupTitle: undefined,
		statusMetadata: null,
		statusReady: true,
		statusTitle: undefined,
	})),
}));

vi.mock("./hooks/use-content-portal-container", () => ({
	useContentPortalContainer: vi.fn(() => null),
}));

vi.mock("./hooks/use-open-mapping-settings-action", () => ({
	useOpenMappingSettingsAction: mocks.openMappingSettingsAction,
}));

vi.mock("./hooks/use-mapping-actions", () => ({
	useMappingActions: vi.fn(() => ({
		isRevertingMapping: false,
		isRejectingCandidate: false,
		isClearingRejectedCandidate: false,
		isIgnoring: false,
		isSubmittingMapping: false,
		actionError: null,
		rejectCandidate: vi.fn(),
		clearRejectedCandidate: vi.fn(),
		ignoreTitle: vi.fn(),
		resetMapping: vi.fn(),
		applyMapping: vi.fn(),
	})),
}));

vi.mock("./sonarr/sonarr-setup-form", () => ({
	useSonarrSetupForm: vi.fn(() => ({
		content: <div>sonarr setup</div>,
		footerState: {
			canSubmit: false,
			isBusy: false,
			isSubmitting: false,
			submitLabel: "Add",
			actionError: null,
			isDirty: false,
		},
	})),
}));

vi.mock("./radarr/radarr-setup-form", () => ({
	useRadarrSetupForm: vi.fn(() => ({
		content: <div>radarr setup</div>,
		footerState: {
			canSubmit: false,
			isBusy: false,
			isSubmitting: false,
			submitLabel: "Add",
			actionError: null,
			isDirty: false,
		},
	})),
}));

vi.mock("./sonarr/sonarr-setup-values", () => ({
	canShowSonarrSetup: vi.fn(() => true),
	getSonarrSetupTarget: vi.fn(() => null),
}));

vi.mock("./radarr/radarr-setup-values", () => ({
	canShowRadarrSetup: vi.fn(() => true),
	getRadarrSetupTarget: vi.fn(() => null),
}));

vi.mock("./details/details-panel", () => ({
	DetailsPanel: mocks.detailsPanel,
}));

vi.mock("./chrome/modal-header", () => ({
	ModalHeader: mocks.modalHeader,
}));

vi.mock("./chrome/modal-shell", () => ({
	ModalShell: (props: {
		header: React.ReactNode;
		rightPane: React.ReactNode;
	}) => (
		<div>
			{props.header}
			{props.rightPane}
		</div>
	),
}));

vi.mock("./chrome/modal-footer", () => ({
	MappingFooter: vi.fn(() => <div>mapping footer</div>),
	SetupFooter: vi.fn(() => <div>setup footer</div>),
}));

const malId = parseMyAnimeListId(5114);
const anilistId = parseAniListId(21);
const source = { source: "mal", id: malId } as const;

type ProviderCase = {
	provider: "sonarr" | "radarr";
	render: () => React.JSX.Element;
	statusHook: typeof mocks.seriesStatus;
};

const cases: ProviderCase[] = [
	{
		provider: "sonarr",
		render: () => (
			<SonarrModal
				state={{
					kind: "provider",
					provider: "sonarr",
					source,
					openSource: "content",
				}}
				onClose={vi.fn()}
			/>
		),
		statusHook: mocks.seriesStatus,
	},
	{
		provider: "radarr",
		render: () => (
			<RadarrModal
				state={{
					kind: "provider",
					provider: "radarr",
					source,
					openSource: "content",
				}}
				onClose={vi.fn()}
			/>
		),
		statusHook: mocks.movieStatus,
	},
];

describe("linked MAL provider modals", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.sourceAniListIdMap.mockReturnValue({
			data: { [`mal:${malId}`]: anilistId },
		});
	});

	it.each(cases)(
		"uses the canonical ID only for $provider settings and display",
		({ provider, render, statusHook }) => {
			renderToStaticMarkup(render());

			expect(mocks.sourceAniListIdMap).toHaveBeenCalledWith([source], {
				enabled: true,
			});
			expect(mocks.openMappingSettingsAction).toHaveBeenCalledWith({
				anilistId,
				openSource: "content",
			});
			expect(mocks.modalHeader).toHaveBeenCalledWith(
				expect.objectContaining({ onOpenSettings: expect.any(Function) }),
				undefined,
			);
			expect(mocks.detailsPanel).toHaveBeenCalledWith(
				expect.objectContaining({ anilistId }),
				undefined,
			);
			expect(statusHook).toHaveBeenCalledWith(
				{
					source,
					metadata: null,
				},
				expect.any(Object),
			);
			expect(mocks.mappingInspection).toHaveBeenCalledWith(provider, source);
			expect(statusHook).not.toHaveBeenCalledWith(
				expect.objectContaining({ anilistId: expect.anything() }),
				expect.anything(),
			);
		},
	);
});
