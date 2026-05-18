/** Media modal public and shared prop types. */
// src/features/media-modal/types.ts

import type { AniListId } from "@/anilist";
import type { AniListMediaFormat } from "@/anilist/schemas/media.schema";
import type { ProviderTargetSummary } from "@/rpc/types";

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

export type MediaModalTargetSummary = ProviderTargetSummary;

type MediaModalStateBase = {
	anilistId: AniListId;
	initialView?: MediaModalView;
	openSource: MediaModalOpenSource;
	metadataHint?: MediaModalMetadataHint | null;
};

export type SonarrMediaModalState = MediaModalStateBase & {
	provider: "sonarr";
};

export type RadarrMediaModalState = MediaModalStateBase & {
	provider: "radarr";
};

export type MediaModalState =
	| SonarrMediaModalState
	| RadarrMediaModalState
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
