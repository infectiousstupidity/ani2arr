/** Content-owned browse overlay portals and media modal composition. */
// src/content/browse/browse-overlays.tsx

import React, { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { metadataHintFromAniListMetadata } from "@/anilist/title";
import { getMappedIdentitiesByAniListId } from "@/content/anilist/target-provider";
import { MediaModal } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappingIdentities } from "@/queries/mapping";
import { useOptionsQuerySync, usePublicOptions } from "@/queries/options";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import type { PublicOptions } from "@/settings/types";
import { useTheme } from "@/shared/hooks/use-theme";
import { BrowseCardOverlay } from "./browse-card-overlay";
import { useBrowseCardTargets } from "./use-browse-card-targets";
import type { BrowseAdapter } from "./types";

export interface BrowseOverlaysProps {
	adapter: BrowseAdapter;
	portalContainer: HTMLElement;
}

function getBrowseFlags(publicOptions: PublicOptions | undefined): {
	overlaysEnabled: boolean;
} {
	const sonarrBrowseEnabled =
		publicOptions?.ui?.browseCards.sonarr.enabled ?? true;
	const radarrBrowseEnabled =
		publicOptions?.ui?.browseCards.radarr.enabled ?? true;
	const seerrBrowseEnabled =
		publicOptions?.ui?.browseCards.seerr.enabled ?? true;

	return {
		overlaysEnabled: sonarrBrowseEnabled || radarrBrowseEnabled || seerrBrowseEnabled,
	};
}

export function BrowseOverlays({
	adapter,
	portalContainer,
}: BrowseOverlaysProps): React.ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const mediaModal = useMediaModalState();
	useTheme(hostRef);
	useOptionsQuerySync();
	useA2aBroadcasts();

	const { data: publicOptions } = usePublicOptions();
	const browseFlags = getBrowseFlags(publicOptions);
	const targetOptions = useMemo(
		() => ({
			adapter,
			enabled: browseFlags.overlaysEnabled,
		}),
		[adapter, browseFlags.overlaysEnabled],
	);
	const targets = useBrowseCardTargets(targetOptions);
	const targetIds = useMemo(
		() =>
			targets.flatMap((target) =>
				target.parsed.anilistId === undefined ? [] : [target.parsed.anilistId],
			),
		[targets],
	);
	const targetIdsMissingFormat = useMemo(
		() =>
			targets
				.filter((target) => target.parsed.format === null)
				.flatMap((target) =>
					target.parsed.anilistId === undefined ? [] : [target.parsed.anilistId],
				),
		[targets],
	);
	const metadataBatch = useAniListMetadataBatch(targetIdsMissingFormat, {
		enabled: browseFlags.overlaysEnabled && targetIdsMissingFormat.length > 0,
	});
	const mappingIdentities = useMappingIdentities(targetIds, {
		enabled: browseFlags.overlaysEnabled,
	});
	const mappedIdentitiesById = useMemo(
		() => getMappedIdentitiesByAniListId(mappingIdentities.data ?? []),
		[mappingIdentities.data],
	);
	const metadataById = useMemo(
		() =>
			new Map(
				(metadataBatch.data?.metadata ?? []).map((metadata) => [
					metadata.id,
					metadataHintFromAniListMetadata(metadata),
				]),
			),
		[metadataBatch.data],
	);

	return (
		<>
			<div ref={hostRef} />
			{targets.map(target =>
				createPortal(
					<BrowseCardOverlay
						parsed={target.parsed}
						adapter={adapter}
						publicOptions={publicOptions}
						mappedIdentities={
							target.parsed.anilistId === undefined
								? []
								: (mappedIdentitiesById.get(target.parsed.anilistId) ?? [])
						}

						metadata={
							target.parsed.anilistId === undefined
								? null
								: (metadataById.get(target.parsed.anilistId) ?? null)
						}
						onOpenMediaModal={mediaModal.open}
						tooltipContainer={null}
					/>,
					target.container,
					target.key,
				),
			)}
			{mediaModal.state ? (
				<MediaModal
					key={`modal-${mediaModal.state.anilistId ?? "unknown"}`}
					state={mediaModal.state}
					onClose={mediaModal.close}
					container={portalContainer}
				/>
			) : null}
		</>
	);
}
