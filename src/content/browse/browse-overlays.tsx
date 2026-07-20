/** Content-owned browse overlay portals and media modal composition. */
// src/content/browse/browse-overlays.tsx

import React, { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { metadataHintFromAniListMetadata } from "@/anilist/title";
import { getMappedIdentitiesByAniListId } from "@/content/anilist/target-provider";
import { MediaModal } from "@/features/media-modal";
import { useMediaModalState } from "@/features/media-modal/hooks/use-media-modal-state";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { useMappingIdentities, useSourceAniListIdMap } from "@/queries/mapping";
import { usePublicOptions } from "@/queries/options";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { useTheme } from "@/shared/hooks/use-theme";
import { BrowseCardOverlay } from "./browse-card-overlay";
import { useBrowseCardTargets } from "./use-browse-card-targets";
import type { BrowseAdapter } from "./types";

export interface BrowseOverlaysProps {
	adapter: BrowseAdapter;
	portalContainer: HTMLElement;
}

export function BrowseOverlays({
	adapter,
	portalContainer,
}: BrowseOverlaysProps): React.ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const mediaModal = useMediaModalState();
	useTheme(hostRef);
	useA2aBroadcasts();

	const { data: publicOptions } = usePublicOptions();
	const overlaysEnabled =
		(publicOptions?.ui.browseCards.sonarr.enabled ?? true) ||
		(publicOptions?.ui.browseCards.radarr.enabled ?? true) ||
		(publicOptions?.ui.browseCards.seerr.enabled ?? true);
	const targets = useBrowseCardTargets(adapter, overlaysEnabled);
	const sourcesMissingAniListIds = useMemo(
		() =>
			targets.flatMap((target) =>
				target.parsed.anilistId === undefined ? [target.parsed.source] : [],
			),
		[targets],
	);
	const sourceAniListIds = useSourceAniListIdMap(sourcesMissingAniListIds, {
		enabled: overlaysEnabled && sourcesMissingAniListIds.length > 0,
	});
	const resolvedTargets = useMemo(
		() =>
			targets.map((target) => {
				if (target.parsed.anilistId !== undefined) return target;

				const anilistId =
					sourceAniListIds.data?.[sourceIdentityKey(target.parsed.source)];
				return anilistId === undefined || anilistId === null
					? target
					: {
							...target,
							parsed: {
								...target.parsed,
								anilistId,
							},
						};
			}),
		[targets, sourceAniListIds.data],
	);
	const targetIds = useMemo(
		() =>
			resolvedTargets.flatMap((target) =>
				target.parsed.anilistId === undefined ? [] : [target.parsed.anilistId],
			),
		[resolvedTargets],
	);
	const targetIdsMissingFormat = useMemo(
		() =>
			resolvedTargets
				.filter((target) => target.parsed.format === null)
				.flatMap((target) =>
					target.parsed.anilistId === undefined ? [] : [target.parsed.anilistId],
				),
		[resolvedTargets],
	);
	const metadataBatch = useAniListMetadataBatch(targetIdsMissingFormat, {
		enabled: overlaysEnabled && targetIdsMissingFormat.length > 0,
	});
	const mappingIdentities = useMappingIdentities(targetIds, {
		enabled: overlaysEnabled,
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
			{resolvedTargets.map(target =>
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
