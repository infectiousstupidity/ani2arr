# Mapping architecture

Upstream facts keep the page's `SourceIdentity`. Durable manual and automatic
results use the linked AniList identity when one exists, or the page identity
when it does not. Released numeric AniList keys remain readable and are
rewritten as `anilist:<id>` by a later mutation.

Mapping owns facts and effective AniList-to-provider mapping results. It does
not own provider library state or RPC presentation DTOs.

## Stored facts

- `manual.store.ts` stores user mappings, ignores, and rejected automatic
  candidates by durable storage identity. Rejected IDs are facts attached to
  the manual record.
- `upstream.store.ts` stores source-native AniBridge targets plus source
  crosswalks and refresh metadata. It does not persist Sonarr, Radarr, or Seerr
  projections.
- `auto.store.ts` stores expiring automatic results by durable storage identity,
  using keys such as `anilist:209939` or `mal:63816`. Expired reads return no
  result and do not mutate storage.
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
still wins. Automatic results never resolve upstream ambiguity. Sonarr targets
are grouped by TVDB ID. A single scoped season stays scoped; multiple seasons
for one TVDB ID widen to one unscoped series target. Different TVDB IDs remain
ambiguous.

AniBridge projections are derived on read:

```text
tmdb-movie -> Radarr
tvdb-show -> Sonarr
tmdb-show -> no direct Arr target
```

## Automatic resolution

`MappingService` resolves the AniBridge crosswalk and direct targets once per
request. It passes the resolver four independent facts:

```text
source identity
optional AniList ID
page title metadata
rejected provider IDs
```

The resolver searches page titles first, then linked AniList metadata when that
capability exists, then known prequel relations. It never branches on the
content site's name or reconstructs an AniList ID from the source key. Mapped
and unmapped results use one write path under the durable storage identity.

## Effective Seerr targets

Seerr targets are derived from AniList-source AniBridge external IDs. TV targets
require one unambiguous TMDB show ID; a unique TVDB ID and scoped seasons are
retained when available. TVDB-only facts are treated as missing so automatic
TMDB resolution can run. A manual Seerr target overrides the derived target for
the same durable storage identity.

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
