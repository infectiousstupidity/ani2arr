/** Content-owned browse overlay composition for parsed cards and action portals. */
// src/content/browse/browse-content-app.tsx

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import type { AniListId } from "@/anilist/anilist-id";
import { metadataHintFromAniListMetadata } from "@/anilist/metadata-hints";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { useTheme } from "@/shared/hooks/use-theme";
import { useBrowsePortals } from "./use-browse-portals";
import { useAnilistBatchPrefetch } from "./use-anilist-batch-prefetch";
import type {
	MediaModalMetadataHint,
	MediaModalOpenState,
} from "@/features/media-modal";
import type { BrowseAdapter, HostMediaTarget } from "./types";
import { RadarrCardOverlay } from "@/features/media-overlay/radarr-card-overlay";
import { SonarrCardOverlay } from "@/features/media-overlay/sonarr-card-overlay";
import { usePublicOptions } from "@/queries/options";
import type { Provider } from "@/providers/types";
import { useMappingIdentities } from "@/queries/mapping";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import {
	getMappedIdentitiesByAniListId,
	resolveAniListTargetProvider,
} from "@/content/anilist/target-provider";

export const DEFAULT_CONTAINER_CLASS = "a2a-overlay-container";
export const DEFAULT_PROCESSED_ATTRIBUTE = "data-a2a-processed";

export interface BrowseContentAppProps {
	onOpenMediaModal(input: MediaModalOpenState): void;
}

interface BrowseOverlayCommonProps {
	anilistId: AniListId;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	metadata: ReturnType<typeof metadataHintFromAniListMetadata>;
	observeTarget: Element;
	anchorCorner: "bottom-left" | "top-left";
	stackDirection: "up" | "down";
	anchorOffsetX: number;
}

function createDefaultContainer(
	host: HTMLElement,
	containerClassName: string,
): HTMLElement {
	const existing = host.querySelector<HTMLElement>(`.${containerClassName}`);
	if (existing) return existing;
	const el = host.ownerDocument.createElement("div");
	el.className = containerClassName;
	host.append(el);
	return el;
}

function getDisplayTitle(input: {
	metadata: ReturnType<typeof metadataHintFromAniListMetadata>;
	parsedTitle: string;
}): string {
	const titles = input.metadata?.titles;
	return (
		titles?.english?.trim() ||
		titles?.romaji?.trim() ||
		titles?.native?.trim() ||
		input.parsedTitle
	);
}

function getModalMetadataHint(input: {
	title: string;
	format: HostMediaTarget["format"];
	metadata: ReturnType<typeof metadataHintFromAniListMetadata>;
}): MediaModalMetadataHint {
	return {
		title: input.title,
		format: input.metadata?.format ?? input.format,
		coverImage: input.metadata?.coverImage ?? null,
	};
}

function renderSonarrOverlayPortal(input: {
	container: Element;
	publicOptions: Awaited<ReturnType<typeof usePublicOptions>>["data"];
	commonProps: BrowseOverlayCommonProps;
}) {
	const browseOptions = input.publicOptions?.ui?.browseCards.sonarr;
	if ((browseOptions?.enabled ?? true) === false) return null;

	return createPortal(
		<SonarrCardOverlay
			key={input.commonProps.anilistId}
			{...input.commonProps}
			isConfigured={input.publicOptions?.providers.sonarr.isConfigured === true}
			defaultForm={input.publicOptions?.providers.sonarr.defaults ?? null}
			badgeVisibility={browseOptions?.visibility ?? "always"}
		/>,
		input.container,
	);
}

function renderRadarrOverlayPortal(input: {
	container: Element;
	publicOptions: Awaited<ReturnType<typeof usePublicOptions>>["data"];
	commonProps: BrowseOverlayCommonProps;
}) {
	const browseOptions = input.publicOptions?.ui?.browseCards.radarr;
	if ((browseOptions?.enabled ?? true) === false) return null;

	return createPortal(
		<RadarrCardOverlay
			key={input.commonProps.anilistId}
			{...input.commonProps}
			isConfigured={input.publicOptions?.providers.radarr.isConfigured === true}
			defaultForm={input.publicOptions?.providers.radarr.defaults ?? null}
			badgeVisibility={browseOptions?.visibility ?? "always"}
		/>,
		input.container,
	);
}

function renderProviderOverlayPortal(input: {
	provider: Provider;
	container: Element;
	publicOptions: Awaited<ReturnType<typeof usePublicOptions>>["data"];
	commonProps: BrowseOverlayCommonProps;
}) {
	if (input.provider === "sonarr") {
		return renderSonarrOverlayPortal(input);
	}

	return renderRadarrOverlayPortal(input);
}

function renderBrowseCardPortal(input: {
	container: Element;
	parsed: HostMediaTarget;
	canonicalMetadataById: Map<
		AniListId,
		ReturnType<typeof metadataHintFromAniListMetadata>
	>;
	mappedIdentitiesByAniListId: Map<AniListId, EffectiveMappingPresence[]>;
	publicOptions: Awaited<ReturnType<typeof usePublicOptions>>["data"];
	onOpenMediaModal(input: MediaModalOpenState): void;
	adapter: BrowseAdapter;
}) {
	const effectiveMetadata =
		input.canonicalMetadataById.get(input.parsed.anilistId) ?? null;
	const provider = resolveAniListTargetProvider({
		anilistId: input.parsed.anilistId,
		format: input.parsed.format,
		mappedIdentities:
			input.mappedIdentitiesByAniListId.get(input.parsed.anilistId) ?? [],
	});
	if (!provider) {
		return null;
	}

	const displayTitle = getDisplayTitle({
		metadata: effectiveMetadata,
		parsedTitle: input.parsed.title,
	});
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		format: input.parsed.format,
		metadata: effectiveMetadata,
	});

	const openSetup = () => {
		input.onOpenMediaModal({
			anilistId: input.parsed.anilistId,
			provider,
			initialView: "setup",
			openSource: "content",
			metadataHint,
		});
	};
	const openMapping = () => {
		input.onOpenMediaModal({
			anilistId: input.parsed.anilistId,
			provider,
			initialView: "mapping",
			openSource: "content",
			metadataHint,
		});
	};
	const commonProps = {
		anilistId: input.parsed.anilistId,
		title: displayTitle,
		onOpenSetup: openSetup,
		onOpenMapping: openMapping,
		metadata: effectiveMetadata,
		observeTarget: input.container,
		anchorCorner: input.adapter.anchorCorner ?? "bottom-left",
		stackDirection: input.adapter.stackDirection ?? "up",
		anchorOffsetX: input.adapter.anchorOffsetX ?? -8,
	};

	return renderProviderOverlayPortal({
		provider,
		container: input.container,
		publicOptions: input.publicOptions,
		commonProps,
	});
}

export const createBrowseContentApp = (
	adapter: BrowseAdapter,
): React.FC<BrowseContentAppProps> => {
	const {
		cardSelector,
		containerClassName = DEFAULT_CONTAINER_CLASS,
		processedAttribute = DEFAULT_PROCESSED_ATTRIBUTE,
		mutationObserverInit = {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["href"],
		},
		parseCard,
	} = adapter;

	const ensureContainerImpl =
		adapter.ensureContainer ??
		((mountTarget: HTMLElement) => createDefaultContainer(mountTarget, containerClassName));

	const getContainerForCardImpl =
		adapter.getContainerForCard ??
		((card: Element) =>
			card.querySelector<HTMLElement>(`.${containerClassName}`));

	const markProcessedImpl =
		adapter.markProcessed ??
		((mountTarget: HTMLElement, parsed: HostMediaTarget) => {
			mountTarget.setAttribute(processedAttribute, String(parsed.anilistId));
		});

	const clearProcessedImpl =
		adapter.clearProcessed ??
		((mountTarget: HTMLElement) => {
			mountTarget.removeAttribute(processedAttribute);
		});

	const getObserverRoot =
		adapter.getObserverRoot ??
		(() => document.body ?? document.documentElement);
	const getScanRoot =
		adapter.getScanRoot ??
		(() =>
			document.querySelector<HTMLElement>(".page-content") ??
			document.body ??
			null);
	const getResizeTargets =
		adapter.resizeObserverTargets ??
		(() => (document.body ? [document.body] : []));
	const containerSelector = `.${containerClassName}`;

	const BrowseContentApp: React.FC<BrowseContentAppProps> = ({
		onOpenMediaModal,
	}) => {
		const hostRef = useRef<HTMLDivElement>(null);
		useTheme(hostRef);
		useA2aBroadcasts();

		const { data: publicOptions } = usePublicOptions();
		const sonarrBrowseEnabled =
			publicOptions?.ui?.browseCards.sonarr.enabled ?? true;
		const radarrBrowseEnabled =
			publicOptions?.ui?.browseCards.radarr.enabled ?? true;
		const overlaysEnabled = sonarrBrowseEnabled || radarrBrowseEnabled;
		const metadataEnabled = Boolean(
			(sonarrBrowseEnabled && publicOptions?.providers.sonarr.isConfigured) ||
			(radarrBrowseEnabled && publicOptions?.providers.radarr.isConfigured),
		);

		const { cardPortals } = useBrowsePortals({
			cardSelector,
			containerSelector,
			parseCard,
			ensureContainer: ensureContainerImpl,
			getContainerForCard: getContainerForCardImpl,
			markProcessed: markProcessedImpl,
			clearProcessed: clearProcessedImpl,
			getObserverRoot,
			getScanRoot,
			getResizeTargets,
			mutationObserverInit,
			onCardInvalid: adapter.onCardInvalid,
			enabled: overlaysEnabled,
		});
		const metadataIds = [
			...new Set(
				Array.from(cardPortals.values(), (parsed) => parsed.anilistId),
			),
		];
		const mappingIdentities = useMappingIdentities(metadataIds, {
			enabled: overlaysEnabled,
		});
		const mappedIdentitiesByAniListId = getMappedIdentitiesByAniListId(
			mappingIdentities.data ?? [],
		);
		const metadataBatch = useAniListMetadataBatch(metadataIds, {
			enabled: metadataEnabled,
		});
		const canonicalMetadataById = new Map(
			(metadataBatch.data?.metadata ?? []).map((entry) => [
				entry.id,
				metadataHintFromAniListMetadata(entry),
			]),
		);

		useAnilistBatchPrefetch({ cardPortals, enabled: metadataEnabled });

		if (!overlaysEnabled) {
			return <div ref={hostRef} />;
		}

		return (
			<div ref={hostRef}>
				{[...cardPortals.entries()].map(([container, parsed]) => {
					return renderBrowseCardPortal({
						container,
						parsed,
						canonicalMetadataById,
						mappedIdentitiesByAniListId,
						publicOptions,
						onOpenMediaModal,
						adapter,
					});
				})}
			</div>
		);
	};

	return BrowseContentApp;
};
