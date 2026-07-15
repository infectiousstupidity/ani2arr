/** AniBridge mapping download client with timeout, size, and JSON validation. */
// src/mapping/upstream/anibridge.client.ts

import {
	parseAniBridgeData,
	type ParsedAniBridgeData,
} from "@/mapping/upstream/anibridge.parser";

const ANIBRIDGE_URL =
	"https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";
const ANIBRIDGE_TIMEOUT_MS = 15_000;
export const MAX_ANIBRIDGE_BYTES = 10 * 1024 * 1024;

export type AniBridgeDownloadResult =
	| { status: "not-modified" }
	| {
			status: "modified";
			parsed: ParsedAniBridgeData;
			etag?: string;
	  };

export async function downloadAniBridgeMappings(
	input: {
		etag?: string | undefined;
	} = {},
): Promise<AniBridgeDownloadResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ANIBRIDGE_TIMEOUT_MS);

	try {
		const response = await fetch(ANIBRIDGE_URL, {
			signal: controller.signal,
			headers: input.etag
				? {
						"If-None-Match": input.etag,
					}
				: {},
		});

		if (response.status === 304) {
			return { status: "not-modified" };
		}

		if (!response.ok) {
			throw new Error(
				`Unable to download AniBridge mappings (${response.status}).`,
			);
		}

		const contentLength = Number(response.headers.get("Content-Length") ?? 0);
		if (contentLength > MAX_ANIBRIDGE_BYTES) {
			throw new Error("AniBridge mappings payload is too large.");
		}

		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_ANIBRIDGE_BYTES) {
			throw new Error("AniBridge mappings payload is too large.");
		}

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(text) as unknown;
		} catch {
			throw new Error("AniBridge mappings payload is not valid JSON.");
		}

		const parsed = parseAniBridgeData(parsedJson);
		if (Object.keys(parsed.entries).length === 0) {
			throw new Error(
				"AniBridge mappings payload did not contain valid mappings.",
			);
		}

		const etag = response.headers.get("ETag");
		return {
			status: "modified",
			parsed,
			...(etag ? { etag } : {}),
		};
	} finally {
		clearTimeout(timeout);
	}
}
