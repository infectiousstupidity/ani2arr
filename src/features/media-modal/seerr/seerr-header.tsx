/** Seerr modal header showing AniList source, Seerr target, and connector. */
// src/features/media-modal/seerr/seerr-header.tsx

import { X } from "lucide-react";
import { buildAniListAnimeUrl } from "@/anilist/title";
import type { SourceIdentity } from "@/mapping/source-identity";
import { buildMyAnimeListAnimeUrl } from "@/myanimelist/url";
import type { SeerrMediaDetails } from "@/providers/seerr/types";
import type { SeerrRequestTarget } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import {
	MappingOpenLink,
	MappingPoster,
} from "../chrome/header-mapping-card";
import {
	MappingConnector,
	type MappingConnectorState,
} from "../chrome/mapping-connector";
import { formatToken } from "../helpers";
import type { AniListHeaderData } from "../types";
import { getTmdbPosterUrl } from "./seerr-selection";
import {
	CHROME_BUTTON_CLASS,
	HEADER_CARD_CLASS,
} from "./seerr-modal.constants";

type SeerrTargetIdLink = {
	label: string;
	href: string;
	ariaLabel: string;
};

function joinMetaLine(parts: Array<string | null | undefined>): string | null {
	const values: string[] = [];
	for (const part of parts) {
		if (part) {
			values.push(part);
		}
	}

	return values.length > 0 ? values.join(" • ") : null;
}

function getTargetMetaLine(target: SeerrRequestTarget | null): string {
	if (!target) return "Change target to choose where Seerr will request.";
	return `${target.mediaType === "movie" ? "Movie" : "TV"} / Seerr`;
}

function buildTmdbUrl(target: SeerrRequestTarget): string {
	const path = target.mediaType === "movie" ? "movie" : "tv";
	return `https://www.themoviedb.org/${path}/${target.tmdbId}`;
}

function getTargetIdLinks(
	target: SeerrRequestTarget | null,
): SeerrTargetIdLink[] {
	if (!target) return [];

	const links: SeerrTargetIdLink[] = [
		{
			label: `TMDB ID: ${target.tmdbId}`,
			href: buildTmdbUrl(target),
			ariaLabel: "Open in TMDB",
		},
	];
	if (target.mediaType === "tv" && target.tvdbId !== undefined) {
		links.push({
			label: `TVDB ID: ${target.tvdbId}`,
			href: `https://thetvdb.com/dereferrer/series/${target.tvdbId}`,
			ariaLabel: "Open in TVDB",
		});
	}

	return links;
}

export function SeerrHeader(props: {
	source: SourceIdentity;
	data: AniListHeaderData;
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	targetTitle: string;
	isLoadingTarget: boolean;
	connectorState: MappingConnectorState;
	onClose: () => void;
	contentContainer: HTMLDivElement | null;
}): React.JSX.Element {
	const {
		source,
		data,
		target,
		details,
		targetTitle,
		isLoadingTarget,
		connectorState,
		onClose,
		contentContainer,
	} = props;
	const sourceUrl =
		source.source === "anilist"
			? buildAniListAnimeUrl(source.id)
			: buildMyAnimeListAnimeUrl(source.id);
	const sourceLabel = source.source === "anilist" ? "AniList" : "MAL";
	const anilistMetaLine = joinMetaLine([
		data.format ? formatToken(data.format) : null,
		data.year ? String(data.year) : null,
	]);
	const targetMetaLine = getTargetMetaLine(target);
	const targetIdLinks = getTargetIdLinks(target);
	const targetPosterUrl = getTmdbPosterUrl(details?.posterPath);

	return (
		<header className="relative shrink-0 overflow-hidden bg-bg-tertiary">
			<div
				className="absolute inset-0 bg-bg-tertiary"
				style={{
					backgroundImage: data.bannerImage ? `url(${data.bannerImage})` : undefined,
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					backgroundSize: "cover",
				}}
			>
				<div className="absolute inset-0 bg-linear-to-r from-bg-primary/95 via-bg-primary/75 to-bg-primary/40" />
				<div className="absolute inset-0 bg-linear-to-b from-bg-primary/10 via-bg-primary/30 to-bg-primary/80" />
				<div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent via-bg-primary/75 to-bg-primary" />
				<div className="absolute inset-0 shadow-[inset_0_0_180px_var(--bg-primary)]" />
			</div>

			<div className="relative z-10 flex h-9 items-center justify-end gap-0">
				<Button
					type="button"
					aria-label="Close"
					onClick={onClose}
					variant="ghost"
					size="icon"
					tooltip="Close modal"
					tooltipContainer={contentContainer ?? undefined}
					className={CHROME_BUTTON_CLASS}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="relative z-10 px-4 pb-3 pt-3 md:px-8 md:pb-5 md:pt-5">
				<div className="grid w-full grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_10%_minmax(0,1fr)] sm:gap-3">
					<div className="a2a-modal-header-item min-w-0">
						<div className={HEADER_CARD_CLASS}>
							<MappingPoster src={data.coverImage} side="left" />

							<div className="relative flex min-w-0 flex-1 flex-col p-3 text-left md:p-4">
								<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary md:text-lg">
									{data.title}
								</h2>

								<div className="mt-auto min-w-0 pt-2 md:pt-3">
									{anilistMetaLine ? (
										<p className="truncate text-[10px] text-text-secondary md:text-xs">
											{anilistMetaLine}
										</p>
									) : null}

									<div className="mt-0.5 flex min-w-0">
										<MappingOpenLink
											href={sourceUrl}
											ariaLabel={`Open in ${sourceLabel}`}
											side="left"
										>
											{`${sourceLabel} ID: ${source.id}`}
										</MappingOpenLink>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="a2a-modal-header-item a2a-delay-50 min-w-0">
						<MappingConnector state={connectorState} />
					</div>

					<div className="a2a-modal-header-item a2a-delay-100 min-w-0">
						<div className={HEADER_CARD_CLASS}>
							<div className="relative flex min-w-0 flex-1">
								<div className="relative min-w-0 flex-1 overflow-hidden">
									<div className="a2a-fade-blur-in absolute inset-0 flex min-w-0 flex-col items-end p-3 text-right md:p-4">
										<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary md:text-lg">
											{isLoadingTarget ? "Loading Seerr target..." : targetTitle}
										</h2>

										<div className="mt-auto min-w-0 pt-2 md:pt-3">
											<p className="truncate text-[10px] text-text-secondary md:text-xs">
												{targetMetaLine}
											</p>

											{targetIdLinks.length > 0 ? (
												<div className="mt-0.5 flex min-w-0 justify-end">
													<ul className="ml-auto flex w-fit max-w-full flex-wrap justify-end gap-1">
														{targetIdLinks.map((link) => (
															<li key={link.label} className="min-w-0">
																<MappingOpenLink
																	href={link.href}
																	ariaLabel={link.ariaLabel}
																>
																	{link.label}
																</MappingOpenLink>
															</li>
														))}
													</ul>
												</div>
											) : null}
										</div>
									</div>
								</div>

								<MappingPoster src={targetPosterUrl} side="right" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
