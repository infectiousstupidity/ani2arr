/** Seerr media-action workflow shared by browse overlays and anime-page buttons. */

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import {
	getSeerrActionState,
	getSeerrVisualStatus,
	type SeerrActionState,
} from "@/features/seerr-request/seerr-action-state";
import { toSeerrRequestInput } from "@/features/seerr-request/seerr-request-input";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { SeerrMediaStatus, SeerrMediaType } from "@/providers/seerr/types";
import { useSeerrMediaStatus, useSeerrTarget } from "@/queries/seerr";
import { openSeerrPage } from "@/rpc/provider-page";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { GetSeerrTargetInput } from "@/rpc/types";

interface SeerrMediaActionInput {
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
	title: string | null;
	metadata: AniListMediaHint | null;
	mediaType: SeerrMediaType | null;
	isConfigured: boolean;
	enabled: boolean;
	statusBlocked?: boolean;
	onOpenModal(): void;
}

export interface SeerrMediaAction {
	status: SeerrActionState;
	visualStatus: SeerrMediaStatus | undefined;
	visualTitle: string;
	openProvider: (() => void) | null;
	runPrimaryAction(): void;
}

function getTargetInput(
	input: SeerrMediaActionInput,
): GetSeerrTargetInput | null {
	if (input.mediaType === null) return null;

	return {
		source: input.source,
		...(input.anilistId === undefined ? {} : { anilistId: input.anilistId }),
		mediaType: input.mediaType,
		...(input.title === null ? {} : { title: input.title }),
		metadata: input.metadata,
	};
}

export function useSeerrMediaAction(
	input: SeerrMediaActionInput,
): SeerrMediaAction {
	const targetWorkEnabled =
		input.isConfigured &&
		input.enabled &&
		input.statusBlocked !== true &&
		input.mediaType !== null;
	const targetQuery = useSeerrTarget(getTargetInput(input), {
		enabled: targetWorkEnabled,
	});
	const target = targetQuery.data ?? null;
	const requestInput = toSeerrRequestInput(target);
	const statusWorkEnabled = targetWorkEnabled && requestInput !== null;
	const statusQuery = useSeerrMediaStatus({
		requestInput,
		enabled: statusWorkEnabled,
	});
	const isChecking =
		(input.isConfigured && input.enabled && input.statusBlocked === true) ||
		(targetWorkEnabled && targetQuery.isPending) ||
		(statusWorkEnabled && statusQuery.isPending);
	const status = getSeerrActionState({
		isConfigured: input.isConfigured,
		isChecking,
		hasUsableTarget: requestInput !== null,
		status: statusQuery.data?.target,
	});
	const visualStatus = getSeerrVisualStatus(statusQuery.data);
	const openTarget = input.isConfigured ? target : null;

	return {
		status,
		visualStatus,
		visualTitle:
			visualStatus === "partial"
				? "Partially in Seerr. Request mapped season."
				: status.label,
		openProvider:
			openTarget === null
				? null
				: () =>
						openSeerrPage({
							mediaType: openTarget.mediaType,
							tmdbId: openTarget.tmdbId,
						}),
		runPrimaryAction: () => {
			if (!input.isConfigured) {
				openOptionsPage({ sectionId: "seerr" });
				return;
			}

			if (!status.disabled) input.onOpenModal();
		},
	};
}
