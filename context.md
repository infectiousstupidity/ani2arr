# Code Context

## Files Retrieved

1. `docs/architecture/mapping.md` (lines 1-285) - canonical rules for independent links, precedence, seasons, ambiguity, retries, refresh cleanup, and provider consumption.
2. `src/mapping/mapping-record.ts` (lines 1-179) - common persisted evidence shape (`tmdbMovie`, `tmdbShow`, `tvdbShow`), conflicts/scopes, manual decisions, and four automatic-attempt lanes.
3. `src/mapping/effective-mapping.ts` (lines 1-351) - shared effective selectors and Arr/Seerr projections.
4. `src/mapping/manual.store.ts` (lines 42-308, 435-520) - all manual writes; currently no override-vs-gap-fill classification.
5. `src/mapping/upstream.store.ts` (lines 35-192, 225-500) - AniBridge snapshot refresh and normalized direct/canonical layers.
6. `src/mapping/auto.store.ts` (lines 1-275, 413-521) - shared automatic facts, four retry lanes, expiry, and stale-write reset token.
7. `src/mapping/mapping.service.ts` (lines 30-235) - composition entry point and Arr retry control.
8. `src/mapping/resolve/seerr-auto-resolver.ts` (lines 206-302) - Seerr conflict/cache/retry/search orchestration.
9. `src/rpc/handlers/mapping.handlers.ts` (lines 114-145, 442-520) - Arr mapping mutation API and mapping-page status projection.
10. `src/rpc/handlers/seerr.handlers.ts` (lines 75-153) - Seerr projection/retry and manual target mutation API.
11. `src/mapping/effective-mapping.test.ts` (lines 24-296) - direct precedence, ambiguity, season, and projection tests.
12. `src/mapping/manual.store.test.ts` (lines 25-468) - manual persistence/migration tests.
13. `src/mapping/upstream.store.test.ts` (lines 96-370) - refresh/decoder tests.
14. `src/mapping/auto.store.test.ts` (lines 89-627) - lane, alias, expiry, and reset-token storage tests.
15. `src/mapping/mapping.service.test.ts` (lines 55-291) - composed precedence, retry, conflict, and reverse lookup tests.
16. `src/mapping/resolve/seerr-auto-resolver.test.ts` (lines 99-590) - Seerr conflict, retry, reset, and projection tests.
17. `src/rpc/handlers/mapping.handlers.test.ts` (lines 290-370) and `src/rpc/handlers/mapping.handlers.integration.test.ts` (lines 105-305) - RPC validation and identity behavior.
18. `src/rpc/handlers/seerr.handlers.test.ts` (lines 75-180) - Seerr retry forwarding and target validation.

## Key Code

### Current architecture/data flow

`MappingRecord` stores three independent fact slots and provider-local season scopes:

```ts
export type MappingFacts = {
	tmdbMovie?: TmdbId;
	tmdbShow?: TmdbId;
	tvdbShow?: TvdbId;
};
```

`createMappingRecord` groups all seasons for one ID and emits a conflict for several IDs (`src/mapping/mapping-record.ts:86-159`). This matches the canonical independent-link and ambiguity model at the evidence-normalization boundary.

Effective reads are centralized in `selectArrMapping` and `selectSeerrMapping`. `MappingService.getMappingState` loads manual, direct AniBridge, canonical AniBridge, and automatic records (`src/mapping/mapping.service.ts:178-199`), then selectors use this fixed order (`src/mapping/effective-mapping.ts:201-215`):

```text
manual -> direct AniBridge -> canonical AniBridge -> automatic
```

Automatic attempts are correctly represented as four independent lanes (`src/mapping/mapping-record.ts:60-67`), and storage uses a 48-hour attempt TTL (`src/mapping/auto.store.ts:95-205, 413-433`). Arr force retry is enforced in `MappingService.resolveMapping` (`src/mapping/mapping.service.ts:49-80`); Seerr force retry is forwarded by `seerrHandlers.getSeerrTarget` and handled in its resolver (`src/rpc/handlers/seerr.handlers.ts:75-96`, `src/mapping/resolve/seerr-auto-resolver.ts:206-302`). Reset invalidates in-flight writes with `automaticWriteToken` (`src/mapping/auto.store.ts:245-272`).

### Concrete findings

1. **BLOCKER — gap-filling choices and explicit overrides are not representable separately.** `ManualMappingRecord` contains facts plus Arr ignore/rejection decisions, but no decision/source mode for a manual fact (`src/mapping/mapping-record.ts:42-53`). `setManualMapping` and `setManualSeerrTarget` always write undifferentiated facts (`src/mapping/manual.store.ts:89-116, 237-256`). Since every manual fact precedes AniBridge (`src/mapping/effective-mapping.ts:201-245`), a user selection made to resolve ambiguous/missing AniBridge evidence behaves as a permanent override. This violates the required distinction: gap-fill must sit below a later clear AniBridge answer, while explicit override stays above it.

2. **BLOCKER — accepted AniBridge refresh does not remove superseded gap-fill or automatic evidence.** `refreshUpstreamMappings` only replaces the upstream snapshot (`src/mapping/upstream.store.ts:146-183`); it neither classifies/removes temporary manual choices nor clears replaced automatic slots. Reads merely shadow lower evidence. The canonical document explicitly requires cleanup as an accepted-refresh write. Automatic entries remain until their 30-day TTL and all manual entries survive indefinitely.

3. **HIGH — a series manual override does not provide a complete replacement season set.** `findTvdbSeasons`/`findTmdbSeasons` scan lower-priority records when the selected manual record has no seasons (`src/mapping/effective-mapping.ts:161-198`). Existing test `finds Sonarr seasons for the selected TVDB ID across layers` explicitly expects a manual ID with no scope to inherit AniBridge season 2 (`src/mapping/effective-mapping.test.ts:104-117`). Canonical behavior says an explicit series override replaces ID and complete season set and must not merge seasons from AniBridge. Because the model cannot distinguish gap-fill from override, it cannot decide when lower-layer season fallback is legal.

4. **HIGH — provider projections lose or cross provider season completeness.** Sonarr `MappingResult` has only optional singular `season`; `selectArrMapping` emits it only when exactly one TVDB season exists and silently omits all seasons when there are several (`src/mapping/effective-mapping.ts:88-110`). The test at `src/mapping/effective-mapping.test.ts:275-283` codifies this loss for `[1,2]`. Seerr TV separately computes TMDB and TVDB seasons, then also exposes generic `seasons` as their union (`src/mapping/effective-mapping.ts:143-156`); tests expect `[2,3]` from TMDB season 2 plus TVDB season 3 (`src/mapping/effective-mapping.test.ts:185-213`). If generic `seasons` drives the Seerr request, this copies TVDB season numbers into the TMDB/Seerr action, contrary to provider ownership.

5. **HIGH — Seerr TV is coupled to TVDB conflict/relation evidence even though its required link is independently TMDB series.** After selecting TMDB show, `selectSeerrMapping("tv")` calls `selectTvdb`; any TVDB conflict returns a Seerr conflict (`src/mapping/effective-mapping.ts:131-146`). The canonical model says Seerr TV asks only for TMDB series + TMDB seasons and TVDB ambiguity belongs to the independent Sonarr link. Existing test `reports higher-priority TVDB conflicts and keeps movie and TV separate` expects the coupled conflict (`src/mapping/effective-mapping.test.ts:250-264`).

6. **MEDIUM — Seerr conflict information is collapsed at the service/provider boundary.** `SeerrMappingOutcome` exposes only `{ kind: "conflict" }`, with no candidates (`src/mapping/effective-mapping.ts:51-54`), and `MappingService.getSeerrTarget` converts conflict and missing alike to `null` (`src/mapping/mapping.service.ts:95-105`). This data path cannot support canonical “Choose a match” candidate details without a separate inspection path. Arr preserves candidate IDs in `MappingResult.ambiguous` (`src/mapping/effective-mapping.ts:64-99`).

7. **MEDIUM — source provenance is too coarse for active override inspection.** Effective source reports only `manual`, `upstream`/`anibridge`, or `automatic` (`src/mapping/types.ts:65-79`, `src/mapping/mapping.service.ts:203-214`). It cannot tell explicit override from temporary user choice, nor return active manual plus current AniBridge default together. Therefore the canonical active-override inspection state cannot be faithfully composed from this result alone.

8. **LOW/PASS — independent IDs and conflicts are otherwise normalized correctly.** `createMappingRecord` keeps TMDB movie, TMDB show, and TVDB show in separate slots, combines distinct seasons under the same show ID, and retains several IDs as conflicts (`src/mapping/mapping-record.ts:86-159`). Tests cover independent movie/TV facts and ambiguity (`src/mapping/effective-mapping.test.ts:25-67, 250-272`; `src/mapping/upstream/anibridge.parser.test.ts:23-76`).

9. **LOW/PASS — deliberate manual differences do not automatically become Needs review in Arr lists.** Manual facts select as mapped and mapping-page `rowStatus` assigns Needs review only to `ambiguous` results (`src/rpc/handlers/mapping.handlers.ts:114-145`). However, there is no test explicitly asserting manual override differing from clear AniBridge remains mapped/no-review while AniBridge comparison remains inspectable.

## High-Risk Missing Tests

Only tests with significant behavioral/regression risk are listed:

1. **Override versus gap-fill precedence lifecycle:** same link kind, clear AniBridge appears/changes after (a) gap-fill and (b) explicit override; assert gap-fill is removed/replaced while override survives. No current type/API can express both cases.
2. **Accepted refresh atomic cleanup:** refresh that turns missing/ambiguous evidence into one clear ID must delete only the corresponding temporary choice and automatic slot, preserve other link kinds, preserve explicit overrides, and perform no cleanup on invalid/failed/304 refresh.
3. **Series override completeness:** explicit TMDB-TV and TVDB override with seasons `[3]` over AniBridge `[1,2]` must project only `[3]`; explicit unknown-season override must not inherit lower seasons. Current selector test expects the opposite for TVDB.
4. **Independent Seerr/Sonarr conflicts:** TVDB ambiguity must not block clear TMDB-series Seerr TV; TMDB-series ambiguity must not block clear TVDB Sonarr. Current Seerr test encodes TVDB coupling.
5. **Multi-season provider projection:** TVDB `[1,2,3]` reaches the Sonarr action without silently becoming “no season”; Seerr consumes only TMDB seasons and never a union containing TVDB-only seasons.
6. **Inspection contract:** explicit override differing from AniBridge reports active override and current AniBridge candidate without Needs review; gap-fill is labeled separately; Seerr ambiguity exposes retained candidates rather than null.
7. **Four-lane retry interaction:** one lane’s failure does not block another consumer of the same successful fact slot; force retry bypasses only the requested lane; ordinary requests remain blocked for 48 hours even with new hints. Individual retry pieces exist, but the cross-lane shared-fact scenario is not covered end-to-end.

## Architecture

```text
AniBridge download/parser -> upstream.store (direct + canonical evidence)
manual RPC actions        -> manual.store (undifferentiated manual facts)
automatic resolvers       -> auto.store (shared facts + 4 attempt lanes)
                                      |
                                      v
                         MappingService.getMappingState
                                      |
                     effective-mapping shared selectors
                         /                         \
              Arr MappingResult             Seerr target
              Sonarr/Radarr RPC              Seerr RPC/actions
```

The implementation has a useful evidence-layer shape and a single effective-selection boundary, but the manual layer currently conflates two product meanings. That single conflation propagates into refresh cleanup, precedence, season replacement, provenance, and inspection behavior. Provider projection also retains obsolete TMDB↔TVDB pair coupling that contradicts the approved independent-link model.

## Start Here

Open `src/mapping/mapping-record.ts` first. The missing manual-decision distinction is the root constraint. Then inspect `src/mapping/effective-mapping.ts`, where fixed layer precedence and season/provider projections turn that storage limitation into observable behavior.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Reported nine concrete architecture findings with BLOCKER/HIGH/MEDIUM/LOW severity and exact file/symbol line ranges, plus seven high-risk missing-test scenarios."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "Targeted read/grep reconnaissance across docs/architecture/mapping.md, src/mapping, src/rpc/handlers, queries, background, and focused tests",
      "result": "passed",
      "summary": "Mapped canonical rules to storage, selector, resolver, RPC, and test symbols."
    },
    {
      "command": "git status --short && git diff --cached --name-only",
      "result": "passed",
      "summary": "Confirmed a pre-existing dirty worktree and no staged files."
    }
  ],
  "validationOutput": [
    "Read-only reconnaissance; no tests were run because no implementation was changed.",
    "No staged paths were reported by git diff --cached --name-only."
  ],
  "residualRisks": [
    "The worktree contains substantial pre-existing uncommitted mapping changes, so findings describe the current working-tree implementation rather than HEAD.",
    "UI inspection composition outside the mapping/RPC paths may expose some additional metadata, but the core effective result and Seerr outcome still cannot distinguish override from gap-fill."
  ],
  "noStagedFiles": true,
  "diffSummary": "No files changed by this read-only task; context.md is the required reconnaissance artifact only.",
  "reviewFindings": [
    "blocker: src/mapping/mapping-record.ts:42-53 - manual records cannot distinguish explicit overrides from gap-filling choices.",
    "blocker: src/mapping/upstream.store.ts:146-183 - accepted AniBridge refresh does not clean superseded gap-fill or automatic evidence.",
    "high: src/mapping/effective-mapping.ts:161-198 - manual series selections can inherit lower-priority seasons instead of complete replacement.",
    "high: src/mapping/effective-mapping.ts:88-110,143-156 - provider projections lose multi-season Sonarr scope and union TMDB/TVDB seasons for Seerr.",
    "high: src/mapping/effective-mapping.ts:131-146 - TVDB conflict can block independent Seerr TMDB-TV mapping."
  ],
  "manualNotes": "The architecture comparison is against the current dirty worktree. No project source or test file was edited."
}
```
