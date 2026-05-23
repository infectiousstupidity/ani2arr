/** Dumb media modal header with AniList and provider identity cards. */
// src/features/media-modal/chrome/modal-header.tsx

import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
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
	MappingOpenLink,
	MappingPoster,
} from "./header-mapping-card";
import {
	MappingConnector,
	type MappingConnectorState,
} from "./mapping-connector";

export type ModalHeaderProps = {
	provider: Provider;
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
	anilistHeaderData: AniListHeaderData;
	anilistId: AniListId;
	isMappingView: boolean;
	currentTarget: MediaModalTargetSummary | null;
	previewTarget: MediaModalTargetSummary | null;
	workspaceClassName?: string | undefined;
	onClose: MouseEventHandler<HTMLButtonElement>;
	onOpenSettings?: (() => void) | undefined;
};

const CHROME_BUTTON_CLASS =
	"!h-9 !w-9 !rounded-none !p-0 text-text-secondary hover:text-text-primary";
const HEADER_CARD_CLASS =
	"relative flex h-full min-w-0 rounded-lg border border-border-primary/60 bg-bg-secondary/10 p-2 backdrop-blur-[4px] transition-[opacity,filter,box-shadow]";

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
		<div className={HEADER_CARD_CLASS}>
			<div className="relative flex min-w-0 flex-1 flex-col text-left">
				<MappingOpenLink
					href={anilistLink}
					ariaLabel="Open in AniList"
					side="left"
				>
					ANILIST
				</MappingOpenLink>

				<div className="mt-2 flex min-w-0 flex-1 items-start gap-2 md:mt-3 md:gap-3">
					<MappingPoster src={coverImage} />

					<div className="min-w-0 flex-1 pt-0 md:pt-1">
						<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary md:text-lg">
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
		</div>
	);
}

type ProviderCardProps = {
	provider: Provider;
	baseUrl: string;
	target: MediaModalTargetSummary | null;
	isDimmed: boolean;
	isHighlighted: boolean;
};

function ProviderCard(props: ProviderCardProps): React.JSX.Element {
	const { provider, baseUrl, target, isDimmed, isHighlighted } = props;

	const providerLabel = getProviderLabel(provider);
	const providerName = providerLabel.toUpperCase();

	const providerMetaLine = target
		? joinMetaLine([
				formatProviderType(target.typeLabel),
				target.year ? String(target.year) : null,
			])
		: null;

	const providerIdLine = target
		? formatProviderExternalId(
				target.provider,
				target.providerId,
			)
		: null;

	const providerLink = target
		? buildProviderOpenUrl({
				provider,
				baseUrl,
				isInLibrary: target.isInLibrary,
				...(target.providerRouteSlug
					? { providerRouteSlug: target.providerRouteSlug }
					: {}),
				searchTerm: target.title,
			})
		: null;

	const title = target ? target.title : "No match selected";
	const description = target
		? null
		: `Search below to choose the ${providerLabel} target.`;
	const posterUrl = target?.posterUrl ?? null;
	const targetKey = target ? `${target.provider}:${target.providerId}` : "none";

	return (
		<div
			className={cn(
				HEADER_CARD_CLASS,
				isHighlighted
					? "ring-1 ring-accent-primary shadow-[0_0_10px_var(--accent-primary)]"
					: null,
			)}
		>
			<LazyMotion features={domAnimation}>
				<AnimatePresence mode="wait" initial={false}>
					<m.div
						key={targetKey}
						initial={{ opacity: 0, scale: 0.96 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.96 }}
						transition={{ duration: 0.16 }}
						className="relative flex min-w-0 flex-1"
					>
						<div
							className={cn(
								"relative flex min-w-0 flex-1 flex-col transition-[opacity,filter]",
								isDimmed ? "opacity-50 grayscale" : null,
							)}
						>
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

							<div className="mt-2 flex min-w-0 flex-1 flex-row-reverse items-start gap-2 text-right md:mt-3 md:gap-3">
								<MappingPoster src={posterUrl} />

								<div className="min-w-0 flex-1 pt-0 md:pt-1">
									<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary md:text-lg">
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
					</m.div>
				</AnimatePresence>
			</LazyMotion>
		</div>
	);
}

export function ModalHeader(props: ModalHeaderProps): React.JSX.Element {
	const {
		provider,
		baseUrl,
		contentContainer,
		anilistHeaderData,
		anilistId,
		isMappingView,
		currentTarget,
		previewTarget,
		workspaceClassName,
		onClose,
		onOpenSettings,
	} = props;
	const { bannerImage } = anilistHeaderData;
	const target = isMappingView && previewTarget ? previewTarget : currentTarget;
	const isCurrentTargetDimmed =
		isMappingView && previewTarget === null && currentTarget !== null;
	const isTargetHighlighted = isMappingView && previewTarget !== null;
	let connectorState: MappingConnectorState = "setup";

	if (isTargetHighlighted) {
		connectorState = "selected";
	} else if (isMappingView) {
		connectorState = "search";
	}

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
				<div className="absolute inset-0 bg-linear-to-r from-bg-primary/95 via-bg-primary/75 to-bg-primary/40" />
				<div className="absolute inset-0 bg-linear-to-b from-bg-primary/10 via-bg-primary/30 to-bg-primary/80" />
				<div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent via-bg-primary/75 to-bg-primary" />
				<div className="absolute inset-0 shadow-[inset_0_0_180px_var(--bg-primary)]" />
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
						"grid w-full grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_10%_minmax(0,1fr)] sm:gap-3",
						workspaceClassName,
					)}
				>
					<SourceCard
						anilistHeaderData={anilistHeaderData}
						anilistId={anilistId}
					/>
					<MappingConnector state={connectorState} />
					<ProviderCard
						provider={provider}
						baseUrl={baseUrl}
						target={target}
						isDimmed={isCurrentTargetDimmed}
						isHighlighted={isTargetHighlighted}
					/>
				</div>
			</div>
		</header>
	);
}
