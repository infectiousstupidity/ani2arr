/** Owns Sonarr setup target selection after mapping changes. */
// src/features/media-modal/hooks/sonarr/use-sonarr-setup-target-controller.ts

import { useMemo, useState } from "react";

import { parseTvdbIdOrNull } from "@/providers";
import {
	createSonarrSetupTargetCandidate,
	getSonarrSetupTargetCandidateStatus,
	type SonarrSetupTarget,
} from "../../setup-target";

type SonarrSetupCandidateInput = Parameters<
	typeof createSonarrSetupTargetCandidate
>[0];
type TvdbIdInput = Parameters<typeof parseTvdbIdOrNull>[0];

type SonarrMappingTarget =
	| {
			provider: string | null;
			providerId: TvdbIdInput;
			title?: string | null;
			providerFolderName?: string | null;
	  }
	| null
	| undefined;

interface UseSonarrSetupTargetControllerInput {
	anilistId: SonarrSetupCandidateInput["anilistId"];
	rawProviderStatus: SonarrSetupCandidateInput["status"];
	providerRequestTitle: SonarrSetupCandidateInput["targetTitle"];
	storedDefaults: SonarrSetupCandidateInput["storedDefaults"];
}

interface SonarrSetupTargetController {
	setupTarget: SonarrSetupTarget | null;
	getSetupTargetForMapping: (
		mapping: SonarrMappingTarget,
	) => SonarrSetupTarget | null;
	replaceSetupTarget: (target: SonarrSetupTarget) => void;
}

export function useSonarrSetupTargetController({
	anilistId,
	rawProviderStatus,
	providerRequestTitle,
	storedDefaults,
}: UseSonarrSetupTargetControllerInput): SonarrSetupTargetController {
	const setupCandidate = useMemo(
		() =>
			createSonarrSetupTargetCandidate({
				anilistId,
				status: rawProviderStatus,
				targetTitle: providerRequestTitle,
				storedDefaults,
			}),
		[anilistId, rawProviderStatus, providerRequestTitle, storedDefaults],
	);

	const [replacementSetupTarget, setReplacementSetupTarget] =
		useState<SonarrSetupTarget | null>(null);

	const setupTarget = replacementSetupTarget ?? setupCandidate;
	const getSetupTargetForMapping = (
		mapping: SonarrMappingTarget,
	): SonarrSetupTarget | null => {
		if (mapping?.provider !== "sonarr") {
			return null;
		}

		const tvdbId = parseTvdbIdOrNull(mapping.providerId);
		if (tvdbId === null) {
			return null;
		}

		return createSonarrSetupTargetCandidate({
			anilistId,
			status: getSonarrSetupTargetCandidateStatus({
				status: rawProviderStatus,
				tvdbId,
			}),
			targetTitle: mapping.title ?? providerRequestTitle,
			storedDefaults,
			providerFolderName: mapping.providerFolderName,
		});
	};

	return {
		setupTarget,
		getSetupTargetForMapping,
		replaceSetupTarget: setReplacementSetupTarget,
	};
}
