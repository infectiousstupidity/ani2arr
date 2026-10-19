# Automatic Mapping Winner Selection Plan

## Context

Automatic title matching currently rejects a highest-scoring candidate when the runner-up is too close. The intended behavior is to select the highest-scoring candidate whenever it meets the existing minimum confidence threshold. Automatic ambiguity should no longer be produced or persisted; `MappingResult.ambiguous` remains for upstream mapping conflicts so the existing **Needs review** behavior continues to work.

The mapping area already has substantial uncommitted work. This plan will target the current working-tree architecture and avoid unrelated cleanup.

## Goal

Make automatic mapping choose the highest-scoring acceptable title candidate, while reserving ambiguity/review state for upstream conflicts.

## Non-goals

- Changing title scoring or the minimum confidence threshold.
- Removing `MappingResult.ambiguous` or the existing **Needs review** filter.
- Changing manual mapping behavior or Seerr target selection beyond any required type fallout.
- Broad mapping architecture cleanup.

## Approach

1. Remove only the winner-margin gate from title-match selection, retaining descending score order and the existing `MINIMUM_SCORE` rejection.
2. Narrow `AutoResult` to `mapped | unmapped`. Remove the ambiguous branch from `setAutoResult`, the Arr conflict writer it calls, and automatic-store consolidation paths that can copy/re-persist conflicts.
3. Treat all persisted automatic ambiguity as stale resolver output:
   - skip old provider-bucket `{ kind: "ambiguous" }` entries without creating a fact, conflict, TTL, or failed-attempt marker;
   - when normalizing current v1 automatic records, discard `conflicts.tmdbMovie` and `conflicts.tvdbShow`; if either exists, discard that entire Arr slot’s fact, scope, and slot metadata as well so a malformed mixed fact/conflict record cannot become a mapping;
   - preserve unrelated automatic slots and valid attempt lanes, but never synthesize an attempt from ignored ambiguity.
4. Leave upstream storage and effective selection unchanged: upstream conflicts continue to become `MappingResult.ambiguous`, and RPC row composition continues to assign them `needs-review` unless the existing single-in-library-target exception applies.
5. Add focused regressions at the existing ownership boundaries rather than new helpers or test files.

## Files to modify

- `src/mapping/resolve/title-matching.ts` — remove the margin threshold and runner-up rejection.
- `src/mapping/resolve/title-matching.test.ts` — cover close acceptable candidates and the retained confidence floor.
- `src/mapping/types.ts` — remove the ambiguous member from `AutoResult` only; retain `MappingResult.ambiguous` and `ArrUpstreamTarget`.
- `src/mapping/auto.store.ts` — remove automatic conflict production/copying and ignore both legacy ambiguity storage shapes during normalization/migration.
- `src/mapping/auto.store.test.ts` — verify old bucket ambiguity and current v1 automatic conflicts are removed by migration.
- `src/rpc/handlers/mapping.handlers.test.ts` — verify an unresolved ambiguous effective result receives the `needs-review` row status used by the existing filter.

No production upstream, effective-mapping, RPC status, or options-page filter code should need to change.

## Reuse

- Keep the existing score computation, deterministic descending sort, and `MINIMUM_SCORE` check in `findTitleMatchForTermInternal` (`src/mapping/resolve/title-matching.ts`).
- Reuse `clearSlot` and container cleanup in `src/mapping/auto.store.ts` when stripping a current-record conflict so associated metadata cannot survive as orphan state.
- Keep `selectArrMapping` in `src/mapping/effective-mapping.ts`, which already gives upstream (`direct`/`canonical`) conflicts precedence over automatic fallback and returns `MappingResult.ambiguous`.
- Keep `rowStatus` in `src/rpc/handlers/mapping.handlers.ts`, whose ambiguous branch already yields `needs-review` except when exactly one candidate exists in the library.
- Extend the existing Vitest suites and their storage/library fixtures; add no new helper or test file.

## Steps

- [x] In `findTitleMatchForTermInternal`, remove `MINIMUM_WINNER_MARGIN`, the runner-up lookup, and the close-score early return; continue returning `null` when no winner reaches `MINIMUM_SCORE`.
- [x] Add a title-matching case with two candidates less than the former `0.02` margin apart and assert the higher score wins. Retain or sharpen the weak-result regression to assert a top score below `0.82` remains unmapped.
- [x] Remove `{ kind: "ambiguous" }` from `AutoResult`; verify the resolver’s existing producers remain only `mapped` and `unmapped`, while `MappingResult.ambiguous` remains unchanged.
- [x] Remove the ambiguous branch from `setAutoResult`, delete `setArrConflict` and its now-unused validation/import code, and stop alias consolidation from treating/copying automatic conflicts as valid slots.
- [x] Make the old provider-bucket decoder no-op for ambiguous results. Make current-record normalization identify automatic Arr conflict slots and clear each affected slot—including a coexisting fact, scope, and slot metadata—while retaining unrelated facts and attempts.
- [x] Add automatic migration regressions for both persisted forms. After `migrateAutomaticStore`, assert no conflict/fact/metadata from the ambiguous Arr slot remains (and that an otherwise-empty record is removed), demonstrating a subsequent automatic resolution is not suppressed by migrated ambiguity.
- [x] Add a mapping-handler regression with multiple unresolved conflict targets and assert `mappingRowStatus: "needs-review"`. Rely on the existing `effective-mapping.test.ts` / `mapping.service.test.ts` upstream-conflict coverage to prove those ambiguous results originate from upstream and block automatic fallback.
- [x] Run focused lint, tests, and diagnostics; run broader validation only if the shared `AutoResult` narrowing causes wider type fallout.

## Verification

- `pnpm lint:target src/mapping/resolve/title-matching.ts src/mapping/resolve/title-matching.test.ts src/mapping/types.ts src/mapping/auto.store.ts src/mapping/auto.store.test.ts src/rpc/handlers/mapping.handlers.test.ts`
- `pnpm test src/mapping/resolve/title-matching.test.ts src/mapping/auto.store.test.ts src/mapping/effective-mapping.test.ts src/mapping/mapping.service.test.ts src/rpc/handlers/mapping.handlers.test.ts`
- LSP/pi-lens diagnostics for every touched file.
- If the shared result-type change exposes broader compile-time fallout, run `pnpm validate`; otherwise avoid unrelated broad testing.

Expected outcomes:

- Two acceptable close candidates map to the higher score.
- A best candidate below `0.82` remains unmapped.
- Upstream conflicts still produce `MappingResult.ambiguous` and appear under **Needs review**.
- Neither old provider-bucket ambiguity nor current automatic `conflicts` survives migration, and neither is converted into an automatic attempt.
