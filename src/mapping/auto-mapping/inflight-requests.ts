/** In-flight auto-mapping resolver request sharing. */
// src/mapping/auto-mapping/inflight-requests.ts

import type { AniListId } from "@/anilist";
import type { Provider } from "@/providers";
import type {
	AcceptedAutoMappingResult,
	AutoMappingOptions,
} from "./types";

export class AutoMappingInflightRequests {
	private readonly inflight = new Map<
		string,
		Promise<AcceptedAutoMappingResult | null>
	>();

	public get(
		provider: Provider,
		anilistId: AniListId,
		options: AutoMappingOptions,
	): Promise<AcceptedAutoMappingResult | null> | null {
		if (!canShareInflight(options)) {
			return null;
		}
		return this.inflight.get(createInflightKey(provider, anilistId)) ?? null;
	}

	public set(
		provider: Provider,
		anilistId: AniListId,
		options: AutoMappingOptions,
		promise: Promise<AcceptedAutoMappingResult | null>,
	): void {
		if (!canShareInflight(options)) {
			return;
		}

		const key = createInflightKey(provider, anilistId);
		this.inflight.set(key, promise);

		promise
			.finally(() => {
				if (this.inflight.get(key) === promise) {
					this.inflight.delete(key);
				}
			})
			.catch(() => {});
	}

	public delete(provider: Provider, anilistId: AniListId): void {
		this.inflight.delete(createInflightKey(provider, anilistId));
	}

	public deleteProvider(provider: Provider): void {
		for (const key of this.inflight.keys()) {
			if (key.startsWith(`${provider}:`)) {
				this.inflight.delete(key);
			}
		}
	}

	public clear(): void {
		this.inflight.clear();
	}
}

function canShareInflight(options: AutoMappingOptions): boolean {
	return (
		options.hints === undefined &&
		options.network === undefined &&
		options.forceLookupNetwork !== true &&
		options.priority === undefined
	);
}

function createInflightKey(provider: Provider, anilistId: AniListId): string {
	return `${provider}:${anilistId}`;
}
