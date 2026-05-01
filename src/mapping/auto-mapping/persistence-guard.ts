/** Guards stale auto-mapping resolver results from writing after reset/evict. */
// src/mapping/auto-mapping/persistence-guard.ts

import type { AniListId } from "@/anilist";
import type { Provider } from "@/providers";

export class AutoMappingPersistenceGuard {
	private readonly providerVersions: Record<Provider, number> = {
		sonarr: 0,
		radarr: 0,
	};
	private readonly entryVersions = new Map<string, number>();

	public invalidateProvider(provider: Provider): void {
		this.providerVersions[provider] += 1;
	}

	public invalidateEntry(provider: Provider, anilistId: AniListId): void {
		const key = createEntryKey(provider, anilistId);
		this.entryVersions.set(key, (this.entryVersions.get(key) ?? 0) + 1);
	}

	public createCheck(provider: Provider, anilistId: AniListId): () => boolean {
		const entryKey = createEntryKey(provider, anilistId);
		const providerVersionAtStart = this.providerVersions[provider];
		const entryVersionAtStart = this.entryVersions.get(entryKey) ?? 0;

		return () =>
			providerVersionAtStart === this.providerVersions[provider] &&
			entryVersionAtStart === (this.entryVersions.get(entryKey) ?? 0);
	}
}

function createEntryKey(provider: Provider, anilistId: AniListId): string {
	return `${provider}:${anilistId}`;
}
