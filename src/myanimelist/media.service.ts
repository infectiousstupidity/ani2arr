/** Cached and rate-limited Jikan metadata loading for MAL anime. */

import PQueue from "p-queue";
import { fetchMyAnimeListMetadata } from "@/myanimelist/client";
import {
	isMyAnimeListId,
	type MyAnimeListId,
	type MyAnimeListMetadata,
} from "@/myanimelist/types";
import { createTtlCache, type TtlCache } from "@/shared/cache/ttl-cache";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";

const JIKAN_REQUEST_INTERVAL_MS = 1000;
const MYANIMELIST_METADATA_CACHE_TTL = {
	staleMs: 24 * 60 * 60 * 1000,
	hardMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const myAnimeListMetadataCache = createTtlCache<MyAnimeListMetadata>(
	"myanimelist:metadata",
);

export class MyAnimeListMediaService {
	private readonly queue = new PQueue({
		concurrency: 1,
		interval: JIKAN_REQUEST_INTERVAL_MS,
		intervalCap: 1,
		strict: true,
	});
	private readonly inflight = new Map<
		MyAnimeListId,
		Promise<MyAnimeListMetadata>
	>();

	constructor(
		private readonly cache: TtlCache<MyAnimeListMetadata> =
			myAnimeListMetadataCache,
	) {}

	public async getMetadata(
		malId: MyAnimeListId,
	): Promise<MyAnimeListMetadata> {
		if (!isMyAnimeListId(malId)) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				`Invalid MyAnimeList ID ${String(malId)}`,
				"MyAnimeList metadata request failed.",
			);
		}

		const cached = await this.cache.read(String(malId));
		if (cached && !cached.stale) return cached.value;

		const inflight = this.inflight.get(malId);
		if (inflight) return inflight;

		const request = this.queue
			.add(async () => {
				try {
					const metadata = await fetchMyAnimeListMetadata(malId);
					await this.cache.write(
						String(malId),
						metadata,
						MYANIMELIST_METADATA_CACHE_TTL,
					);
					return metadata;
				} catch (error) {
					if (cached) return cached.value;
					throw error;
				}
			})
			.then((metadata) => {
				if (!metadata) {
					throw new Error(`Jikan response missing anime for MAL ID ${malId}`);
				}
				return metadata;
			})
			.finally(() => {
				if (this.inflight.get(malId) === request) {
					this.inflight.delete(malId);
				}
			});

		this.inflight.set(malId, request);
		return request;
	}
}
