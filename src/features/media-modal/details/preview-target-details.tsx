/** Renders selected provider candidate details and linked AniList entries in the media modal. */
// src/features/media-modal/details/preview-target-details.tsx

import { ArrowDown, ExternalLink, X } from "lucide-react";
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
	onResetPreview: () => void;
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

function MappingPreviewCard(props: {
	mapping: MediaModalTargetSummary;
	baseUrl: string;
	onResetPreview: () => void;
	contentContainer: HTMLDivElement | null;
}): React.JSX.Element {
	const {
		mapping,
		baseUrl,
		onResetPreview,
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
		<div className="relative shrink-0 overflow-hidden rounded-2xl border border-border-primary/70 bg-bg-primary/18 ring-1 ring-inset ring-accent-primary/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
			<div className="flex gap-5 p-4">
				<div className="h-44 w-32 shrink-0 overflow-hidden rounded-lg bg-bg-primary shadow-inner">
					{mapping.posterUrl ? (
						<img
							src={mapping.posterUrl}
							alt={mapping.title}
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="h-full w-full bg-bg-primary" />
					)}
				</div>

				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-start justify-between gap-3">
						<h3
							className="line-clamp-2 text-xl font-semibold leading-tight text-text-primary"
							title={mapping.title}
						>
							{mapping.title}
						</h3>

						<div className="flex shrink-0 items-center gap-1">
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

							<Button
								type="button"
								variant="ghost"
								size="icon"
								tooltip="Clear selection"
								tooltipContainer={tooltipContainer}
								className="h-8 w-8 text-text-secondary hover:text-destructive"
								onClick={onResetPreview}
								aria-label="Clear selection"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap items-center gap-2">
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
								className="border-transparent bg-success/85 text-white"
							>
								{`In ${providerLabel}${getLibraryPillSuffix(mapping)}`}
							</Pill>
						) : null}
					</div>

					<div className="mt-3 line-clamp-4 text-xs leading-relaxed text-text-secondary/80">
						{mapping.overview ?? "No overview available."}
					</div>
				</div>
			</div>
		</div>
	);
}

export function PreviewTargetDetails(
	props: PreviewTargetDetailsProps,
): React.JSX.Element {
	const {
		aniListEntryId,
		previewMapping,
		onResetPreview,
		baseUrl,
		contentContainer,
	} = props;
	const providerLabel = getProviderLabel(previewMapping.provider);

	return (
		<div className="flex flex-col gap-4">
			<div className="shrink-0 space-y-4">
				<div className="rounded-xl border border-border-primary/50 bg-bg-primary/14 p-3">
					<div className="flex items-center gap-2 text-accent-primary">
						<ArrowDown className="h-4 w-4 shrink-0" />
						<p className="text-sm font-medium text-text-primary">
							{`Confirm selection to replace the current ${providerLabel} target above.`}
						</p>
					</div>
				</div>

				<MappingPreviewCard
					mapping={previewMapping}
					baseUrl={baseUrl}
					onResetPreview={onResetPreview}
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
