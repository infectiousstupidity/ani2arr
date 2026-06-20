/** Media modal public and shared prop types. */
// src/features/media-modal/types.ts

import type { AniListId, AniListMediaFormat } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";

export type MediaModalView = "setup" | "mapping";
export type MediaModalOpenSource = "content" | "options-page";

export type MediaModalMetadataHint = {
	title?: string;
	format?: AniListMediaFormat | null;
	coverImage?: string | null;
};

export type AniListHeaderData = {
	title: string;
	bannerImage: string | null;
	coverImage: string | null;
	format: AniListMediaFormat | null;
	year: number | null;
};

export type MediaModalTargetSummary = {
	provider: Provider;
	providerId: TvdbId | TmdbId;
	title: string;
	isInLibrary: boolean;
	providerFolderName?: string;
	year?: number;
	typeLabel?: string;
	providerRouteSlug?: string;
	posterUrl?: string;
	statusLabel?: string;
	overview?: string;
	episodeCount?: number;
	episodeFileCount?: number;
	runtimeMinutes?: number;
	hasFile?: boolean;
	linkedAniListIds?: AniListId[];
};

type MediaModalStateBase = {
	anilistId: AniListId;
	source?: SourceIdentity;
	openSource: MediaModalOpenSource;
	metadataHint?: MediaModalMetadataHint | null;
};

type ProviderMediaModalStateBase = MediaModalStateBase & {
	kind: "provider";
	provider: Provider;
	initialView?: MediaModalView;
};

export type SonarrMediaModalState = ProviderMediaModalStateBase & {
	provider: "sonarr";
};

export type RadarrMediaModalState = ProviderMediaModalStateBase & {
	provider: "radarr";
};

export type SeerrMediaModalState = MediaModalStateBase & {
	kind: "seerr";
};

export type MediaModalState =
	| SonarrMediaModalState
	| RadarrMediaModalState
	| SeerrMediaModalState
	| null;

export type MediaModalOpenState = Exclude<MediaModalState, null>;

export type MediaModalContainer = HTMLElement | ShadowRoot;

export type MediaModalSharedProps = {
	onClose: () => void;
	container?: MediaModalContainer | undefined;
};

export type MediaModalProps = MediaModalSharedProps & {
	state: MediaModalState;
};

export type SonarrModalProps = MediaModalSharedProps & {
	state: SonarrMediaModalState;
};

export type RadarrModalProps = MediaModalSharedProps & {
	state: RadarrMediaModalState;
};

export type SeerrModalProps = MediaModalSharedProps & {
	state: SeerrMediaModalState;
};
