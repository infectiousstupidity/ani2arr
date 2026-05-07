/** Media modal public and shared prop types. */
// src/features/media-modal/types.ts

import type { AniListId } from "@/anilist";
import type {
	AniListMediaHint,
	AniListMediaFormat,
} from "@/anilist/schemas/media.schema";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import type { ProviderFormOptions } from "@/providers";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type {
	RadarrLaunchSnapshot,
	SonarrLaunchSnapshot,
} from "./launch-snapshot";

export type MediaModalView = "setup" | "mapping";
export type MediaModalSetupMode = "add" | "edit";
export type MediaModalOpenSource = "content" | "options-page";

export type AniListHeaderData = {
	title: string;
	bannerImage: string | null;
	coverImage: string | null;
	format: AniListMediaFormat | null;
	year: number | null;
};

export type ProviderStatus =
	| CheckSeriesStatusResponse
	| CheckMovieStatusResponse
	| null
	| undefined;

export type MediaModalBaseData = {
	anilistId: AniListId;
	baseUrl: string;
	isConfigured: boolean;
	anilistHeaderData: AniListHeaderData;
	manualMappingActive: boolean;
	currentMapping: MappingSearchResult | null;
	resolvedMetadata: AniListMediaHint | null;
	providerRequestTitle: string;
	fallbackLookupTitle?: string;
	verificationSettled: boolean;
	verificationFailed: boolean;
};

export type RadarrMediaModalData = MediaModalBaseData & {
	provider: "radarr";
	rawProviderStatus: CheckMovieStatusResponse | null;
	providerFormOptions: ProviderFormOptions | null;
	storedDefaults: RadarrFormState;
};

export type SonarrMediaModalData = MediaModalBaseData & {
	provider: "sonarr";
	rawProviderStatus: CheckSeriesStatusResponse | null;
	providerFormOptions: ProviderFormOptions | null;
	storedDefaults: SonarrFormState;
};

export type MediaModalData = RadarrMediaModalData | SonarrMediaModalData;

type MediaModalStateBase = {
	anilistId: AniListId;
	initialView?: MediaModalView;
	openSource: MediaModalOpenSource;
	launchTitle?: string;
	launchMetadata?: AniListMediaHint | null;
};

export type SonarrMediaModalState = MediaModalStateBase & {
	provider: "sonarr";
	launchStatus?: CheckSeriesStatusResponse | null;
	launchSnapshot?: SonarrLaunchSnapshot | null;
};

export type RadarrMediaModalState = MediaModalStateBase & {
	provider: "radarr";
	launchStatus?: CheckMovieStatusResponse | null;
	launchSnapshot?: RadarrLaunchSnapshot | null;
};

export type MediaModalState =
	| SonarrMediaModalState
	| RadarrMediaModalState
	| null;

export type MediaModalOpenState = Exclude<MediaModalState, null>;

export type MediaModalContainer = HTMLElement | ShadowRoot;

export type MappingSavedHandler = (input: {
	anilistId: AniListId;
	mapping: MappingSearchResult | null;
}) => void;

export type MappingSaveErrorHandler = (input: {
	anilistId: AniListId;
	error: Error;
}) => void;

export type MediaModalSharedProps = {
	onClose: () => void;
	container?: MediaModalContainer;
	onMappingSaved?: MappingSavedHandler;
	onMappingSaveError?: MappingSaveErrorHandler;
};

export type MediaModalProps = MediaModalSharedProps & {
	state: MediaModalState;
};

export type ProviderModalProps = MediaModalSharedProps & {
	state: MediaModalOpenState;
};

export type SonarrProviderModalProps = MediaModalSharedProps & {
	state: SonarrMediaModalState;
};

export type RadarrProviderModalProps = MediaModalSharedProps & {
	state: RadarrMediaModalState;
};
