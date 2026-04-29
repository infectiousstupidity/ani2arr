/** Owns Radarr setup target selection after mapping changes. */
// src/features/media-modal/hooks/radarr/use-radarr-setup-target-controller.ts

import { useMemo, useState } from "react";

import { parseTmdbIdOrNull } from "@/providers";
import {
	createRadarrSetupTargetCandidate,
	getRadarrSetupTargetCandidateStatus,
	type RadarrSetupTarget,
} from "../../setup-target";

type RadarrSetupCandidateInput = Parameters<
	typeof createRadarrSetupTargetCandidate
>[0];
type TmdbIdInput = Parameters<typeof parseTmdbIdOrNull>[0];

type RadarrMappingTarget =
	| {
			provider: string | null;
			providerId: TmdbIdInput;
			title?: string | null;
	  }
	| null
	| undefined;

interface UseRadarrSetupTargetControllerInput {
	anilistId: RadarrSetupCandidateInput["anilistId"];
	rawProviderStatus: RadarrSetupCandidateInput["status"];
	providerRequestTitle: RadarrSetupCandidateInput["targetTitle"];
	storedDefaults: RadarrSetupCandidateInput["storedDefaults"];
}

interface RadarrSetupTargetController {
	setupTarget: RadarrSetupTarget | null;
	getSetupTargetForMapping: (
		mapping: RadarrMappingTarget,
	) => RadarrSetupTarget | null;
	replaceSetupTarget: (target: RadarrSetupTarget) => void;
}

export function useRadarrSetupTargetController({
	anilistId,
	rawProviderStatus,
	providerRequestTitle,
	storedDefaults,
}: UseRadarrSetupTargetControllerInput): RadarrSetupTargetController {
	const setupCandidate = useMemo(
		() =>
			createRadarrSetupTargetCandidate({
				anilistId,
				status: rawProviderStatus,
				targetTitle: providerRequestTitle,
				storedDefaults,
			}),
		[anilistId, rawProviderStatus, providerRequestTitle, storedDefaults],
	);

	const [replacementSetupTarget, setReplacementSetupTarget] =
		useState<RadarrSetupTarget | null>(null);

	const setupTarget = replacementSetupTarget ?? setupCandidate;
	const getSetupTargetForMapping = (
		mapping: RadarrMappingTarget,
	): RadarrSetupTarget | null => {
		if (mapping?.provider !== "radarr") {
			return null;
		}

		const tmdbId = parseTmdbIdOrNull(mapping.providerId);
		if (tmdbId === null) {
			return null;
		}

		return createRadarrSetupTargetCandidate({
			anilistId,
			status: getRadarrSetupTargetCandidateStatus({
				status: rawProviderStatus,
				tmdbId,
			}),
			targetTitle: mapping.title ?? providerRequestTitle,
			storedDefaults,
		});
	};

	return {
		setupTarget,
		getSetupTargetForMapping,
		replaceSetupTarget: setReplacementSetupTarget,
	};
}
