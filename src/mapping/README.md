# Mapping architecture

Mapping persists external IDs once per durable source identity and derives
provider targets on read. It owns mapping facts and effective mapping results;
provider library state and RPC presentation remain outside this folder.

## Persistent layers

Only three stores own external-ID facts:

- `manual.store.ts` stores user-confirmed facts and Arr-only ignore/rejected
  candidate decisions.
- `upstream.store.ts` stores normalized AniBridge facts, source links, conflict
  and scope evidence, plus refresh metadata.
- `auto.store.ts` stores expiring resolver facts, per-slot metadata, and
  independent negative-attempt lanes.

Each store uses a versioned `{ version: 1, records }` envelope. Records contain
the shared `tmdbMovie`, `tmdbShow`, and `tvdbShow` slots. The slots are
independent: learning or clearing one does not change another.

Effective facts use this precedence:

```text
manual > upstream > automatic
```

An upstream conflict occupies its slot and blocks automatic fallback. Manual
Sonarr and Radarr decisions affect only their Arr projection; they do not own or
delete unrelated shared slots.

## Provider projections

Sonarr projects `tvdbShow`, Radarr projects `tmdbMovie`, and Seerr selects a
slot from an explicit media type: movies use `tmdbMovie`, while TV requires
`tmdbShow`. Callers must not guess between coexisting movie and show facts.

TVDB/TMDB show pairs are compatibility evidence, not another independent
mapping. A Seerr TV result may retain a TVDB ID as pair evidence without making
that ID Sonarr truth. Pair and season-scope evidence is used only when it
matches the selected show fact.

Automatic slot facts and conflicts have their own expiry. Negative attempts
are kept in resolver-specific lanes, so a failed Seerr movie lookup cannot
suppress Seerr TV or Sonarr resolution. Reads ignore expired state without
writing or deleting it.

## Source identity and aliases

Upstream records remain source-native. Direct MAL facts or conflicts are
checked before falling back through that record's `linkedAniListId` to the
canonical AniList record.

Manual and automatic writes use the linked AniList identity when known and the
page identity otherwise. Explicit migration and post-refresh consolidation
merge linked MAL aliases into one `anilist:<id>` record:

- canonical manual values win; missing facts, compatible scope/pair evidence,
  and decisions fill from aliases in stable source-key order;
- automatic alias facts consolidate only when candidates agree; a conflicting
  slot is dropped so its resolver can retry;
- unlinked direct-source facts stay under their source key.

Reads are pure and retain alias fallback until consolidation succeeds.

## Released-data migration

Store readers decode the bounded released v1/v2 shapes only while the versioned
envelope is absent. Startup begins an idempotent, non-blocking replacement after
RPC registration. Mutations perform the same upgrade in their store's write
queue, then write only the shared shape. Superseded keys are removed only after
the replacement write succeeds.

Legacy duplicate ownership is deterministic: Sonarr supplies independent
TVDB facts, Radarr supplies independent movie TMDB facts, and Seerr supplies
show TMDB facts, request scope, and TVDB/TMDB pair evidence. A legacy Seerr
movie fills a missing Radarr slot but never overwrites it. V1 mirrors choose the
newest local/sync record, with ignore taking precedence over an override.

Reset clears the three shared stores and all supported legacy keys. Task 06
adds generation protection for reset versus in-flight automatic writes; this
cut-over deliberately does not add an activation barrier or coordinator.
