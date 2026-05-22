/** Dumb media modal header with AniList and provider identity cards. */
// src/features/media-modal/chrome/modal-header.tsx

import { Settings, X } from "lucide-react";
import type { MouseEventHandler } from "react";
import type { AniListId } from "@/anilist";
import { buildAniListAnimeUrl } from "@/anilist/anilist-links";
import type { Provider } from "@/providers";
import {
	formatProviderExternalId,
	getProviderLabel,
} from "@/providers/provider-labels";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import Button from "@/shared/ui/primitives/button";
import { cn } from "@/shared/utils/cn";
import { formatToken } from "../helpers";
import type { AniListHeaderData, MediaModalTargetSummary } from "../types";
import {
	MappingCard,
	MappingOpenLink,
	MappingPoster,
} from "./header-mapping-card";

export type ModalHeaderProps = {
	provider: Provider;
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
	anilistHeaderData: AniListHeaderData;
	anilistId: AniListId;
	effectiveMapping: MediaModalTargetSummary | null;
	workspaceClassName?: string | undefined;
	onClose: MouseEventHandler<HTMLButtonElement>;
	onOpenSettings?: (() => void) | undefined;
};

const CHROME_BUTTON_CLASS =
	"!h-9 !w-9 !rounded-none !p-0 text-text-secondary hover:text-text-primary";

function toTitleCase(value: string): string {
	return value
		.replaceAll("_", " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatProviderType(typeLabel: string | undefined): string | null {
	if (!typeLabel) {
		return null;
	}

	const normalized = typeLabel.trim().toLowerCase();
	if (
		normalized === "anime" ||
		normalized === "standard" ||
		normalized === "daily"
	) {
		return "TV";
	}

	return toTitleCase(typeLabel);
}

function joinMetaLine(parts: Array<string | null | undefined>): string | null {
	const values: string[] = [];

	for (const part of parts) {
		if (part) {
			values.push(part);
		}
	}

	return values.length > 0 ? values.join(" - ") : null;
}

function MappingBridge(): React.JSX.Element {
	return (
		<div className="flex w-full flex-col items-center justify-center self-center md:max-w-34 md:self-stretch">
			<p className="hidden whitespace-nowrap text-[10px] leading-none font-semibold uppercase tracking-[0.18em] text-text-secondary md:block">
				MAPS TO
			</p>
			<div className="flex w-full items-center md:mt-1.5">
				<div className="h-px flex-1 bg-text-primary/70" />
				<div className="h-2 w-2 shrink-0 rotate-45 border-t border-r border-text-primary/70 md:h-2.5 md:w-2.5" />
			</div>
		</div>
	);
}

function SourceCard(props: {
	anilistHeaderData: AniListHeaderData;
	anilistId: AniListId;
}): React.JSX.Element {
	const {
		anilistHeaderData: { title, coverImage, format, year },
		anilistId,
	} = props;

	const anilistMetaLine = joinMetaLine([
		format ? formatToken(format) : null,
		year ? String(year) : null,
	]);
	const anilistLink = buildAniListAnimeUrl(anilistId);

	return (
		<MappingCard>
			<div className="pointer-events-none absolute -top-5 bottom-8 -left-4 right-14 -z-10 rounded-full bg-bg-primary/24 blur-2xl" />

			<div className="relative min-w-0 text-left">
				<MappingOpenLink
					href={anilistLink}
					ariaLabel="Open in AniList"
					side="left"
				>
					ANILIST
				</MappingOpenLink>

				<div className="mt-2 flex items-start gap-2 md:mt-3 md:gap-3">
					<MappingPoster src={coverImage} />

					<div className="min-w-0 flex-1 pt-0 md:pt-1">
						<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)] md:text-lg">
							{title}
						</h2>

						{anilistMetaLine ? (
							<p className="mt-1 truncate text-[10px] text-text-secondary md:mt-2 md:text-xs">
								{anilistMetaLine}
							</p>
						) : null}

						<p className="mt-0.5 truncate text-[10px] text-text-secondary md:mt-1 md:text-xs">
							{`AniList #${anilistId}`}
						</p>
					</div>
				</div>
			</div>
		</MappingCard>
	);
}

type ProviderCardProps = {
	provider: Provider;
	baseUrl: string;
	effectiveMapping: MediaModalTargetSummary | null;
};

function ProviderCard(props: ProviderCardProps): React.JSX.Element {
	const { provider, baseUrl, effectiveMapping } = props;

	const providerLabel = getProviderLabel(provider);
	const providerName = providerLabel.toUpperCase();

	const providerMetaLine = effectiveMapping
		? joinMetaLine([
				formatProviderType(effectiveMapping.typeLabel),
				effectiveMapping.year ? String(effectiveMapping.year) : null,
			])
		: null;

	const providerIdLine = effectiveMapping
		? formatProviderExternalId(
				effectiveMapping.provider,
				effectiveMapping.providerId,
			)
		: null;

	const providerLink = effectiveMapping
		? buildProviderOpenUrl({
				provider,
				baseUrl,
				isInLibrary: effectiveMapping.isInLibrary,
				...(effectiveMapping.providerRouteSlug
					? { providerRouteSlug: effectiveMapping.providerRouteSlug }
					: {}),
				searchTerm: effectiveMapping.title,
			})
		: null;

	const title = effectiveMapping ? effectiveMapping.title : "No match selected";
	const description = effectiveMapping
		? null
		: `Search below to choose the ${providerLabel} target.`;
	const posterUrl = effectiveMapping?.posterUrl ?? null;

	return (
		<MappingCard>
			<div className="pointer-events-none absolute -top-5 bottom-8 left-14 -right-4 -z-10 rounded-full bg-bg-primary/24 blur-2xl" />

			<div className="relative min-w-0">
				{providerLink ? (
					<MappingOpenLink
						href={providerLink}
						ariaLabel={`Open in ${providerLabel}`}
						side="right"
					>
						{providerName}
					</MappingOpenLink>
				) : (
					<p className="text-right text-[9px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary md:text-[11px]">
						{providerName}
					</p>
				)}

				<div className="mt-2 flex flex-row-reverse items-start gap-2 text-right md:mt-3 md:gap-3">
					<MappingPoster src={posterUrl} />

					<div className="min-w-0 flex-1 pt-0 md:pt-1">
						<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)] md:text-lg">
							{title}
						</h2>

						{providerMetaLine ? (
							<p className="mt-1 truncate text-[10px] text-text-secondary md:mt-2 md:text-xs">
								{providerMetaLine}
							</p>
						) : null}

						{providerIdLine ? (
							<p className="mt-0.5 truncate text-[10px] text-text-secondary md:mt-1 md:text-xs">
								{providerIdLine}
							</p>
						) : null}

						{description ? (
							<p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-text-secondary md:mt-1 md:text-xs md:leading-5">
								{description}
							</p>
						) : null}
					</div>
				</div>
			</div>
		</MappingCard>
	);
}

export function ModalHeader(props: ModalHeaderProps): React.JSX.Element {
	const {
		provider,
		baseUrl,
		contentContainer,
		anilistHeaderData,
		anilistId,
		effectiveMapping,
		workspaceClassName,
		onClose,
		onOpenSettings,
	} = props;
	const { bannerImage } = anilistHeaderData;

	return (
		<header className="relative shrink-0 overflow-hidden bg-bg-tertiary">
			<div
				className="absolute inset-0 bg-bg-tertiary"
				style={{
					backgroundImage: bannerImage ? `url(${bannerImage})` : undefined,
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					backgroundSize: "cover",
				}}
			>
				<div className="absolute inset-0 bg-linear-to-r from-[rgba(11,22,34,0.9)] via-[rgba(11,22,34,0.72)] to-[rgba(11,22,34,0.38)]" />
				<div className="absolute inset-0 bg-linear-to-b from-[rgba(5,12,20,0.08)] via-[rgba(11,22,34,0.28)] to-[rgba(11,22,34,0.72)]" />
				<div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent via-bg-primary/75 to-bg-primary" />
				<div className="absolute inset-0 shadow-[inset_0_0_180px_rgba(11,22,34,0.58)]" />
			</div>

			<div className="relative z-10 flex h-9 items-center justify-end gap-0">
				{onOpenSettings ? (
					<Button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onOpenSettings();
						}}
						variant="ghost"
						size="icon"
						tooltip="Open manual mapping settings in the options page"
						tooltipContainer={contentContainer ?? undefined}
						className={CHROME_BUTTON_CLASS}
						aria-label="Open manual mapping settings"
					>
						<Settings className="h-4 w-4" />
					</Button>
				) : null}

				<Button
					type="button"
					aria-label="Close"
					onClick={onClose}
					variant="ghost"
					size="icon"
					className={CHROME_BUTTON_CLASS}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="relative z-10 px-4 pb-3 pt-3 md:px-8 md:pb-5 md:pt-5">
				<div
					className={cn(
						"grid w-full items-center gap-1 grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] md:items-start md:gap-x-0 md:gap-y-4",
						workspaceClassName,
					)}
				>
					<SourceCard
						anilistHeaderData={anilistHeaderData}
						anilistId={anilistId}
					/>
					<MappingBridge />
					<ProviderCard
						provider={provider}
						baseUrl={baseUrl}
						effectiveMapping={effectiveMapping}
					/>
				</div>
			</div>
		</header>
	);
}
