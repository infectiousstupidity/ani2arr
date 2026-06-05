/** Dumb media modal header with AniList and provider identity cards. */
// src/features/media-modal/chrome/modal-header.tsx

import { ExternalLink, Settings, X } from "lucide-react";
import type { MouseEvent, MouseEventHandler } from "react";
import type { AniListId } from "@/anilist/types";
import { buildAniListAnimeUrl } from "@/anilist/title";
import type { Provider } from "@/providers/types";
import {
	formatProviderExternalId,
	getProviderLabel,
} from "@/providers/provider-labels";
import { getProviderOpenTarget } from "@/providers/provider-links";
import { openProviderPage } from "@/rpc/provider-page";
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
	contentContainer: HTMLDivElement | null;
	anilistHeaderData: AniListHeaderData;
	anilistId: AniListId;
	isMappingView: boolean;
	isProviderTargetLoading?: boolean | undefined;
	currentTarget: MediaModalTargetSummary | null;
	previewTarget: MediaModalTargetSummary | null;
	workspaceClassName?: string | undefined;
	onClose: MouseEventHandler<HTMLButtonElement>;
	onOpenSettings?: (() => void) | undefined;
};

const CHROME_BUTTON_CLASS =
	"!h-9 !w-9 !rounded-none !p-0 text-text-secondary hover:text-text-primary";
const HEADER_CARD_CLASS =
	"relative flex h-[calc(var(--spacing)*30)] min-w-0 overflow-hidden rounded-xl border border-border-primary/60 bg-bg-secondary/10 backdrop-blur-[4px] transition-[opacity,filter,box-shadow] md:h-[calc(var(--spacing)*37)]";

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

	return values.length > 0 ? values.join(" • ") : null;
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
			<MappingPoster src={coverImage} side="left" />

			<div className="relative flex min-w-0 flex-1 flex-col p-3 text-left md:p-4">
				<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary md:text-lg">
					{title}
				</h2>

				<div className="mt-auto min-w-0 pt-2 md:pt-3">
					{anilistMetaLine ? (
						<p className="truncate text-[10px] text-text-secondary md:text-xs">
							{anilistMetaLine}
						</p>
					) : null}

					<div className="mt-0.5 flex min-w-0">
						<MappingOpenLink
							href={anilistLink}
							ariaLabel="Open in AniList"
							side="left"
						>
							{`AniList #${anilistId}`}
						</MappingOpenLink>
					</div>
				</div>
			</div>
		</div>
	);
}

type ProviderCardProps = {
	provider: Provider;
	target: MediaModalTargetSummary | null;
	isLoading: boolean;
	isDimmed: boolean;
	isHighlighted: boolean;
};

function getProviderCardDisplay(input: {
	providerLabel: string;
	target: MediaModalTargetSummary | null;
	isLoading: boolean;
}): {
	title: string;
	description: string | null;
	targetKey: string;
} {
	const { providerLabel, target, isLoading } = input;

	if (target) {
		return {
			title: target.title,
			description: null,
			targetKey: `${target.provider}:${target.providerId}`,
		};
	}

	if (isLoading) {
		return {
			title: `Loading ${providerLabel} target...`,
			description: null,
			targetKey: "loading",
		};
	}

	return {
		title: "No match selected",
		description: `Search below to choose the ${providerLabel} target.`,
		targetKey: "none",
	};
}

function ProviderCardContent(props: {
	display: ReturnType<typeof getProviderCardDisplay>;
	providerLabel: string;
	providerMetaLine: string | null;
	providerIdLine: string | null;
	openProvider: MouseEventHandler<HTMLButtonElement> | null;
}): React.JSX.Element {
	const {
		display,
		providerLabel,
		providerMetaLine,
		providerIdLine,
		openProvider,
	} = props;
	const hasProviderMeta =
		providerMetaLine !== null ||
		(providerIdLine !== null && openProvider !== null);

	return (
		<div
			key={display.targetKey}
			className="a2a-fade-blur-in absolute inset-0 flex min-w-0 flex-col items-end p-3 text-right md:p-4"
		>
			<h2 className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary md:text-lg">
				{display.title}
			</h2>

			{display.description ? (
				<p className="mt-1 line-clamp-2 text-[10px] leading-4 text-text-secondary md:text-xs md:leading-5">
					{display.description}
				</p>
			) : null}

			{hasProviderMeta ? (
				<div className="mt-auto min-w-0 pt-2 md:pt-3">
					{providerMetaLine ? (
						<p className="truncate text-[10px] text-text-secondary md:text-xs">
							{providerMetaLine}
						</p>
					) : null}

					{providerIdLine && openProvider ? (
						<div className="mt-0.5 flex min-w-0 justify-end">
							<button
								type="button"
								onClick={openProvider}
								className="ml-auto flex w-fit max-w-full items-center gap-1 text-[10px] leading-tight font-medium text-text-secondary transition-colors hover:text-accent-primary focus-visible:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary md:text-xs"
								aria-label={`Open in ${providerLabel}`}
							>
								<span className="truncate">{providerIdLine}</span>
								<ExternalLink className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" />
							</button>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function ProviderCard(props: ProviderCardProps): React.JSX.Element {
	const {
		provider,
		target,
		isLoading,
		isDimmed,
		isHighlighted,
	} = props;

	const providerLabel = getProviderLabel(provider);
	const display = getProviderCardDisplay({
		providerLabel,
		target,
		isLoading,
	});

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

	const providerOpenTarget = target
		? getProviderOpenTarget({
				isInLibrary: target.isInLibrary,
				providerRouteSlug: target.providerRouteSlug,
				searchTerm: target.title,
			})
		: null;
	const openProvider = providerOpenTarget
		? (event: MouseEvent<HTMLButtonElement>): void => {
				if (!event.isTrusted) return;

				openProviderPage({ provider, target: providerOpenTarget });
			}
		: null;

	const posterUrl = target?.posterUrl ?? null;

	return (
		<div
			className={cn(
				HEADER_CARD_CLASS,
				isHighlighted
					? "border-accent-primary/35 bg-accent-primary/8"
					: null,
			)}
		>
			<div
				className={cn(
					"relative flex min-w-0 flex-1 transition-[opacity,filter]",
					isDimmed ? "opacity-50 grayscale" : null,
				)}
			>
				<div className="relative min-w-0 flex-1 overflow-hidden">
					<ProviderCardContent
						display={display}
						providerLabel={providerLabel}
						providerMetaLine={providerMetaLine}
						providerIdLine={providerIdLine}
						openProvider={openProvider}
					/>
				</div>

				<MappingPoster src={posterUrl} side="right" />
			</div>
		</div>
	);
}

export function ModalHeader(props: ModalHeaderProps): React.JSX.Element {
	const {
		provider,
		contentContainer,
		anilistHeaderData,
		anilistId,
		isMappingView,
		isProviderTargetLoading = false,
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
							if (!event.isTrusted) return;

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
					tooltip="Close modal"
					tooltipContainer={contentContainer ?? undefined}
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
					<div className="a2a-modal-header-item min-w-0">
						<SourceCard
							anilistHeaderData={anilistHeaderData}
							anilistId={anilistId}
						/>
					</div>
					<div className="a2a-modal-header-item a2a-delay-50 min-w-0">
						<MappingConnector state={connectorState} />
					</div>
					<div className="a2a-modal-header-item a2a-delay-100 min-w-0">
						<ProviderCard
							provider={provider}
							target={target}
							isLoading={isProviderTargetLoading && target === null}
							isDimmed={isCurrentTargetDimmed}
							isHighlighted={isTargetHighlighted}
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
