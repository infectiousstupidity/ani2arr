# Mapping architecture

Upstream provider facts are keyed by `SourceIdentity`. Stored mapping decisions
are keyed by canonical AniList ID when one is available.

Mapping owns facts and effective AniList-to-provider mapping results. It does
not own provider library state or RPC presentation DTOs.

## Stored facts

- `manual.store.ts` stores user mappings, ignores, and rejected automatic
  candidates by AniList ID. Rejected IDs are facts attached to the manual
  record.
- `upstream.store.ts` stores source-native AniBridge targets plus source
  crosswalks and refresh metadata. It does not persist Sonarr, Radarr, or Seerr
  projections.
- `auto.store.ts` stores expiring automatic results by AniList ID. Expired
  reads return no result and do not mutate storage.
- `seerr-target.store.ts` stores user-owned manual Seerr overrides separately
  from downloaded AniBridge data.

AniBridge targets preserve source identity, target kind, external ID, and
optional season scope:

```ts
type AniBridgeTarget =
	| { kind: "tmdb-movie"; id: TmdbId }
	| { kind: "tmdb-show"; id: TmdbId; season?: number }
	| { kind: "tvdb-show"; id: TvdbId; season?: number };
```

## Effective Arr mappings

`MappingResult` is the single effective Sonarr/Radarr result. Precedence is:

```text
manual ignore or mapping
single provider identity from AniBridge
multiple provider identities from AniBridge -> ambiguous
automatic result when no upstream target exists
unmapped
```

Manual mappings may match and therefore be reported as upstream, but user intent
still wins. Automatic results never resolve upstream ambiguity. A single Sonarr
season scope is preserved; multiple scopes for one TVDB ID resolve as the
unscoped series identity.

AniBridge projections are derived on read:

```text
tmdb-movie -> Radarr
tvdb-show -> Sonarr
tmdb-show -> no direct Arr target
```

## Effective Seerr targets

Seerr targets are derived from AniList-source AniBridge external IDs. TV targets
require one unambiguous TMDB show ID and at least one valid season. A manual
Seerr target overrides the derived target for the same AniList ID.

## Library boundary

Mapping-list collection reads canonical AniList records and returns one flat
effective record list per provider. The RPC presentation boundary separately
attaches MAL crosswalk aliases to those records:

```ts
type EffectiveMappingRecord = {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
};
```

Provider library snapshots remain provider-owned. The mapping RPC handler builds
small TVDB/TMDB lookup maps and directly composes final `MappingListGroup[]`
responses with route metadata and library presence. There is no intermediate
mapping-list or provider library-status model.

Library state must not enter stored mapping facts or `MappingResult`.
