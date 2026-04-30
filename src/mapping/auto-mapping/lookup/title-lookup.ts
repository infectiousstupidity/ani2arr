/** Direct title lookup helper for fast auto-mapping probes. */
// src/mapping/auto-mapping/lookup/title-lookup.ts

import { scoreTitleMatches } from "@/mapping/auto-mapping/title/title-matching";
import { makeTitleSearchTerm } from "@/mapping/auto-mapping/title/title-search";
import type { AcceptedAutoMappingResult } from "../types";
import type { ScopedLogger } from "@/shared/utils/logger";
import type { ProviderCredentials } from "@/providers";
import { SCORE_THRESHOLD } from "../constants";
import type {
	ProviderTitleLookup,
	ProviderTitleResult,
} from "./provider-title-lookup";

export interface TitleLookupProbeOptions {
	credentials: ProviderCredentials;
	log: ScopedLogger;
	forceLookupNetwork?: boolean;
}

export async function tryTitleLookup<TResult extends ProviderTitleResult>(
	rawTitle: string,
	lookupClient: ProviderTitleLookup<TResult>,
	options: TitleLookupProbeOptions,
): Promise<AcceptedAutoMappingResult | null> {
	const { credentials, log, forceLookupNetwork } = options;
	const provider = lookupClient.provider;
	const term = makeTitleSearchTerm(provider, rawTitle);
	if (!term) {
		log.debug?.(`mapping:title-lookup-skip raw="${rawTitle}"`);
		return null;
	}

	const results = await lookupClient.lookupTitle(term, credentials, {
		...(forceLookupNetwork ? { forceNetwork: true } : {}),
	});
	const scored = scoreTitleMatches(provider, term, results);
	const top = scored[0];
	if (top && top.score >= SCORE_THRESHOLD) {
		const providerId = lookupClient.readProviderId(top.result);
		if (providerId === null) {
			return null;
		}
		log.debug?.(
			`mapping:title-lookup-hit canonical="${term.canonical}" providerId=${providerId} score=${top.score} synonym="${term.display}"`,
		);
		return {
			providerId,
			reason: "borrowed-base-title-fallback",
			successfulSynonym: term.display,
		};
	}
	log.debug?.(
		`mapping:title-lookup-miss canonical="${term.canonical}" raw="${term.display}" results=${results.length} topScore=${top?.score ?? "n/a"}`,
	);
	return null;
}
