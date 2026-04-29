/** Anibridge mapping store for normalized AniList-to-provider mappings. */
// src/mapping/upstream/anibridge-mapping.store.ts

import type { TtlCache } from "@/shared/cache/ttl-cache";
import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import {
	ANIBRIDGE_MAPPING_CACHE_TTL,
	anibridgeMappingCache,
} from "@/mapping/upstream/anibridge-mapping.cache";
import {
	createError,
	ErrorCode,
	logError,
	normalizeError,
} from "@/shared/errors";
import { logger, type ScopedLogger } from "@/shared/utils/logger";

const ANIBRIDGE_MAPPINGS_URL =
	"https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";

const CACHE_KEY = "upstream";
const DEFAULT_FETCH: typeof fetch = (...args) => fetch(...args);

export type AnibridgeProviderMappingPayload = {
	sonarr: Record<number, number[]>;
	radarr: Record<number, number[]>;
};

export type AnibridgeProviderPair =
	| { provider: "sonarr"; anilistId: AniListId; providerId: TvdbId }
	| { provider: "radarr"; anilistId: AniListId; providerId: TmdbId };

type MappingDescriptor = {
	provider: string;
	id: number;
	scope?: string;
};

const emptyPayload = (): AnibridgeProviderMappingPayload => ({
	sonarr: {},
	radarr: {},
});

const parsePositiveIntegerString = (value: string): number | null => {
	if (!/^\d+$/.test(value)) {
		return null;
	}

	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseDescriptor = (value: string): MappingDescriptor | null => {
	const parts = value.split(":");
	if (parts.length !== 2 && parts.length !== 3) {
		return null;
	}

	const [provider, rawId, scope] = parts;
	if (!provider || !rawId || scope === "") {
		return null;
	}

	const id = parsePositiveIntegerString(rawId);
	if (id === null) {
		return null;
	}

	return scope === undefined ? { provider, id } : { provider, id, scope };
};

const addProviderPayloadPair = (
	payload: AnibridgeProviderMappingPayload,
	provider: "sonarr" | "radarr",
	anilistId: AniListId,
	providerId: TvdbId | TmdbId,
): void => {
	const providerMappings = payload[provider];
	providerMappings[anilistId] = [
		...new Set([...(providerMappings[anilistId] ?? []), providerId]),
	];
};

export const buildProviderMappingsFromAnibridgePayload = (
	payload: unknown,
): AnibridgeProviderMappingPayload => {
	const normalized = emptyPayload();
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return normalized;
	}

	for (const [sourceKey, rawTargets] of Object.entries(
		payload as Record<string, unknown>,
	)) {
		if (sourceKey.startsWith("$")) {
			continue;
		}

		const source = parseDescriptor(sourceKey);
		if (source?.provider !== "anilist") {
			continue;
		}

		const anilistId = parseAniListIdOrNull(source.id);
		if (
			anilistId === null ||
			!rawTargets ||
			typeof rawTargets !== "object" ||
			Array.isArray(rawTargets)
		) {
			continue;
		}

		for (const targetKey of Object.keys(rawTargets)) {
			const target = parseDescriptor(targetKey);
			if (target?.provider === "tvdb_show") {
				const tvdbId = parseTvdbIdOrNull(target.id);
				if (tvdbId !== null) {
					addProviderPayloadPair(normalized, "sonarr", anilistId, tvdbId);
				}
				continue;
			}

			if (target?.provider === "tmdb_movie") {
				const tmdbId = parseTmdbIdOrNull(target.id);
				if (tmdbId !== null) {
					addProviderPayloadPair(normalized, "radarr", anilistId, tmdbId);
				}
			}
		}
	}

	return normalized;
};

const coerceAniListId = (value: unknown): AniListId | null => {
	if (typeof value === "number") {
		return parseAniListIdOrNull(value);
	}

	if (typeof value !== "string") {
		return null;
	}

	const parsed = parsePositiveIntegerString(value);
	return parsed === null ? null : parseAniListIdOrNull(parsed);
};

const coerceTvdbId = (value: unknown): TvdbId | null => {
	if (typeof value === "number") {
		return parseTvdbIdOrNull(value);
	}

	if (typeof value !== "string") {
		return null;
	}

	const parsed = parsePositiveIntegerString(value);
	return parsed === null ? null : parseTvdbIdOrNull(parsed);
};

const coerceTmdbId = (value: unknown): TmdbId | null => {
	if (typeof value === "number") {
		return parseTmdbIdOrNull(value);
	}

	if (typeof value !== "string") {
		return null;
	}

	const parsed = parsePositiveIntegerString(value);
	return parsed === null ? null : parseTmdbIdOrNull(parsed);
};

export class AnibridgeMappingStore {
	private readonly log: ScopedLogger;
	private readonly fetchImpl: typeof fetch;
	private readonly sonarrPairs = new Map<AniListId, Set<TvdbId>>();
	private readonly radarrPairs = new Map<AniListId, Set<TmdbId>>();
	private readonly sonarrReverse = new Map<TvdbId, Set<AniListId>>();
	private readonly radarrReverse = new Map<TmdbId, Set<AniListId>>();

	constructor(
		private readonly cache: TtlCache<AnibridgeProviderMappingPayload> = anibridgeMappingCache,
		options: { fetch?: typeof fetch; scope?: string } = {},
	) {
		this.log = logger.create(options.scope ?? "AnibridgeMappingStore");
		const rawFetch: typeof fetch | undefined =
			options.fetch ??
			(typeof globalThis.fetch === "function" ? globalThis.fetch : undefined);
		this.fetchImpl = rawFetch ? rawFetch.bind(globalThis) : DEFAULT_FETCH;
	}

	public async init(): Promise<void> {
		await this.ensureLoaded();

		if (this.sonarrPairs.size === 0 && this.radarrPairs.size === 0) {
			await this.refresh().catch((error) => {
				logError(normalizeError(error), "AnibridgeMappingStore:init:refresh");
			});
			return;
		}

		void this.refresh().catch((error) => {
			logError(normalizeError(error), "AnibridgeMappingStore:init");
		});
	}

	public getSonarrCandidates(anilistId: AniListId): TvdbId[] {
		return [...(this.sonarrPairs.get(anilistId) ?? [])];
	}

	public getRadarrCandidates(anilistId: AniListId): TmdbId[] {
		return [...(this.radarrPairs.get(anilistId) ?? [])];
	}

	public getUniqueSonarrCandidate(anilistId: AniListId): TvdbId | null {
		const candidates = this.getSonarrCandidates(anilistId);
		return candidates.length === 1 ? candidates[0]! : null;
	}

	public getUniqueRadarrCandidate(anilistId: AniListId): TmdbId | null {
		const candidates = this.getRadarrCandidates(anilistId);
		return candidates.length === 1 ? candidates[0]! : null;
	}

	public getAniListIdsForTvdb(tvdbId: TvdbId): AniListId[] {
		return [...(this.sonarrReverse.get(tvdbId) ?? [])];
	}

	public getAniListIdsForTmdb(tmdbId: TmdbId): AniListId[] {
		return [...(this.radarrReverse.get(tmdbId) ?? [])];
	}

	public listAllProviderPairs(): AnibridgeProviderPair[] {
		const entries: AnibridgeProviderPair[] = [];

		for (const [anilistId, providerIds] of this.sonarrPairs.entries()) {
			for (const providerId of providerIds) {
				entries.push({ provider: "sonarr", anilistId, providerId });
			}
		}

		for (const [anilistId, providerIds] of this.radarrPairs.entries()) {
			for (const providerId of providerIds) {
				entries.push({ provider: "radarr", anilistId, providerId });
			}
		}

		return entries;
	}

	public async refreshAll(): Promise<void> {
		await this.refresh();
	}

	public async refresh(): Promise<void> {
		try {
			const cached = await this.cache.read(CACHE_KEY);
			const headers: Record<string, string> = {};
			const etag = cached?.meta?.etag as string | undefined;
			if (etag) {
				headers["If-None-Match"] = etag;
			}

			this.log.debug(
				`refresh: fetching ${ANIBRIDGE_MAPPINGS_URL} (etag=${String(etag)})`,
			);
			const response = await this.fetchImpl(ANIBRIDGE_MAPPINGS_URL, {
				headers,
			});

			if (response.status === 304 && cached) {
				this.log.debug("refresh: not modified");
				if (this.sonarrPairs.size === 0 && this.radarrPairs.size === 0) {
					this.hydrate(cached.value);
				}
				return;
			}

			if (!response.ok) {
				const message = `Failed to fetch Anibridge mappings (${response.status})`;
				this.log.warn(`refresh: ${message}`);
				throw createError(
					ErrorCode.NETWORK_ERROR,
					message,
					"Unable to refresh Anibridge mappings.",
				);
			}

			const payload = (await response.json()) as unknown;
			const normalized = buildProviderMappingsFromAnibridgePayload(payload);
			this.hydrate(normalized);

			const nextEtag = response.headers.get("ETag");
			await this.cache.write(CACHE_KEY, normalized, {
				staleMs: ANIBRIDGE_MAPPING_CACHE_TTL.staleMs,
				hardMs: ANIBRIDGE_MAPPING_CACHE_TTL.hardMs,
				...(nextEtag ? { meta: { etag: nextEtag } } : {}),
			});
			this.log.info(
				`refresh: stored sonarr=${this.sonarrPairs.size} radarr=${this.radarrPairs.size} entries (etag=${String(nextEtag)})`,
			);
		} catch (error) {
			const normalized = normalizeError(error);
			this.log.error("refresh: error", normalized);
			throw normalized;
		}
	}

	public async clear(): Promise<void> {
		this.sonarrPairs.clear();
		this.radarrPairs.clear();
		this.sonarrReverse.clear();
		this.radarrReverse.clear();
		await this.cache.remove(CACHE_KEY);
	}

	private async ensureLoaded(): Promise<void> {
		if (this.sonarrPairs.size > 0 || this.radarrPairs.size > 0) return;

		const cached = await this.cache.read(CACHE_KEY);
		if (cached) {
			this.hydrate(cached.value);
		}
	}

	private hydrate(payload: AnibridgeProviderMappingPayload): void {
		this.sonarrPairs.clear();
		this.radarrPairs.clear();
		this.sonarrReverse.clear();
		this.radarrReverse.clear();

		this.hydrateProviderMap(
			payload.sonarr,
			this.sonarrPairs,
			this.sonarrReverse,
			coerceTvdbId,
		);
		this.hydrateProviderMap(
			payload.radarr,
			this.radarrPairs,
			this.radarrReverse,
			coerceTmdbId,
		);

		this.log.debug(
			`hydrate: populated sonarr=${this.sonarrPairs.size} radarr=${this.radarrPairs.size} entries`,
		);
	}

	private hydrateProviderMap<TProviderId extends TvdbId | TmdbId>(
		providerPayload: unknown,
		providerForward: Map<AniListId, Set<TProviderId>>,
		providerReverse: Map<TProviderId, Set<AniListId>>,
		parseProviderId: (value: unknown) => TProviderId | null,
	): void {
		if (
			!providerPayload ||
			typeof providerPayload !== "object" ||
			Array.isArray(providerPayload)
		) {
			return;
		}

		for (const [rawAniListId, rawProviderIds] of Object.entries(
			providerPayload,
		)) {
			const anilistId = coerceAniListId(rawAniListId);
			if (anilistId === null || !Array.isArray(rawProviderIds)) {
				continue;
			}

			for (const rawProviderId of rawProviderIds) {
				const providerId = parseProviderId(rawProviderId);
				if (providerId === null) {
					continue;
				}

				this.addPair(providerForward, providerReverse, anilistId, providerId);
			}
		}
	}

	private addPair<TProviderId extends TvdbId | TmdbId>(
		providerForward: Map<AniListId, Set<TProviderId>>,
		providerReverse: Map<TProviderId, Set<AniListId>>,
		anilistId: AniListId,
		providerId: TProviderId,
	): void {
		const existing = providerForward.get(anilistId);
		if (existing) {
			existing.add(providerId);
		} else {
			providerForward.set(anilistId, new Set([providerId]));
		}

		const reverseExisting = providerReverse.get(providerId);
		if (reverseExisting) {
			reverseExisting.add(anilistId);
		} else {
			providerReverse.set(providerId, new Set([anilistId]));
		}
	}
}
