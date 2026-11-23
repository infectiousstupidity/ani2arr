# Mapping

Mapping owns durable external-ID records and selects provider mappings from
those records. Provider library state, RPC presentation, and anime-format
routing remain outside this folder.

## Stores

Three stores remain separate because their writers, trust, and lifetimes differ:

- `manual.store.ts` stores user-confirmed values and Arr ignore/rejected choices.
- `upstream.store.ts` stores validated AniBridge values, conflicts,
  MAL-to-AniList links, relationship evidence, and refresh metadata.
- `auto.store.ts` stores expiring resolver values, relationship evidence, and
  independent failed-attempt lanes.

`mapping-record.ts` owns their shared record shape. Its three mapping values are
independent:

- `tmdbMovie`: TMDB movie ID;
- `tmdbShow`: TMDB TV-series ID;
- `tvdbShow`: TVDB series ID.

For the requested value, selection checks manual, then upstream, then
automatic. A value or conflict stops fallback for that value only.

```text
manual ─┐
upstream ├─> select requested provider value ─> RPC result
auto ───┘
```

`effective-mapping.ts` owns the direct selectors:

- `selectArrMapping` selects `tvdbShow` for Sonarr and `tmdbMovie` for Radarr;
- `selectSeerrMapping` selects `tmdbMovie` for movies and `tmdbShow` for TV.

It also applies compatible TMDB-show ↔ TVDB-show relationship evidence and
keeps missing Seerr data distinct from conflicting data.

## Identity and evidence

Records use their source-native identity. For a linked MyAnimeList source,
upstream selection checks the direct MAL record before the linked AniList
record, independently for each requested value. Manual and automatic state use
the linked AniList identity when known and otherwise remain under the page
identity.

TMDB-show ↔ TVDB-show pairs are shared series evidence used by both Sonarr and
Seerr TV. They are accepted only when compatible with the selected series IDs.
TMDB and TVDB season evidence stays attached to its own series ID because the
two services may number seasons differently.

## Persistence

Store reads are pure: they may decode released data and omit expired automatic
state, but they do not rewrite storage. Explicit migration and mutation paths
write the current format before removing old keys. Writes are serialized.
Automatic facts and attempt lanes expire independently, and a full reset
advances a write token so automatic work started before the reset cannot write
stale results afterward.

## Boundaries

Content owns `AnimeFormat` routing and music exclusion. Seerr reuses the
content-selected route as its movie/TV media type; mapping does not use format
as mapping truth.

The allowed dependency direction is:

```text
content / features / options-page -> queries -> RPC
RPC / background -> mapping + providers
mapping -> provider identity/schema types and typed resolver evidence
```

Providers do not call mapping or RPC. Mapping does not call provider clients or
read provider library state; background supplies the typed search/detail
operations used by automatic resolvers. Mapping also stays independent of RPC
DTOs, UI code, and content routing.
