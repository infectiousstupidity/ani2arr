/** Launch-time provider status metadata for media modal openings. */
// src/features/media-modal/launch-snapshot.ts

import type { Provider } from "@/providers";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import { hasFullRadarrEditItem, hasFullSonarrEditItem } from "./setup-target";

const FRESH_LAUNCH_SNAPSHOT_MS = 60_000;

export type LaunchSnapshotSource = "cache" | "live" | "unknown";

export type SonarrLaunchSnapshot = {
	provider: Extract<Provider, "sonarr">;
	status: CheckSeriesStatusResponse | null;
	source: LaunchSnapshotSource;
	verifiedAt: number | null;
	hasFullProviderItem: boolean;
};

export type RadarrLaunchSnapshot = {
	provider: Extract<Provider, "radarr">;
	status: CheckMovieStatusResponse | null;
	source: LaunchSnapshotSource;
	verifiedAt: number | null;
	hasFullProviderItem: boolean;
};

export type MediaModalLaunchSnapshot =
	| SonarrLaunchSnapshot
	| RadarrLaunchSnapshot;

type CreateSonarrLaunchSnapshotInput = {
	provider: Extract<Provider, "sonarr">;
	status?: CheckSeriesStatusResponse | null;
	source?: LaunchSnapshotSource;
	verifiedAt?: number | null;
};

type CreateRadarrLaunchSnapshotInput = {
	provider: Extract<Provider, "radarr">;
	status?: CheckMovieStatusResponse | null;
	source?: LaunchSnapshotSource;
	verifiedAt?: number | null;
};

export function hasFullProviderItem(
	provider: "sonarr",
	status: CheckSeriesStatusResponse | null | undefined,
): boolean;
export function hasFullProviderItem(
	provider: "radarr",
	status: CheckMovieStatusResponse | null | undefined,
): boolean;
export function hasFullProviderItem(
	provider: Provider,
	status:
		| CheckMovieStatusResponse
		| CheckSeriesStatusResponse
		| null
		| undefined,
): boolean {
	if (!status) return false;

	return provider === "radarr"
		? hasFullRadarrEditItem(status as CheckMovieStatusResponse)
		: hasFullSonarrEditItem(status as CheckSeriesStatusResponse);
}

export function createLaunchSnapshot(
	input: CreateSonarrLaunchSnapshotInput,
): SonarrLaunchSnapshot;
export function createLaunchSnapshot(
	input: CreateRadarrLaunchSnapshotInput,
): RadarrLaunchSnapshot;
export function createLaunchSnapshot({
	provider,
	status = null,
	source = "unknown",
	verifiedAt = null,
}:
	| CreateSonarrLaunchSnapshotInput
	| CreateRadarrLaunchSnapshotInput): MediaModalLaunchSnapshot {
	return {
		provider,
		status,
		source,
		verifiedAt,
		hasFullProviderItem:
			provider === "radarr"
				? hasFullRadarrEditItem(status as CheckMovieStatusResponse)
				: hasFullSonarrEditItem(status as CheckSeriesStatusResponse),
	} as MediaModalLaunchSnapshot;
}

export const isFreshLaunchSnapshot = (
	snapshot: MediaModalLaunchSnapshot | null | undefined,
	now = Date.now(),
): boolean => {
	if (snapshot?.source !== "live" || snapshot.verifiedAt === null) return false;

	const ageMs = now - snapshot.verifiedAt;
	return ageMs >= 0 && ageMs <= FRESH_LAUNCH_SNAPSHOT_MS;
};

export const shouldForceVerifyOnModalOpen = (
	snapshot: MediaModalLaunchSnapshot | null | undefined,
	now = Date.now(),
): boolean =>
	!(snapshot?.hasFullProviderItem && isFreshLaunchSnapshot(snapshot, now));
