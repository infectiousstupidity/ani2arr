/** Sonarr inherited-candidate verification against exact provider metadata. */
// src/mapping/hints/inherited-verifier.ts

import type { AniListId } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import {
	extractCandidateTitleVariants,
	normalizeTitleTokens,
} from "@/mapping/pipeline/matching";
import {
	sanitizeLookupDisplayForProvider,
	stripSeasonalSuffixes,
} from "@/mapping/title-normalization";
import type {
	ProviderCredentials,
	SonarrLookupSeries,
	TvdbId,
} from "@/providers";
import type { ProviderLookupClient } from "../lookup";
import type { InheritedMappingVerificationDetails } from "../types";

const SEASON_INDICATORS = new Set(["season", "part", "cour"]);
const ROMAN_NUMERAL_RE = /^[cdilmvx]+$/i;
const SEASON_CODE_RE = /^s\d+$/i;

type InheritedProposal = {
	providerId: TvdbId;
	borrowedBaseTitle?: string;
	immediateSourceAniListId: AniListId;
	chainAnchorAniListId: AniListId;
};

type ExactSonarrLookupClient = Pick<
	ProviderLookupClient<ProviderCredentials, SonarrLookupSeries>,
	"lookupExactByProviderId"
>;

export interface InheritedVerificationResult {
	verdict: "accept" | "reject" | "ambiguous" | "verification-failed";
	title?: string;
	details: InheritedMappingVerificationDetails;
}

function collectCurrentTitles(media: AniListMedia): string[] {
	return [
		media.title?.english,
		media.title?.romaji,
		media.title?.native,
		...(Array.isArray(media.synonyms) ? media.synonyms : []),
	].filter(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);
}

function toFamilyKey(value: string): string {
	const sanitized = sanitizeLookupDisplayForProvider("sonarr", value);
	const stripped = stripSeasonalSuffixes(sanitized || value.trim());
	const { tokens } = normalizeTitleTokens(stripped, {
		filterStopwords: true,
		keepYear: false,
		allowSingleLetters: false,
	});

	return tokens
		.filter(
			(token) =>
				!SEASON_INDICATORS.has(token) &&
				!ROMAN_NUMERAL_RE.test(token) &&
				!SEASON_CODE_RE.test(token),
		)
		.join(" ");
}

function collectFamilyKeys(values: readonly string[]): string[] {
	const families = new Set<string>();

	for (const value of values) {
		const family = toFamilyKey(value);
		if (family) {
			families.add(family);
		}
	}

	return [...families];
}

function hasFamilyOverlap(
	left: readonly string[],
	right: readonly string[],
): boolean {
	for (const leftFamily of left) {
		const leftTokens = new Set(leftFamily.split(/\s+/).filter(Boolean));
		for (const rightFamily of right) {
			const rightTokens = rightFamily.split(/\s+/).filter(Boolean);
			if (rightTokens.some((token) => leftTokens.has(token))) {
				return true;
			}
		}
	}

	return false;
}

function evaluateFamilySignals(
	providerFamilies: string[],
	currentFamilies: string[],
	borrowedFamilies: string[],
): { positiveSignals: string[]; contradictions: string[] } {
	const positiveSignals: string[] = [];
	const contradictions: string[] = [];

	if (providerFamilies.some((family) => currentFamilies.includes(family))) {
		positiveSignals.push(
			"Exact Sonarr titles match the current AniList title family.",
		);
	} else if (hasFamilyOverlap(providerFamilies, currentFamilies)) {
		positiveSignals.push(
			"Exact Sonarr titles overlap the current AniList title family.",
		);
	}

	if (borrowedFamilies.length > 0) {
		if (providerFamilies.some((family) => borrowedFamilies.includes(family))) {
			positiveSignals.push(
				"Exact Sonarr titles match the trusted related-entry base title family.",
			);
		} else if (hasFamilyOverlap(providerFamilies, borrowedFamilies)) {
			positiveSignals.push(
				"Exact Sonarr titles overlap the trusted related-entry base title family.",
			);
		}
	}

	const referenceFamilies = [
		...new Set([...currentFamilies, ...borrowedFamilies]),
	];
	if (
		referenceFamilies.length > 0 &&
		providerFamilies.length > 0 &&
		!hasFamilyOverlap(providerFamilies, referenceFamilies)
	) {
		contradictions.push(
			"Exact Sonarr titles conflict with the current and trusted related AniList title families.",
		);
	}

	return { positiveSignals, contradictions };
}

function createFailureResult(
	reason: string,
	proposal: InheritedProposal,
): InheritedVerificationResult {
	return {
		verdict: "verification-failed",
		details: {
			reason,
			positiveSignals: [],
			contradictions: [],
			immediateSourceAniListId: proposal.immediateSourceAniListId,
			chainAnchorAniListId: proposal.chainAnchorAniListId,
		},
	};
}

export async function verifyInheritedSonarrCandidate(
	media: AniListMedia,
	proposal: InheritedProposal,
	lookupClient: ExactSonarrLookupClient,
	credentials: ProviderCredentials,
): Promise<InheritedVerificationResult> {
	if (typeof lookupClient.lookupExactByProviderId !== "function") {
		return createFailureResult(
			"Sonarr exact verification is unavailable for inherited mapping.",
			proposal,
		);
	}

	let exactLookup: SonarrLookupSeries | null;
	try {
		exactLookup = await lookupClient.lookupExactByProviderId(
			proposal.providerId,
			credentials,
		);
	} catch {
		return createFailureResult(
			"Exact Sonarr lookup failed while verifying the inherited mapping.",
			proposal,
		);
	}

	if (!exactLookup) {
		return createFailureResult(
			"Exact Sonarr lookup returned no metadata for the inherited provider ID.",
			proposal,
		);
	}

	const providerTitles = extractCandidateTitleVariants(
		"sonarr",
		exactLookup,
	).map((variant) => variant.value);
	if (providerTitles.length === 0) {
		return createFailureResult(
			"Exact Sonarr lookup did not expose usable title metadata for verification.",
			proposal,
		);
	}

	const currentFamilies = collectFamilyKeys(collectCurrentTitles(media));
	const borrowedFamilies = proposal.borrowedBaseTitle
		? collectFamilyKeys([proposal.borrowedBaseTitle])
		: [];
	const providerFamilies = collectFamilyKeys(providerTitles);

	const { positiveSignals, contradictions } = evaluateFamilySignals(
		providerFamilies,
		currentFamilies,
		borrowedFamilies,
	);

	const details: InheritedMappingVerificationDetails = {
		reason:
			contradictions[0] ??
			positiveSignals[0] ??
			"Exact Sonarr metadata was too weak to accept the inherited mapping.",
		positiveSignals,
		contradictions,
		immediateSourceAniListId: proposal.immediateSourceAniListId,
		chainAnchorAniListId: proposal.chainAnchorAniListId,
	};

	const titlePayload = providerTitles[0] ? { title: providerTitles[0] } : {};

	if (contradictions.length > 0) {
		return { verdict: "reject", details, ...titlePayload };
	}

	if (positiveSignals.length > 0) {
		return { verdict: "accept", details, ...titlePayload };
	}

	return { verdict: "ambiguous", details, ...titlePayload };
}
