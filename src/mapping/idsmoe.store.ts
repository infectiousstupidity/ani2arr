/** Cached ids.moe cross-ID lookups used as a mapping fallback. */
// src/mapping/idsmoe.store.ts

import { storage } from "@wxt-dev/storage";
import type { Provider } from "@/providers/types";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import { bumpMappingsRevision } from "@/shared/sync/revisions";
import {
	sourceIdentityKey,
	type SourceIdentity,
	type UpstreamTarget,
} from "./types";

const IDSMOE_API_BASE_URL = "https://api.ids.moe/ids";
const IDSMOE_TIMEOUT_MS = 10_000;
const MAX_IDSMOE_BYTES = 32 * 1024;
const IDSMOE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type IdsMoeFetch = typeof fetch;

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

	const target = await fetchIdsMoeTarget(source, dependencies.fetchFn ?? fetch);
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
): Promise<UpstreamTarget | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), IDSMOE_TIMEOUT_MS);

	try {
		const response = await fetchFn(buildIdsMoeUrl(source), {
			signal: controller.signal,
		});
		if (response.status === 404) return null;
		if (!response.ok) return null;

		const contentLength = Number(response.headers.get("Content-Length") ?? 0);
		if (contentLength > MAX_IDSMOE_BYTES) return null;

		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_IDSMOE_BYTES) return null;

		let payload: unknown;
		try {
			payload = JSON.parse(text) as unknown;
		} catch {
			return null;
		}

		return targetFromPayload(payload);
	} catch {
		return null;
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
