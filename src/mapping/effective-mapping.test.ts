import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist";
import { parseTvdbId } from "@/providers";
import { buildEffectiveMapping } from "./effective-mapping";

describe("buildEffectiveMapping", () => {
	const baseInput = {
		provider: "sonarr" as const,
		anilistId: parseAniListId(1),
		manualProviderId: null,
		ignored: false,
		upstreamProviderIds: [],
		rejectedCandidateProviderId: null,
		autoMappingRecord: null,
	};

	it("keeps manual mappings behind explicit ignores", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			manualProviderId: parseTvdbId(123),
			ignored: true,
		});

		expect(identity).toMatchObject({
			provider: "sonarr",
			anilistId: parseAniListId(1),
			providerId: null,
			providerMappingState: "unmapped",
			mappingEntryKind: "ignored",
		});
		expect(identity.mappingSource).toBeUndefined();
		expect(identity.mappingReason).toBeUndefined();
	});

	it("uses manual mappings when there is no matching upstream mapping", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			manualProviderId: parseTvdbId(123),
			upstreamProviderIds: [parseTvdbId(999)],
		});

		expect(identity).toMatchObject({
			providerId: parseTvdbId(123),
			providerMappingState: "mapped",
			mappingEntryKind: "manual",
			mappingSource: "manual",
			mappingReason: "manual-override",
			exactUpstreamMatchProviderId: parseTvdbId(999),
		});
	});

	it("represents a manual mapping equal to upstream as exact upstream", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			manualProviderId: parseTvdbId(123),
			upstreamProviderIds: [parseTvdbId(123)],
		});

		expect(identity).toMatchObject({
			providerId: parseTvdbId(123),
			providerMappingState: "mapped",
			mappingEntryKind: "upstream",
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
		});
	});

	it("uses exact upstream mappings before stored auto mappings", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			upstreamProviderIds: [parseTvdbId(123)],
			autoMappingRecord: {
				state: "mapped",
				providerId: parseTvdbId(999),
				acceptedEvidence: { source: "auto", reason: "fuzzy-match" },
				updatedAt: 10,
			},
		});

		expect(identity).toMatchObject({
			providerId: parseTvdbId(123),
			providerMappingState: "mapped",
			mappingEntryKind: "upstream",
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
		});
	});

	it("uses stored auto mappings when no manual or upstream mapping exists", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			autoMappingRecord: {
				state: "mapped",
				providerId: parseTvdbId(123),
				acceptedEvidence: { source: "auto", reason: "fuzzy-match" },
				updatedAt: 10,
			},
		});

		expect(identity).toMatchObject({
			providerId: parseTvdbId(123),
			providerMappingState: "mapped",
			mappingEntryKind: "auto",
			mappingSource: "auto",
			mappingReason: "fuzzy-match",
			autoMappingStatus: "mapped",
		});
	});

	it("shows a rejected stored auto mapping as rejected", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			rejectedCandidateProviderId: parseTvdbId(123),
		});

		expect(identity).toMatchObject({
			providerId: null,
			providerMappingState: "unmapped",
			mappingEntryKind: "rejected",
			hadResolveAttempt: true,
		});
	});

	it("keeps unresolved auto state unmapped with an attempted resolution", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			autoMappingRecord: {
				state: "unresolved",
				updatedAt: 10,
			},
		});

		expect(identity).toMatchObject({
			providerId: null,
			providerMappingState: "unmapped",
			mappingEntryKind: "unmapped",
			autoMappingStatus: "unresolved",
			hadResolveAttempt: true,
		});
	});

	it("projects ambiguous upstream as unknown ambiguous", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			upstreamProviderIds: [parseTvdbId(123), parseTvdbId(456)],
		});

		expect(identity).toMatchObject({
			providerId: null,
			providerMappingState: "unknown",
			mappingEntryKind: "unknown",
			mappingUnknownReason: "ambiguous",
			autoMappingStatus: "ambiguous",
		});
	});

	it("projects ambiguous auto state as unknown ambiguous", () => {
		const identity = buildEffectiveMapping({
			...baseInput,
			autoMappingRecord: {
				state: "ambiguous",
				updatedAt: 10,
			},
		});

		expect(identity).toMatchObject({
			providerId: null,
			providerMappingState: "unknown",
			mappingEntryKind: "unknown",
			mappingUnknownReason: "ambiguous",
			autoMappingStatus: "ambiguous",
		});
	});
});
