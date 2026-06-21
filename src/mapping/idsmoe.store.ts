/** Cached ids.moe cross-ID lookups used as a mapping fallback. */
// src/mapping/idsmoe.store.ts

import { storage } from "@wxt-dev/storage";
import type { Provider } from "@/providers/types";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import { bumpMappingsRevision } from "@/shared/sync/revisions";
import { logger } from "@/shared/utils/logger";
import { sourceIdentityKey, type SourceIdentity } from "./source-identity";
import type { UpstreamTarget } from "./types";

const IDSMOE_API_BASE_URL = "https://api.ids.moe/ids";
const IDSMOE_TIMEOUT_MS = 10_000;
const MAX_IDSMOE_BYTES = 32 * 1024;
const IDSMOE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type IdsMoeFetch = typeof fetch;
type IdsMoeFetchResult =
	| { kind: "hit"; target: UpstreamTarget }
	| { kind: "miss" }
	| { kind: "failure"; reason: string };

type CachedIdsMoeRecord = {
	fetchedAt: number;
	target: UpstreamTarget | null;
};

type IdsMoeCache = Record<string, CachedIdsMoeRecord>;

export type IdsMoeResolver = (
	provider: Provider,
	source: SourceIdentity,
) => Promise<UpstreamTarget | null>;

const idsMoeCache = storage.defineItem<IdsMoeCache>("local:mapping:idsmoe", {
	fallback: {},
});
const log = logger.create("ids.moe");

let writes: Promise<void> = Promise.resolve();

export async function getCachedIdsMoeTarget(
	provider: Provider,
	source: SourceIdentity,
): Promise<UpstreamTarget | null> {
	const cached = await getValidCachedRecord(source);
	return cached === undefined ? null : targetForProvider(provider, cached.target);
}

export async function resolveIdsMoeTarget(
	provider: Provider,
	source: SourceIdentity,
	dependencies: { fetchFn?: IdsMoeFetch } = {},
): Promise<UpstreamTarget | null> {
	if (provider !== "radarr") return null;

	const cached = await getValidCachedRecord(source);
	if (cached !== undefined) {
		return targetForProvider(provider, cached.target);
	}

	const result = await fetchIdsMoeTarget(source, dependencies.fetchFn ?? fetch);
	if (result.kind === "failure") {
		log.debug("ids.moe fallback failed; result was not cached.", {
			source: sourceIdentityKey(source),
			reason: result.reason,
		});
		return null;
	}

	const target = result.kind === "hit" ? result.target : null;
	await setCachedIdsMoeTarget(source, target);
	return targetForProvider(provider, target);
}

export async function clearIdsMoeCache(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(() => idsMoeCache.setValue({}));

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

async function getValidCachedRecord(
	source: SourceIdentity,
): Promise<CachedIdsMoeRecord | undefined> {
	const cache = await idsMoeCache.getValue();
	const record = cache[sourceIdentityKey(source)];
	if (!record) return undefined;
	if (Date.now() - record.fetchedAt >= IDSMOE_CACHE_TTL_MS) return undefined;
	return record;
}

async function setCachedIdsMoeTarget(
	source: SourceIdentity,
	target: UpstreamTarget | null,
): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const cache = await idsMoeCache.getValue();
			cache[sourceIdentityKey(source)] = {
				fetchedAt: Date.now(),
				target,
			};
			await idsMoeCache.setValue(cache);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
	await bumpMappingsRevision();
}

async function fetchIdsMoeTarget(
	source: SourceIdentity,
	fetchFn: IdsMoeFetch,
): Promise<IdsMoeFetchResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), IDSMOE_TIMEOUT_MS);

	try {
		const response = await fetchFn(buildIdsMoeUrl(source), {
			signal: controller.signal,
		});
		if (response.status === 404) return { kind: "miss" };
		if (!response.ok) {
			return { kind: "failure", reason: `http-${response.status}` };
		}

		const contentLength = Number(response.headers.get("Content-Length") ?? 0);
		if (contentLength > MAX_IDSMOE_BYTES) {
			return { kind: "failure", reason: "payload-too-large" };
		}

		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_IDSMOE_BYTES) {
			return { kind: "failure", reason: "payload-too-large" };
		}

		let payload: unknown;
		try {
			payload = JSON.parse(text) as unknown;
		} catch {
			return { kind: "failure", reason: "invalid-json" };
		}

		const target = targetFromPayload(payload);
		return target === null ? { kind: "miss" } : { kind: "hit", target };
	} catch {
		return { kind: "failure", reason: "network" };
	} finally {
		clearTimeout(timeout);
	}
}

function buildIdsMoeUrl(source: SourceIdentity): string {
	const url = new URL(`${IDSMOE_API_BASE_URL}/${source.id}`);
	url.searchParams.set("p", source.source);
	return url.toString();
}

function targetFromPayload(payload: unknown): UpstreamTarget | null {
	if (!payload || typeof payload !== "object") return null;

	const tmdbId = parseTmdbIdOrNull(
		(payload as { themoviedb?: unknown }).themoviedb,
	);
	return tmdbId === null ? null : { provider: "radarr", providerId: tmdbId };
}

function targetForProvider(
	provider: Provider,
	target: UpstreamTarget | null,
): UpstreamTarget | null {
	return target?.provider === provider ? target : null;
}
