/** AniList full-media fetch service with cache, priority queue, and prequel traversal. */
// src/anilist/media.service.ts

import PQueue from "p-queue";
import { fetchAniListMedia } from "@/anilist/client";
import { AniListError, isAniListId, type AniListId, type AniListMedia } from "@/anilist/types";
import { createTtlCache, type TtlCache } from "@/shared/cache/ttl-cache";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import type { RequestPriority } from "@/shared/utils/request-priority";
import { priorityValue } from "@/shared/utils/request-priority";
import { AbortError, withRetry } from "@/shared/utils/retry";

const QUEUE_CONCURRENCY = 1;
const DEFAULT_PREQUEL_DEPTH = 5;
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
				priority: priorityValue(options?.priority ?? "normal"),
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
		return withRetry(() => fetchAniListMedia(id), {
			retries: 3,
			minTimeout: 0,
			maxTimeout: 0,
			extractRetryAfterMs: (error) => this.extractRetryAfterMs(error),
			shouldAbort: (error) => this.shouldAbortRetry(error),
		}).catch((error) => this.handleRequestError(error));
	}

	private extractRetryAfterMs(error: unknown): number | undefined {
		const normalized = this.unwrapAbortError(error);
		return normalized instanceof AniListError &&
			typeof normalized.retryAfterMs === "number"
			? Math.max(0, normalized.retryAfterMs)
			: undefined;
	}

	private shouldAbortRetry(error: unknown): boolean {
		const normalized = this.unwrapAbortError(error);
		if (!(normalized instanceof AniListError)) return false;
		return normalized.status !== undefined && normalized.status !== 429 && normalized.status < 500;
	}

	private unwrapAbortError(error: unknown): unknown {
		return error instanceof AbortError ? error.originalError : error;
	}

	private createMissingMediaError(id: AniListId) {
		return createError(
			ErrorCode.API_ERROR,
			`AniList response missing media for ${id}`,
			"AniList returned an unexpected response.",
		);
	}

	private handleRequestError(error: unknown): never {
		const normalized = this.unwrapAbortError(error);
		if (normalized instanceof AniListError) {
			throw createError(
				ErrorCode.API_ERROR,
				normalized.message,
				normalized.status && normalized.status >= 500
					? "AniList service is temporarily unavailable."
					: "AniList request failed.",
				this.getErrorDetails(normalized),
			);
		}

		if (normalized instanceof Error) {
			throw createError(
				ErrorCode.API_ERROR,
				normalized.message,
				"AniList request failed.",
			);
		}

		throw createError(
			ErrorCode.API_ERROR,
			"Unexpected error type in AniListMediaService.handleRequestError",
			"AniList request failed.",
			{ originalError: normalized },
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
