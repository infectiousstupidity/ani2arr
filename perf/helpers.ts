/** Shared helpers for perf harnesses: realistic storage, dataset loading, timing. */

import { readFileSync, existsSync } from "node:fs";
import { browser } from "wxt/browser";
import { parseAniBridgeData } from "@/mapping/upstream/anibridge.parser";
import type { UpstreamMappingRecord } from "@/mapping/mapping-record";

/**
 * Real `storage.local.get` returns a freshly deserialized copy on every call
 * (Chrome: JSON in LevelDB -> base::Value -> V8; Firefox: structured clone from
 * IndexedDB). fake-browser returns live references, so model the copy here.
 */
const reads = new Map<string, number>();
let realisticStorageInstalled = false;

export function useRealisticStorage(): {
	reads: Map<string, number>;
	reset(): void;
} {
	if (realisticStorageInstalled) return { reads, reset: () => reads.clear() };
	realisticStorageInstalled = true;
	for (const area of ["local", "sync"] as const) {
		const storageArea = browser.storage[area];
		const original = storageArea.get.bind(storageArea);
		storageArea.get = (async (keys?: unknown) => {
			let keyList: unknown[] = ["<all>"];
			if (typeof keys === "string") keyList = [keys];
			else if (Array.isArray(keys)) keyList = keys;
			else if (keys != null) keyList = Object.keys(keys as object);
			for (const key of keyList) {
				const name = `${area}:${String(key)}`;
				reads.set(name, (reads.get(name) ?? 0) + 1);
			}
			return structuredClone(await original(keys as never));
		}) as typeof storageArea.get;
	}
	return { reads, reset: () => reads.clear() };
}

export const ANIBRIDGE_FIXTURE =
	process.env.A2A_ANIBRIDGE_FIXTURE ?? "/tmp/a2a-perf-data/mappings.min.json";

let cachedRecords: Record<string, UpstreamMappingRecord> | null = null;

/** Real AniBridge v3 dataset if present, else a synthetic one of similar shape. */
export function loadUpstreamRecords(): Record<string, UpstreamMappingRecord> {
	if (cachedRecords) return cachedRecords;
	if (existsSync(ANIBRIDGE_FIXTURE)) {
		cachedRecords = parseAniBridgeData(
			JSON.parse(readFileSync(ANIBRIDGE_FIXTURE, "utf8")),
		).records;
		return cachedRecords;
	}
	const records: Record<string, UpstreamMappingRecord> = {};
	for (let id = 1; id <= 40_000; id += 1) {
		records[`anilist:${id}`] = {
			facts: {
				tvdbShow: (100_000 + id) as never,
				tmdbShow: (200_000 + id) as never,
			},
		};
		records[`mal:${id}`] = {
			facts: { tvdbShow: (100_000 + id) as never },
			linkedAniListId: id as never,
		};
	}
	cachedRecords = records;
	return records;
}

export async function seedUpstream(): Promise<number> {
	const records = loadUpstreamRecords();
	await browser.storage.local.set({
		"mapping:upstream": { version: 1, records, fetchedAt: Date.now() },
	});
	return Object.keys(records).length;
}

export async function time<T>(
	label: string,
	fn: () => Promise<T> | T,
	iterations = 5,
): Promise<{ label: string; medianMs: number; result: T }> {
	const samples: number[] = [];
	let result!: T;
	for (let index = 0; index < iterations; index += 1) {
		const start = performance.now();
		result = await fn();
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	const medianMs = samples[Math.floor(samples.length / 2)] ?? 0;
	process.stdout.write(
		`[perf] ${label}: median ${medianMs.toFixed(2)} ms (n=${iterations})\n`,
	);
	return { label, medianMs, result };
}

export function report(label: string, value: number | string, unit = ""): void {
	process.stdout.write(`[perf] ${label}: ${value}${unit ? ` ${unit}` : ""}\n`);
}

/** AniList-style `.media-card` elements built without innerHTML. */
export function buildAniListCards(
	from: number,
	to: number,
	formatFor: (id: number) => string = () => "TV Show",
): HTMLElement[] {
	const cards: HTMLElement[] = [];
	for (let id = from; id <= to; id += 1) {
		const card = document.createElement("div");
		card.className = "media-card";
		const cover = document.createElement("a");
		cover.className = "cover";
		cover.setAttribute("href", `/anime/${id}/Title-${id}`);
		cover.append(document.createElement("img"));
		const title = document.createElement("a");
		title.className = "title";
		title.setAttribute("href", `/anime/${id}`);
		title.textContent = `Some Anime Title ${id}`;
		const hover = document.createElement("div");
		hover.className = "hover-data";
		const info = document.createElement("div");
		info.className = "info";
		const format = document.createElement("span");
		format.textContent = formatFor(id);
		info.append(format);
		const airing = document.createElement("div");
		airing.className = "airing";
		airing.textContent = "Ep 3 airing in 2 days";
		hover.append(info, airing);
		card.append(cover, title, hover);
		cards.push(card);
	}
	return cards;
}

/** IntersectionObserver that reports every observed element as fully visible. */
export function stubVisibleIntersectionObserver(): void {
	class VisibleObserver {
		constructor(private readonly callback: IntersectionObserverCallback) {}
		observe(target: Element): void {
			queueMicrotask(() =>
				// SAFETY: the overlay hook reads only target, isIntersecting and intersectionRatio.
				this.callback(
					[
						{
							target,
							isIntersecting: true,
							intersectionRatio: 1,
						} as IntersectionObserverEntry,
					],
					this as unknown as IntersectionObserver,
				),
			);
		}
		unobserve(): void {}
		disconnect(): void {}
		takeRecords(): IntersectionObserverEntry[] {
			return [];
		}
	}
	// SAFETY: implements every IntersectionObserver method the app calls.
	globalThis.IntersectionObserver =
		VisibleObserver as unknown as typeof IntersectionObserver;
}
