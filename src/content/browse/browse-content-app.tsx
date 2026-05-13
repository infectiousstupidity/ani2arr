/** Content-owned browse overlay composition for parsed cards and action portals. */
// src/content/browse/browse-content-app.tsx

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import type { AniListId } from "@/anilist";
import { metadataHintFromAniListMetadata } from "@/anilist/metadata-hints";
import type { MediaModalLaunchSnapshot } from "@/features/media-modal/launch-snapshot";
import { useAniListMetadataBatch } from "@/queries";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { useTheme } from "@/shared/hooks/use-theme";
import { useBrowsePortals } from "./use-browse-portals";
import { useAnilistBatchPrefetch } from "./use-anilist-batch-prefetch";
import type { MediaModalOpenState } from "@/features/media-modal";
import type { BrowseAdapter, HostMediaTarget } from "./types";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import { CardOverlay } from "@/features/media-overlay/components/card-overlay";
import { usePublicOptions } from "@/queries/options";
import { useProviderBaseUrl } from "@/queries/provider-base-url";
import type { Provider } from "@/providers";
import { useMappingIdentities } from "@/queries/mapping";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";

export const DEFAULT_CONTAINER_CLASS = "a2a-overlay-container";
export const DEFAULT_PROCESSED_ATTRIBUTE = "data-a2a-processed";

export interface BrowseContentAppProps {
	onOpenMediaModal(input: MediaModalOpenState): void;
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

function getProviderBrowseSettings(
	provider: Provider,
	publicOptions: Awaited<ReturnType<typeof usePublicOptions>>["data"],
) {
	const providerOptions =
		provider === "radarr"
			? publicOptions?.providers.radarr
			: publicOptions?.providers.sonarr;
	const providerUiOptions =
		provider === "radarr"
			? publicOptions?.ui?.browseCards.radarr
			: publicOptions?.ui?.browseCards.sonarr;

	return {
		providerOptions,
		providerUiOptions,
		providerBrowseEnabled: providerUiOptions?.enabled ?? true,
		badgeVisibility: providerUiOptions?.visibility ?? "always",
	};
}

function getLaunchTitle(input: {
	anilistId: AniListId;
	metadata: ReturnType<typeof metadataHintFromAniListMetadata>;
}): string {
	const titles = input.metadata?.titles;
	return (
		titles?.english?.trim() ||
		titles?.romaji?.trim() ||
		titles?.native?.trim() ||
		`AniList #${input.anilistId}`
	);
}

function getMappedIdentityByAniListId(
	identities: readonly EffectiveMappingPresence[],
): Map<AniListId, EffectiveMappingPresence> {
	const identitiesById = new Map<AniListId, EffectiveMappingPresence>();
	for (const identity of identities) {
		if (
			identity.providerMappingState === "mapped" &&
			identity.providerId !== null &&
			!identitiesById.has(identity.anilistId)
		) {
			identitiesById.set(identity.anilistId, identity);
		}
	}

	return identitiesById;
}

function renderBrowseCardPortal(input: {
	container: Element;
	parsed: HostMediaTarget;
	canonicalMetadataById: Map<
		AniListId,
		ReturnType<typeof metadataHintFromAniListMetadata>
	>;
	mappedIdentityByAniListId: Map<AniListId, EffectiveMappingPresence>;
	publicOptions: Awaited<ReturnType<typeof usePublicOptions>>["data"];
	providerBaseUrls: Record<Provider, string>;
	onOpenMediaModal(input: MediaModalOpenState): void;
	adapter: BrowseAdapter;
}) {
	const effectiveMetadata =
		input.canonicalMetadataById.get(input.parsed.anilistId) ?? null;
	const mappedIdentity = input.mappedIdentityByAniListId.get(
		input.parsed.anilistId,
	);
	const provider =
		mappedIdentity?.provider ??
		resolveProviderForAniListFormat(input.parsed.format);
	if (!provider) {
		return null;
	}
	const launchTitle = getLaunchTitle({
		anilistId: input.parsed.anilistId,
		metadata: effectiveMetadata,
	});

	const { providerOptions, providerBrowseEnabled, badgeVisibility } =
		getProviderBrowseSettings(provider, input.publicOptions);
	if (!providerBrowseEnabled) {
		return null;
	}

	return createPortal(
		<CardOverlay
			key={input.parsed.anilistId}
			provider={provider}
			anilistId={input.parsed.anilistId}
			title={launchTitle}
			onOpenModal={(launchSnapshot: MediaModalLaunchSnapshot) => {
				if (provider === "radarr") {
					input.onOpenMediaModal({
						anilistId: input.parsed.anilistId,
						provider: "radarr",
						initialView: "setup",
						openSource: "content",
						launchTitle,
						launchMetadata: effectiveMetadata,
						launchSnapshot:
							launchSnapshot.provider === "radarr" ? launchSnapshot : null,
					});
					return;
				}

				input.onOpenMediaModal({
					anilistId: input.parsed.anilistId,
					provider: "sonarr",
					initialView: "setup",
					openSource: "content",
					launchTitle,
					launchMetadata: effectiveMetadata,
					launchSnapshot:
							launchSnapshot.provider === "sonarr" ? launchSnapshot : null,
				});
			}}
			onOpenMapping={(launchSnapshot: MediaModalLaunchSnapshot) => {
				if (provider === "radarr") {
					input.onOpenMediaModal({
						anilistId: input.parsed.anilistId,
						provider: "radarr",
						initialView: "mapping",
						openSource: "content",
						launchTitle,
						launchMetadata: effectiveMetadata,
						launchSnapshot:
							launchSnapshot.provider === "radarr" ? launchSnapshot : null,
					});
					return;
				}

				input.onOpenMediaModal({
					anilistId: input.parsed.anilistId,
					provider: "sonarr",
					initialView: "mapping",
					openSource: "content",
					launchTitle,
					launchMetadata: effectiveMetadata,
					launchSnapshot:
							launchSnapshot.provider === "sonarr" ? launchSnapshot : null,
				});
			}}
			isConfigured={Boolean(providerOptions?.isConfigured)}
			defaultForm={providerOptions?.defaults ?? null}
			mappedIdentity={mappedIdentity ?? null}
			metadata={effectiveMetadata}
			providerUrl={input.providerBaseUrls[provider] || null}
			observeTarget={input.container}
			badgeVisibility={badgeVisibility}
			anchorCorner={input.adapter.anchorCorner ?? "bottom-left"}
			stackDirection={input.adapter.stackDirection ?? "up"}
			anchorOffsetX={input.adapter.anchorOffsetX ?? -8}
		/>,
		input.container,
	);
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
		const sonarrBaseUrl = useProviderBaseUrl("sonarr", {
			enabled: publicOptions?.providers.sonarr.isConfigured === true,
		});
		const radarrBaseUrl = useProviderBaseUrl("radarr", {
			enabled: publicOptions?.providers.radarr.isConfigured === true,
		});

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
		const mappedIdentityByAniListId = getMappedIdentityByAniListId(
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
						mappedIdentityByAniListId,
						publicOptions,
						providerBaseUrls: {
							sonarr: sonarrBaseUrl.data ?? "",
							radarr: radarrBaseUrl.data ?? "",
						},
						onOpenMediaModal,
						adapter,
					});
				})}
			</div>
		);
	};

	return BrowseContentApp;
};
