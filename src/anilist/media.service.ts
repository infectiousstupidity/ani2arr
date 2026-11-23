/** AniList full-media fetch service with cache, priority queue, and prequel traversal. */
// src/anilist/media.service.ts

import PQueue from "p-queue";
import pRetry, { AbortError } from "p-retry";
import { fetchAniListMedia } from "@/anilist/client";
import {
	AniListError,
	isAniListId,
	type AniListId,
	type AniListMedia,
} from "@/anilist/types";
import { createTtlCache, type TtlCache } from "@/shared/cache/ttl-cache";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";

const QUEUE_CONCURRENCY = 1;
const DEFAULT_PREQUEL_DEPTH = 5;
const REQUEST_PRIORITY = {
	high: 10,
	normal: 0,
	low: -10,
} as const;
type RequestPriority = keyof typeof REQUEST_PRIORITY;
const RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 5000;
const ANILIST_MEDIA_CACHE_TTL = {
	staleMs: 14 * 24 * 60 * 60 * 1000,
	hardMs: 60 * 24 * 60 * 60 * 1000,
} as const;
const ANILIST_MEDIA_CACHE_NAMESPACE = "anilist:media";

export const anilistMediaCache = createTtlCache<AniListMedia>(
	ANILIST_MEDIA_CACHE_NAMESPACE,
);

export class AniListMediaService {
	private readonly queue = new PQueue({ concurrency: QUEUE_CONCURRENCY });
	private readonly inflight = new Map<AniListId, Promise<AniListMedia>>();

	constructor(private readonly caches?: { media: TtlCache<AniListMedia> }) {}

	public async fetchMediaWithRelations(
		anilistId: AniListId,
		options?: { priority?: RequestPriority },
	): Promise<AniListMedia> {
		if (!isAniListId(anilistId)) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				`Invalid AniList ID ${String(anilistId)}`,
				"AniList request failed.",
			);
		}

		const cached = await this.readCachedMedia(anilistId);
		if (cached) return cached;

		const inflight = this.inflight.get(anilistId);
		if (inflight) return inflight;

		const request = this.queue
			.add(() => this.fetchAndCache(anilistId), {
				priority: REQUEST_PRIORITY[options?.priority ?? "normal"],
			})
			.then((media) => {
				if (!media) throw this.createMissingMediaError(anilistId);
				return media;
			})
			.finally(() => {
				if (this.inflight.get(anilistId) === request) {
					this.inflight.delete(anilistId);
				}
			});
		this.inflight.set(anilistId, request);
		return request;
	}

	public async *iteratePrequelChain(
		seed: AniListMedia,
		options: { includeRoot?: boolean; maxDepth?: number } = {},
	): AsyncGenerator<AniListMedia> {
		const includeRoot = options.includeRoot ?? false;
		const maxDepth = options.maxDepth ?? DEFAULT_PREQUEL_DEPTH;
		const visited = new Set<AniListId>();
		let depth = 0;
		let current: AniListMedia | null = seed;

		if (includeRoot) {
			visited.add(current.id);
			yield current;
		} else {
			visited.add(current.id);
		}

		while (maxDepth < 0 || depth < maxDepth) {
			const nextId = this.extractPrequelId(current);
			if (nextId === null || visited.has(nextId)) break;

			const nextMedia = await this.fetchMediaWithRelations(nextId);
			visited.add(nextId);
			yield nextMedia;
			current = nextMedia;
			depth += 1;
		}
	}

	private extractPrequelId(media: AniListMedia): AniListId | null {
		const prequelEdge = media.relations?.edges.find(
			(edge) => edge.relationType === "PREQUEL",
		);
		return prequelEdge?.node.id ?? null;
	}

	private async readCachedMedia(id: AniListId): Promise<AniListMedia | null> {
		const hit = await this.caches?.media.read(String(id));
		return hit?.value ?? null;
	}

	private async writeCachedMedia(
		id: AniListId,
		media: AniListMedia,
	): Promise<void> {
		try {
			await this.caches?.media.write(String(id), media, ANILIST_MEDIA_CACHE_TTL);
		} catch (error) {
			const name = (error as { name?: string } | null | undefined)?.name ?? "";
			if (name !== "DataCloneError") throw error;
		}
	}

	private async fetchAndCache(id: AniListId): Promise<AniListMedia> {
		const media = await this.fetchWithRetry(id);
		await this.writeCachedMedia(id, media);
		return media;
	}

	private fetchWithRetry(id: AniListId): Promise<AniListMedia> {
		return pRetry(
			async () => {
				try {
					return await fetchAniListMedia(id);
				} catch (error) {
					if (this.shouldAbortRetry(error)) {
						throw new AbortError(error);
					}
					throw error;
				}
			},
			{
				retries: RETRY_COUNT,
				minTimeout: 0,
				maxTimeout: 0,
				onFailedAttempt: ({ error, attemptNumber, retriesLeft }) =>
					retriesLeft > 0
						? this.waitBeforeRetry(error, attemptNumber)
						: undefined,
			},
		).catch((error) => this.handleRequestError(error));
	}

	private async waitBeforeRetry(
		error: unknown,
		attemptNumber: number,
	): Promise<void> {
		const retryAfterMs = this.extractRetryAfterMs(error);
		const fallbackDelayMs = Math.min(
			RETRY_BASE_DELAY_MS * 2 ** (attemptNumber - 1),
			RETRY_MAX_DELAY_MS,
		);
		const waitMs =
			typeof retryAfterMs === "number" &&
			Number.isFinite(retryAfterMs) &&
			retryAfterMs > 0
				? retryAfterMs
				: fallbackDelayMs;

		await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
	}

	private extractRetryAfterMs(error: unknown): number | undefined {
		return error instanceof AniListError &&
			typeof error.retryAfterMs === "number"
			? Math.max(0, error.retryAfterMs)
			: undefined;
	}

	private shouldAbortRetry(error: unknown): error is AniListError {
		if (!(error instanceof AniListError)) return false;
		return error.status !== undefined && error.status !== 429 && error.status < 500;
	}

	private createMissingMediaError(id: AniListId) {
		return createError(
			ErrorCode.API_ERROR,
			`AniList response missing media for ${id}`,
			"AniList returned an unexpected response.",
		);
	}

	private handleRequestError(error: unknown): never {
		if (error instanceof AniListError) {
			throw createError(
				ErrorCode.API_ERROR,
				error.message,
				error.status && error.status >= 500
					? "AniList service is temporarily unavailable."
					: "AniList request failed.",
				this.getErrorDetails(error),
			);
		}

		if (error instanceof Error) {
			throw createError(
				ErrorCode.API_ERROR,
				error.message,
				"AniList request failed.",
			);
		}

		throw createError(
			ErrorCode.API_ERROR,
			"Unexpected error type in AniListMediaService.handleRequestError",
			"AniList request failed.",
			{ originalError: error },
		);
	}

	private getErrorDetails(error: AniListError): Record<string, unknown> {
		const details: Record<string, unknown> = {};
		if (error.status !== undefined) details.status = error.status;
		if (error.retryAfterMs !== undefined) {
			details.retryAfterMs = error.retryAfterMs;
		}
		return details;
	}
}
