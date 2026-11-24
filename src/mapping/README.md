# Mapping

Mapping owns durable external-ID records and selects provider mappings from
those records. Provider library state, RPC presentation, and anime-format
routing remain outside this folder.

## Stores

Three stores remain separate because their writers, trust, and lifetimes differ:

- `manual.store.ts` stores user-confirmed values and Arr ignore/rejected choices.
- `upstream.store.ts` stores validated AniBridge values, conflicts, season
  scopes, MAL-to-AniList links, and refresh metadata.
- `auto.store.ts` stores expiring resolver values, season scopes, and
  independent failed-attempt lanes.

`mapping-record.ts` owns their shared record shape. Its three mapping values are
independent:

- `tmdbMovie`: TMDB movie ID, shared by Radarr and Seerr;
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

It keeps missing Seerr data distinct from conflicting data; Arr reports
conflicting candidates as ambiguous.

## Identity and evidence

Records use AniList or MyAnimeList source identities. An upstream MAL record
links to AniList only when its AniList target is unique. Selection checks the
direct MAL record before the linked AniList record for each value. Manual and
automatic writes use the linked AniList identity when known, otherwise the page
identity; reads also consider existing page-identity records.

TMDB and TVDB season evidence stays attached to its own series ID; no explicit
TMDB ↔ TVDB relationship pairs are stored. Seerr uses only TMDB season evidence,
never TVDB seasons, for preselection.

## Persistence

Store reads are pure: they omit malformed cache records and expired automatic
state without rewriting storage. Only the manual store decodes legacy data;
upstream and automatic legacy caches are discarded. Explicit migration and
mutation paths write the current format where needed. Writes are serialized.
Automatic facts and the Sonarr TVDB, Radarr TMDB movie, Seerr TMDB movie, and
Seerr TMDB show attempt lanes expire independently. A full reset
advances a write token so automatic work started before the reset cannot write
stale results afterward.

## Boundaries

Content owns `AnimeFormat` routing and music exclusion. Seerr reuses the
content-selected route as its movie/TV media type; mapping does not use format
as mapping truth.

The allowed dependency direction is:

```text
content / features / options-page -> queries -> RPC (or settings snapshots)
RPC / background -> mapping + providers
mapping -> provider identity/schema types and typed resolver evidence
```

Providers do not call mapping or RPC. Mapping does not call provider clients or
read provider library state; background supplies the typed search/detail
operations used by automatic resolvers. Mapping also stays independent of RPC
DTOs, UI code, and content routing.
