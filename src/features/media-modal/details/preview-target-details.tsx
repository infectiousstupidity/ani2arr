/** Renders selected provider candidate support details and linked AniList entries in the media modal. */
// src/features/media-modal/details/preview-target-details.tsx

import { AlertTriangle, ExternalLink } from "lucide-react";
import type { AniListId } from "@/anilist";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import {
	formatProviderExternalId,
	getProviderLabel,
} from "@/providers/provider-labels";
import Button from "@/shared/ui/primitives/button";
import Pill from "@/shared/ui/primitives/pill";
import type { MediaModalTargetSummary } from "../types";
import { MappingLinkedEntries } from "./linked-entries";

type PreviewTargetDetailsProps = {
	aniListEntryId: AniListId;
	previewMapping: MediaModalTargetSummary;
	overwrittenTarget: MediaModalTargetSummary | null;
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
};

function getStatusTone(
	status: string,
): "muted" | "success" | "warning" | "info" | "accent" | "blue" | "default" {
	const normalized = status.toLowerCase();
	if (normalized === "continuing") return "accent";
	if (normalized === "upcoming") return "info";
	if (normalized === "ended") return "muted";
	if (normalized === "deleted") return "warning";
	return "default";
}

function getLibraryPillSuffix(mapping: MediaModalTargetSummary): string {
	if (mapping.provider === "sonarr" && mapping.episodeFileCount) {
		return ` - ${mapping.episodeFileCount} eps`;
	}

	if (mapping.provider === "radarr" && mapping.hasFile) {
		return " - has file";
	}

	return "";
}

function OverwriteTargetBanner(props: {
	target: MediaModalTargetSummary;
}): React.JSX.Element {
	const { target } = props;

	return (
		<div className="flex min-w-0 items-center gap-2 rounded-md border border-error/30 bg-error/8 p-2 text-sm text-text-secondary">
			<AlertTriangle className="h-4 w-4 shrink-0 text-error" />
			<p className="min-w-0 truncate">
				Overwriting current target:
				<span className="ml-1 line-through opacity-70">{target.title}</span>
			</p>
		</div>
	);
}

function MappingPreviewDetails(props: {
	mapping: MediaModalTargetSummary;
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
}): React.JSX.Element {
	const {
		mapping,
		baseUrl,
		contentContainer,
	} = props;
	const providerLabel = getProviderLabel(mapping.provider);
	const tooltipContainer = contentContainer ?? undefined;
	const providerIdLabel = `${providerLabel} · ${formatProviderExternalId(mapping.provider, mapping.providerId)}`;
	const link = buildProviderOpenUrl({
		provider: mapping.provider,
		baseUrl,
		isInLibrary: mapping.isInLibrary,
		...(mapping.providerRouteSlug
			? { providerRouteSlug: mapping.providerRouteSlug }
			: {}),
		searchTerm: mapping.title,
	});
	return (
		<div className="relative shrink-0 rounded-xl border border-border-primary/60 bg-bg-primary/14 p-3 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					<Pill small tone="muted" className="font-mono text-text-primary">
						{providerIdLabel}
					</Pill>
					{typeof mapping.year === "number" &&
					Number.isFinite(mapping.year) &&
					mapping.year > 0 ? (
						<Pill small tone="muted">
							{mapping.year}
						</Pill>
					) : null}
					{mapping.typeLabel ? (
						<Pill small tone="muted" className="text-text-secondary">
							{mapping.typeLabel}
						</Pill>
					) : null}
					{mapping.statusLabel ? (
						<Pill small tone={getStatusTone(mapping.statusLabel)}>
							{mapping.statusLabel}
						</Pill>
					) : null}
					{mapping.isInLibrary ? (
						<Pill
							small
							tone="success"
							className="border-transparent bg-success/85 text-iconbutton-text"
						>
							{`In ${providerLabel}${getLibraryPillSuffix(mapping)}`}
						</Pill>
					) : null}
				</div>

				<div className="flex shrink-0 items-center">
					{link ? (
						<Button
							asChild
							variant="ghost"
							size="icon"
							tooltip={`Open in ${providerLabel}`}
							tooltipContainer={tooltipContainer}
							className="h-8 w-8 text-text-secondary hover:text-text-primary"
						>
							<a
								href={link}
								target="_blank"
								rel="noreferrer"
								aria-label={`Open in ${providerLabel}`}
							>
								<ExternalLink className="h-4 w-4" />
							</a>
						</Button>
					) : null}
				</div>
			</div>

			{mapping.overview ? (
				<p className="mt-3 line-clamp-5 text-xs leading-relaxed text-text-secondary/80">
					{mapping.overview}
				</p>
			) : null}
		</div>
	);
}

export function PreviewTargetDetails(
	props: PreviewTargetDetailsProps,
): React.JSX.Element {
	const {
		aniListEntryId,
		previewMapping,
		overwrittenTarget,
		baseUrl,
		contentContainer,
	} = props;

	return (
		<div className="flex flex-col gap-4">
			<div className="shrink-0 space-y-4">
				{overwrittenTarget ? (
					<OverwriteTargetBanner target={overwrittenTarget} />
				) : null}

				<MappingPreviewDetails
					mapping={previewMapping}
					baseUrl={baseUrl}
					contentContainer={contentContainer}
				/>
			</div>

			<MappingLinkedEntries
				currentAniListId={aniListEntryId}
				linkedAniListIds={previewMapping.linkedAniListIds ?? []}
			/>
		</div>
	);
}
