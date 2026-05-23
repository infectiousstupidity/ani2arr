/** Compact provider target facts for current and preview mapping detail panels. */
// src/features/media-modal/details/target-details-card.tsx

import { getProviderLabel } from "@/providers/provider-labels";
import Pill from "@/shared/ui/primitives/pill";
import type { MediaModalTargetSummary } from "../types";

type TargetDetailsCardProps = {
	mapping: MediaModalTargetSummary;
};

function formatDisplayLabel(value: string): string {
	return value
		.replaceAll("_", " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getMediaKind(mapping: MediaModalTargetSummary): string {
	return mapping.provider === "sonarr" ? "TV" : "Movie";
}

function getMediaBadgeLabel(mapping: MediaModalTargetSummary): string {
	const mediaKind = getMediaKind(mapping);

	if (!mapping.typeLabel) {
		return mediaKind;
	}

	return `${mediaKind} • ${formatDisplayLabel(mapping.typeLabel)}`;
}

function getStatusDotClass(statusLabel: string): string {
	const normalized = statusLabel.toLowerCase();

	if (normalized === "continuing") {
		return "bg-success";
	}

	if (normalized === "deleted") {
		return "bg-error";
	}

	if (normalized === "upcoming") {
		return "bg-accent-primary";
	}

	return "bg-text-secondary";
}

function getStatusTone(
	statusLabel: string,
): "success" | "accent" | "warning" | "muted" {
	const normalized = statusLabel.toLowerCase();

	if (normalized === "continuing") {
		return "success";
	}

	if (normalized === "upcoming") {
		return "accent";
	}

	if (normalized === "deleted") {
		return "warning";
	}

	return "muted";
}

function getLibraryPillLabel(
	mapping: MediaModalTargetSummary,
	providerLabel: string,
): string {
	if (!mapping.isInLibrary) {
		return `Not in ${providerLabel}`;
	}

	if (mapping.provider === "sonarr") {
		const { episodeCount, episodeFileCount } = mapping;

		if (episodeCount !== undefined && episodeFileCount !== undefined) {
			return `In ${providerLabel}: ${episodeFileCount}/${episodeCount} eps`;
		}

		return `In ${providerLabel}`;
	}

	if (mapping.hasFile !== undefined) {
		return `In ${providerLabel}: ${mapping.hasFile ? "1 file" : "0 files"}`;
	}

	return `In ${providerLabel}`;
}

function getExtraFactPillLabels(mapping: MediaModalTargetSummary): string[] {
	if (mapping.provider === "radarr" && mapping.runtimeMinutes !== undefined) {
		return [`${mapping.runtimeMinutes} min`];
	}

	return [];
}

export function TargetDetailsCard(
	props: TargetDetailsCardProps,
): React.JSX.Element {
	const { mapping } = props;
	const providerLabel = getProviderLabel(mapping.provider);
	const libraryPillLabel = getLibraryPillLabel(mapping, providerLabel);
	const extraFactPillLabels = getExtraFactPillLabels(mapping);

	return (
		<div className="relative shrink-0 space-y-3">
			<div className="flex min-w-0 flex-wrap gap-2">
				{mapping.statusLabel ? (
					<Pill
						small
						tone={getStatusTone(mapping.statusLabel)}
						className="gap-1.5 normal-case"
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${getStatusDotClass(mapping.statusLabel)}`}
						/>
						{formatDisplayLabel(mapping.statusLabel)}
					</Pill>
				) : null}
				<Pill small tone="muted" className="normal-case">
					{getMediaBadgeLabel(mapping)}
				</Pill>
				<Pill
					small
					tone={mapping.isInLibrary ? "success" : "muted"}
					className="normal-case"
				>
					{libraryPillLabel}
				</Pill>
				{extraFactPillLabels.map((label) => (
					<Pill key={label} small tone="muted" className="normal-case">
						{label}
					</Pill>
				))}
			</div>

			{mapping.overview ? (
				<p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
					{mapping.overview}
				</p>
			) : null}
		</div>
	);
}
