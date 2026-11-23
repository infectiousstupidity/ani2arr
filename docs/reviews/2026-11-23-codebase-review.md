# ani2arr codebase review — 2026-11-23

## 1. Header

| Item | Value |
|---|---|
| Date | 2026-11-23 |
| Commit | `6205890` |
| Worktree | Clean at the start of the review. This report is the only change. |
| `pnpm compile` | Pass (`tsc --noEmit`, 11 s) |
| `pnpm lint` | Pass (`eslint src`, 0 problems, 18 s) |
| `pnpm test` | Pass (77 files, 484 tests, 8.2 s, no stderr noise) |
| Extra check | `prettier --check src` fails on **150 files**. See ORCH-01. |
| Size | 333 `.ts/.tsx` files, about 50.4k lines including tests |

| Lane | Scope | Model | Result |
|---|---|---|---|
| L1 foundation | shared, settings, entrypoints, config, deps, scripts | `codex-lb/gpt-6.1-terra:medium` | Returned, 2 findings. Thin on dependencies; the orchestrator filled the gap. |
| L2 providers | `src/providers/**` | `codex-lb/gpt-6.2-sol:high` | Returned, 5 findings |
| L3 mapping + metadata | `src/mapping`, `src/anilist`, `src/myanimelist` | `codex-lb/gpt-6.2-sol:high` | Returned, 7 findings |
| L4 runtime boundary | `src/background`, `src/rpc`, `src/queries` | `claude-bridge/claude-sonnet-5-5:high` | Returned, 11 findings |
| L5 content | `src/content/**` | `codex-lb/gpt-6.1-terra:high` | Returned, 3 findings |
| L6 media modal | `src/features/media-modal/**` | `claude-bridge/claude-sonnet-5-5:high` | Returned, 13 findings |
| L7 other features | media-action, media-overlay, provider-ui, seerr-request | `codex-lb/gpt-6.1-terra:high` | Returned, 1 finding |
| L8 options UI | `src/options-page/**`, options and popup entrypoints | `claude-bridge/claude-sonnet-5-5:medium` | Returned, 6 findings |
| L9 cross-cutting | all of `src/` | `codex-lb/gpt-6.2-sol:high` | Returned, 6 findings |

All lanes were covered on the first attempt; none needed a retry. ORCH-* findings come from the orchestrator.

## 2. Executive summary

- **Overall health is good.** Compile, lint and test are green. The ownership boundaries that matter all hold: UI never imports clients, stores or handlers; providers never import mapping or RPC; mapping never imports provider clients. The MV3 lifecycle is sound. There is no barrel-file or import-cycle mess.
- **Lever 1: Sonarr/Radarr twin code.** About 2,500 lines exist twice, differing only by names, ID types and a few fields. The copies are in the media modal, the mapping panels, the setup forms, the options defaults, the RPC handlers, the mapping-list builder and the library caches. Merging each pair into one implementation with a `provider` parameter is the biggest readability win (L6-01, L6-02, L6-04, L8-01, L4-01, L4-02, L2-01).
- **Lever 2: browse-page refetch storm.** Every automatic mapping that gets stored bumps a global revision. That invalidates every card's status query, plus a mapping-identities query that clones the whole AniBridge dataset, in every tab. The two fixes (L4-03, L9-01) are small and should remove most of the browse-page cost.
- **Lever 3: four real bugs with small fixes.**
  - SPA navigation is lost if you leave an AniList anime page before it renders (L5-01).
  - Matching the release year *lowers* an exact title's score (L3-01).
  - Mapping actions fail silently (L6-08).
  - Two library-cache upserts can overwrite each other (L2-01).
- **Tooling drift.** Prettier is configured but never runs (150 unformatted files). The AGENTS.md import-flow diagram doesn't match the code and isn't enforced. A lint zone rule plus a rewritten, shorter AGENTS.md (section 6) would fix both.

## 3. Ranked findings

Ranking: impact (high first), then effort (S first), then confidence. Status: **V** = Verified, **A** = Adjusted, **S** = Spot-checked.

| Rank | ID | Title | Category | Impact | Effort | Conf. | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | L5-01 | Content shell registers navigation listeners only after the first reconcile, so SPA navigation can be lost | flow | high | S | high | V | `content/core/create-content-script-shell.ts:127-156`, `content/anilist/anime-page/index.tsx:80-84` |
| 2 | L3-01 | A matching year lowers an exact title score (cap 0.999), and exact-year vs ±1-year ties go to response order | flow | high | S | high | V | `mapping/resolve/title-matching.ts:67,656-668,698-717,899` |
| 3 | L4-03 | Every stored auto-mapping invalidates every card's status query in every tab | performance | high | S | medium | V | `background/api-services.ts:133-146`, `queries/invalidation.ts:37-53`, `queries/use-a2a-broadcasts.ts:35` |
| 4 | L9-01 | Browse mapping-identity lookups clone and sort the full AniBridge dataset per batch | performance | high | M | high | A | `mapping/list-mappings.ts:23-80`, `mapping/upstream.store.ts:59-67`, `queries/mapping.ts:116-128` |
| 5 | L6-01 (+L6-03) | Sonarr and Radarr modals are copies (83 of about 400 lines differ) | duplication | high | M | high | A | `features/media-modal/sonarr/sonarr-modal.tsx:49-413`, `radarr/radarr-modal.tsx:46-382` |
| 6 | L4-01 | `mapping.handlers.ts`: `buildSonarrGroups`/`buildRadarrGroups` and `*Meta` are identical, plus dead null branches | duplication | high | M | high | V | `rpc/handlers/mapping.handlers.ts:90-113,157-182,202,229,250,261-374` |
| 7 | L8-01 | Sonarr and Radarr options-defaults files are copies (89 of about 660 lines differ) | duplication | high | M | high | A | `options-page/pages/sonarr/sonarr-defaults.tsx:140-348`, `radarr/radarr-defaults.tsx:116-307` |
| 8 | L6-02 | Sonarr and Radarr mapping panels are copies | duplication | high | M | high | V | `media-modal/sonarr/sonarr-mapping-panel.tsx:123-232`, `radarr/radarr-mapping-panel.tsx:77-182` |
| 9 | L4-02 | Sonarr and Radarr RPC status flow is copy-paste, and provider config is read twice per status call | duplication | high | M | high | A | `rpc/handlers/sonarr.handlers.ts:197-292`, `radarr.handlers.ts:182-270` |
| 10 | L6-08 | Reset, ignore and reject mapping actions swallow errors (no catch, `void onX()`) | flow | medium | S | high | V | `media-modal/hooks/use-mapping-actions.ts:139-160`, `chrome/modal-footer.tsx:122-178` |
| 11 | ORCH-01 (+L6-13) | Prettier never runs: 150 files fail `prettier --check` | tooling | medium | S | high | V | `package.json` lint-staged, `.editorconfig`, e.g. `content/anilist/anime-page/layout.ts` |
| 12 | L4-05 | Linked-AniList entry built twice; `GetMappingInspectionInput` declared three times | duplication | medium | S | high | V | `rpc/handlers/seerr.handlers.ts:46-67`, `rpc/mapping-inspection.ts:15,29-55`, `rpc/types.ts:141` |
| 13 | L4-06 | `bootstrap.ts` repeats its wake sequence three times; `shouldWarmMappingsCache` duplicates `hasAnyConfiguredConnection` | duplication | medium | S | high | V | `background/bootstrap.ts:45-57,87-129`, `background/connection-workflows.ts:36-42` |
| 14 | L3-05 | Seerr resolver fetches TV details before it knows a season is needed | performance | medium | S | high | V | `mapping/resolve/seerr-auto-resolver.ts:170-200` |
| 15 | L3-06 | Alias consolidation trusts upstream rows that normal reads reject | flow | medium | S | high | S | `mapping/upstream.store.ts:96,200`, `mapping/migrate.ts:16` |
| 16 | L6-03 | Mapping-candidate wrapper types carry an unused `result` and a duplicate ID | dead-code | medium | S | high | V | `media-modal/sonarr/sonarr-mapping-panel.tsx:21-25`, `radarr/radarr-mapping-panel.tsx:21-25` |
| 17 | L7-01 | Seerr stack and standalone overlays build the same `CardOverlay` twice | duplication | medium | S | high | A | `features/media-overlay/seerr-card-overlay.tsx:173-229,258-306` |
| 18 | L8-02 | `sonarr-page.tsx` and `radarr-page.tsx` differ by two lines | duplication | medium | S | high | V | `options-page/pages/sonarr-page.tsx`, `radarr-page.tsx` |
| 19 | L4-04 | Mapping mutations invalidate twice (`onSuccess` and the revision broadcast) | duplication | medium | S | medium | V | `queries/mapping.ts:33-101`, `queries/invalidation.ts:11-34`, `rpc/handlers/mapping.handlers.ts:472-543` |
| 20 | L3-02 | Forced resolver miss clears the shared `tmdbMovie` slot before recording the miss | flow | medium | S | medium | A | `mapping/auto.store.ts:115-121,185-191`, `mapping/resolve/seerr-auto-resolver.ts:280-288` |
| 21 | L2-01 | Sonarr and Radarr library caches are copies (61 of about 370 lines differ), and upserts can lose updates | duplication | medium | M | high | V | `providers/sonarr/library.ts:239-278`, `providers/radarr/library.ts:237-276` |
| 22 | L5-02 | Browse observer reparses every card on any body mutation, including the extension's own portals | performance | medium | M | high | V | `content/browse/use-browse-card-targets.ts:14-20,202-215,297-300` |
| 23 | L6-04 | Setup forms and setup-values duplicate submit gating, path preview and helpers | duplication | medium | M | high | V | `media-modal/sonarr/sonarr-setup-form.tsx:97,108`, `radarr/radarr-setup-form.tsx:93,104`, `*-setup-values.ts` |
| 24 | L3-03 | Title matcher re-sorts ordered terms, re-normalizes the query per candidate, and sorts the whole list to pick one winner | size | medium | M | high | S | `mapping/resolve/title-matching.ts:450,495,785,883-908` |
| 25 | L3-04 | Manual point lookups read legacy keys and decode the full store | performance | medium | M | high | S | `mapping/manual.store.ts:59,337,363,683`, `mapping/mapping.service.ts:162` |
| 26 | L2-03 | Seerr decodes season rows two different ways (details vs status) | duplication | medium | M | high | S | `providers/seerr/request.ts:32,137,194,401,440` |
| 27 | L6-05 | Root-folder, quality-profile and tags controls are repeated in four option-field files | duplication | medium | M | high | S | `media-modal/sonarr/sonarr-add-options-fields.tsx:121-131` and 3 siblings |
| 28 | L6-06 | Two header implementations and copied chrome class constants | duplication | medium | M | high | S | `media-modal/chrome/modal-header.tsx:44-47,62,80-135,329-405`, `seerr/seerr-header.tsx:25,102-210`, `seerr/seerr-modal.constants.ts` |
| 29 | L4-07 (+L9-03) | Hand-written `Ani2arrApi` and alias-only DTO types restate the handlers | types | medium | M | medium | S | `rpc/index.ts:19-160`, `rpc/types.ts:190,224,253,317,336`, `mapping/types.ts:56` |
| 30 | L4-08 | Library revision is bumped through three wiring paths | flow | medium | M | medium | V | `background/api-services.ts:96-108`, `rpc/handlers/sonarr.handlers.ts:51,78,213`, `radarr.handlers.ts:50,66,194` |
| 31 | L9-05 | `validateTvdbId`/`validateTmdbId` RPCs have no callers | dead-code | low | S | high | V | `rpc/index.ts:142-146`, `rpc/handlers/sonarr.handlers.ts:177`, `radarr.handlers.ts:158` |
| 32 | L9-02 | Season-number normalizer exists twice | duplication | low | S | high | V | `mapping/season-numbers.ts:1-7`, `providers/seerr/request.ts:103-107` |
| 33 | L1-01 (+L9-04) | Host-site theme detection lives in `shared` | flow | low | S | high | A | `shared/hooks/use-theme.ts:17-60`; only callers are in `content/` |
| 34 | L1-02 (+L9-06) | Playwright and Testing Library lint config for tests that don't exist | dead-code | low | S | high | A | `eslint.config.mjs:11,85-115`, `package.json:53,58` |
| 35 | L5-03 | MAL search parser adds action cells to rows it then rejects | flow | low | S | high | V | `content/myanimelist/browse/adapter.ts:202,216-220` |
| 36 | L4-09 | 18 redundant `refetchOnWindowFocus: false` lines, a no-op normalizer, and a hand-built query key | abstraction | low | S | high | V | `queries/query-client.ts:19`, `queries/seerr.ts:101`, `queries/*.ts` |
| 37 | L6-07 | Dead props and parameters (`rightPaneTop`, `workspaceClassName`, `myAnimeListMetadata`) | dead-code | low | S | high | V | `media-modal/chrome/modal-shell.tsx:62`, `chrome/modal-header.tsx:39`, `anilist-modal-data.ts:284` |
| 38 | L6-09 | `MappingFooter` repeats one button block four times | duplication | low | S | high | S | `media-modal/chrome/modal-footer.tsx:112-188` |
| 39 | L3-07 | Mapping README describes TMDB↔TVDB pair evidence that the code no longer stores | docs | low | S | high | S | `src/mapping/README.md:38,49`, `mapping/types.ts:56` |
| 40 | L2-05 | Arr save validation is copied across four workflows | duplication | low | S | high | S | `providers/sonarr/add.ts:175`, `radarr/add.ts:168`, `sonarr/edit.ts:210`, `radarr/edit.ts:157` |
| 41 | L2-04 | Tag resolution fetches all tags even when there are no new labels | performance | low | S | high | A | `providers/provider-tags.ts:26-29` |
| 42 | ORCH-02 | 229 files carry a stale-prone `// src/path` header comment | docs | low | S | high | V | e.g. `features/media-overlay/seerr-card-overlay.tsx:2` |
| 43 | ORCH-03 | Import-ownership rules exist only as prose; nothing enforces them | tooling | low | S | high | V | `eslint.config.mjs` (no `import-x/no-restricted-paths`) |
| 44 | L8-03 | Manual `useCallback`/`useMemo` despite the React Compiler (66 non-test uses) | abstraction | low | S | medium | S | `options-page/hooks/provider-connection-actions.ts:44,96`, `options-page/index.tsx:66-120` |
| 45 | L8-04 | `useSonarrActions`/`useRadarrActions` only rename fields | abstraction | low | S | medium | V | `options-page/hooks/provider-connection-actions.ts:16-32,119-148` |
| 46 | L8-05 | Nav status colour decided by comparing label strings | types | low | S | medium | V | `options-page/components/options-navigation.tsx:117-118` |
| 47 | L4-10 | `rpc/revision-signals.ts` and the reset workflows sit in the wrong folder | flow | low | S | medium | A | `rpc/revision-signals.ts`, `background/api-services.ts:186-258` |
| 48 | L4-11 | Query tests assert option literals and exact invalidation key lists | tests | low | S | medium | S | `queries/query-resource-hooks.test.ts:84-236`, `queries/invalidation.test.ts:48-218` |
| 49 | L6-10 | Two tiny one-use details components | abstraction | low | S | medium | S | `media-modal/details/current-target-details.tsx`, `preview-target-details.tsx` |
| 50 | L6-11 | Poster preload machinery holds results back for up to 5 s | abstraction | low | S | medium | S | `media-modal/mapping/mapping-search-shell.tsx:34-143` |
| 51 | L8-06 | Popup and UI page both build the `ui.browseCards` update | duplication | low | S | low | S | `entrypoints/popup/index.tsx:116-140`, `options-page/pages/ui-page.tsx:~215-300` |
| 52 | L6-12 | Defensive runtime checks on already-typed arrays | size | low | S | low | S | `media-modal/anilist-modal-data.ts:70-122` |
| 53 | L2-02 | Request timeout is cleared before the response body is read | flow | low | M | high | A | `providers/shared.client.ts:48-60,140-147`, `providers/seerr/client.ts:205-256` |

## 4. Quick wins

There are 14 quick wins (high or medium impact, effort S): ranks **1–3 and 10–20**.

In order: L5-01, L3-01, L4-03, L6-08, ORCH-01, L4-05, L4-06, L3-05, L3-06, L6-03, L7-01, L8-02, L4-04, L3-02.

The first four are behavior fixes. Do them first.

## 5. Finding details (rank order)

**1. L5-01: navigation listeners registered too late.**
- Problem: `createContentScriptShell` awaits the first `reconcile()` before it adds the `wxt:locationchange`, `pageshow`, storage and invalidation listeners. On an AniList anime page, `isEligible` waits for three elements through `waitForElement`, which has no timeout. If the user navigates in the SPA before those elements exist, the wait never ends. Every later navigation is then ignored until a full reload, and the MutationObservers stay alive.
- Fix: register all listeners first, then `void reconcile(location.href)`. Add one test that navigates while eligibility is pending.
- Verification: Verified. Read `create-content-script-shell.ts:127-160` and `anilist/anime-page/layout.ts:25-69`.

**2. L3-01: year bonus can lower an exact title.**
- Problem: `YEAR_SCORE_CAP = 0.999`. An exact title already scores 1.0, so a correct-year bonus drops it to 0.999. The same title with no year stays at 1.0 and wins. Exact-year and ±1-year candidates both cap at 0.999, so the winner then depends on provider response order. The realistic trigger is the tie: same-title entries a year apart.
- Fix: one year-scoring function. Cap at 1.0, or apply the year as a tie-breaker. Add one regression case.
- Verification: Verified at `title-matching.ts:67,664,712,899`.

**3. L4-03: auto-mapping storm.**
- Problem: `mappingService` and the Seerr resolver call `bumpMappingsRevision()` whenever they store a result. `useA2aBroadcasts` reacts by invalidating `mappingRoot`, the Seerr roots, and the status and lookup roots for both providers. On a browse page with N visible unresolved cards, that is up to N² status RPCs in every open tab.
- Fix: don't bump the global revision for automatic writes, because the requesting card already has its result. Keep the bump for manual edits and upstream refresh. A cheaper option is to debounce automatic bumps by about 1 s.
- Verification: Verified code path (`api-services.ts:133-146`, `invalidation.ts:37-53`). Not profiled, so confidence is medium. Profile a 50-card page before and after.

**4. L9-01: mapping-identity lookups scan everything.**
- Problem: `getMappingIdentities(ids)` calls `listEffectiveMappingsByProvider()`. That reads all three stores, validates and `structuredClone`s every upstream record (the whole AniBridge dataset), sorts every ID, and only then filters to the few requested IDs. The query key sits under `mappingRoot`, so every L4-03 bump re-runs it.
- Fix: use the existing per-key readers (`readSnapshotRecords`-style lookups) for the requested IDs. Keep the full scan for the options mapping list.
- Verification: Adjusted, impact raised from medium to high because it compounds with L4-03.

**5. L6-01 (+L6-03): modal twins.**
- Problem: after renaming, `sonarr-modal.tsx` and `radarr-modal.tsx` differ in 83 of about 400 lines. Most of the difference is import order and Sonarr's episode-count details. View state, reject/clear/ignore logic, Escape handling and the 20-prop `MappingFooter` are written twice. The candidate wrapper types (`{tvdbId, result, summary}`) carry a `result` that nothing reads.
- Fix: one `ArrModal` with a `provider` prop. Branch inline on the few differences (status hook, current-target details, setup form). Use `MediaModalTargetSummary` as the selected candidate.
- Verification: Adjusted fix. Use plain provider branches rather than the lane's render-slot design, which adds structure.

**6. L4-01: mapping-list builder twins.**
- Problem: `buildSonarrGroups` and `buildRadarrGroups` are identical apart from the ID parser and field name. The same goes for `sonarrMeta` and `radarrMeta`. `composeRow` is typed `| null` but never returns null, so three callers handle a case that can't happen.
- Fix: one `buildGroups(provider, …)` and one `providerMeta(provider, item)`. Drop `| null` and the dead branches. This saves about 120 lines; moving list composition to its own file is optional.
- Verification: Verified with a normalized diff.

**7. L8-01: options-defaults twins.**
- Problem: the clone, initial-value, key and equality helpers, the draft state, save and footer logic are all duplicated. Only the provider field rows differ. The file also fails Prettier with mixed indentation.
- Fix: one `ArrDefaults` component that owns the draft, save and footer, and takes the provider-specific rows as `children`, or branches on `provider`. Use no generics and no render-prop API. This saves about 200 lines.
- Verification: Adjusted fix (simpler shape). Duplication verified: 89 of about 660 lines differ.

**8. L6-02: mapping-panel twins.**
- Problem: after normalization, 78 lines differ across 232 + 182 lines. Only `buildCandidate`, `getLibraryLabel`, the lookup hook and the placeholder really differ.
- Fix: one panel. Keep a small per-provider `toSummary` function.
- Verification: Verified.

**9. L4-02: RPC status twins.**
- Problem: `get*LibraryStatusForRpc`, `get*StatusFromMappingAndLibrary`, `resolve*Mapping`, `buildMapped*Status` and `unmappedMapping` are copies. `getProviderConfig` is read twice per status RPC (`sonarr.handlers.ts:201` and `:225`).
- Fix: `docs/decisions.md` keeps the handler entry points separate on purpose, but it also says to share code "through plain values where behavior is identical." So share one pure status-resolution helper and `unmappedMapping`, keep the handler objects separate, and pass credentials down once.
- Verification: Adjusted to respect decisions.md. The lane's drift example (`validateTmdbId`) is in dead code (L9-05), so it was dropped.

**10. L6-08: silent mapping-action failures.**
- Problem: `resetMapping`, `ignoreTitle`, `rejectCandidate` and `clearRejectedCandidate` call `mutateAsync` with no catch. The footer fires them with `void onX()`. There is no global mutation `onError`, so a failure shows nothing and leaves an unhandled rejection.
- Fix: wrap them in the same try/catch that `applyMapping` uses to set `actionError`.
- Verification: Verified.

**11. ORCH-01 (+L6-13): formatter not enforced.**
- Problem: `prettier --check src` fails on 150 files. `.editorconfig` says tabs, yet about 37 files use 2-space indentation (several also use single quotes). lint-staged runs only `eslint --fix`. AI edits then produce noisy diffs.
- Fix: add `prettier --write` to lint-staged, then run one formatting-only commit.
- Verification: Verified.

**12. L4-05.**
- Problem: `buildSeerrLinkedEntry` and `buildLinkedAniListEntries` map an entry field by field in the same way. `GetMappingInspectionInput` is declared in both `rpc/types.ts` and `rpc/mapping-inspection.ts`, and aliased in `query-keys.ts`.
- Fix: one `toLinkedEntry` and one type. Verified.

**13. L4-06.**
- Problem: the `onInstalled`, `onStartup` and alarm handlers repeat the init → warm → ensure-alarm sequence in slightly different orders. `shouldWarmMappingsCache` repeats `hasAnyConfiguredConnection`.
- Fix: one local `wake()` and one exported predicate. Verified.

**14. L3-05.**
- Problem: `buildMatchedTarget` fetches TV details before it infers a season. Details are only needed to validate that season, and a details error blocks an otherwise valid show-only match.
- Fix: infer the season first. Verified.

**15. L3-06.**
- Problem: consolidation accepts any row with a parseable `linkedAniListId`, while normal reads use `isUpstreamMappingRecord`.
- Fix: use the same guard. Spot-checked: the guarded reader exists at `upstream.store.ts:198-207`; the consolidation path was not traced.

**16. L6-03.**
- Problem: the `result` field on the candidate types has no reader, and `tvdbId`/`tmdbId` duplicates `summary.providerId`.
- Fix: delete them. Verified (`rg "\.result"` finds nothing in the folder).

**17. L7-01.**
- Problem: about 30 lines of `CardOverlay` props are duplicated. For the `status-column` and `action-row` presentations the `openProvider` rule gives the same result in both paths.
- Fix: one render path. Adjusted effort from M to S.

**18. L8-02.**
- Problem: the two page files differ only in label, port placeholder and defaults component. `DEFAULT_OPTIONS_DESCRIPTION` is also duplicated.
- Fix: one `ArrPage`. Verified.

**19. L4-04.**
- Problem: every mapping handler bumps the revision, and every mapping hook also invalidates in `onSuccess`/`onSettled`. `invalidateAfterMappingChange` is a subset of `invalidateAfterMappingsRevision`.
- Fix: delete the hook-side invalidation and its test case. Keep the Seerr-request and Arr `onSuccess` handlers, because those writes don't always bump. Verified, medium confidence.

**20. L3-02.**
- Problem: `setAutoResult` and `setSeerrAutoResult` call `clearSlot` before they check `unmapped`. Because `tmdbMovie` is shared by Radarr and Seerr, a forced Seerr retry that finds nothing erases Radarr's automatic movie mapping.
- Fix: decide the intent. If a miss should only record an attempt, move `clearSlot` below the `unmapped` early return.
- Verification: Adjusted from high to medium impact and confidence. The path is reachable only on forced retry, and resetting the shared fact on a miss may be intended.

**21. L2-01.**
- Problem: `sonarr/library.ts` and `radarr/library.ts` differ in 61 of about 370 lines. Both `upsert*Snapshot` functions read the snapshot, await the write, and only then update memory. Two overlapping upserts therefore drop one change.
- Fix: one cache-mechanics module with a per-scope write chain. Keep the separate instances and namespaces that decisions.md requires. Verified.

**22. L5-02.**
- Problem: the observer watches `body` with `subtree`, `characterData` and `attributes`. It coalesces to one scan per frame, but each scan reparses every card, including after mutations inside the extension's own portals. `targetsEqual` prevents re-renders, so the cost is CPU only.
- Fix: skip mutation records whose target is inside an `a2a-` container, and consider dropping `characterData`. Verified.

**23. L6-04.**
- Problem: `canSubmitSetupForm`, `getPathPreview`, `isRecord` (also in `helpers.ts:7`), `readProviderFolderName`, `canShow*Setup` and `get*SetupStatusNotice` are duplicated. `get*AddDefaults` are one-line wrappers.
- Fix: move the identical helpers into `setup/` and inline the wrappers. Verified (64 and 70 diff lines).

**24. L3-03.**
- Problem: terms are emitted in priority order and then sorted anyway. The query is normalized once per candidate. Two flags have no reader. The full list is sorted just to take `[0]`.
- Fix: single pass, best-so-far selection. Spot-checked (`toSorted` then `[0]` at `:899-901`).

**25. L3-04.**
- Problem: a single-ID manual lookup reads legacy local and sync keys and normalizes every record.
- Fix: point-read the current store first. Spot-checked.

**26. L2-03.**
- Problem: the details decoder merges season rows field by field, but the status decoder lets a later row without `status` overwrite an earlier one. The UI can then show "available" while the status says "not requested".
- Fix: merge the rows once. Spot-checked.

**27. L6-05.**
- Problem: four copies of the root-folder, quality-profile and tags block, including a hand-rolled `v.parse` in each.
- Fix: one `ArrCommonFields`. Spot-checked.

**28. L6-06.**
- Problem: `SourceCard`, `joinMetaLine`, the banner/close/grid frame and the class constants exist in both the Arr and Seerr headers. `seerr-modal.constants.ts` holds shared values under a Seerr-only name.
- Fix: export them from `chrome/`. Spot-checked.

**29. L4-07 (+L9-03).**
- Problem: an 80-line hand-written `Ani2arrApi` mirrors the handlers. About 10 rename-only DTO aliases exist, and `SeerrTargetWithEvidence`/`SeerrRequestTarget` duplicate `SeerrTarget`/`EffectiveSeerrTarget`.
- Fix: `type Ani2arrApi = typeof apiHandlers` (type-only import) and delete the aliases. Spot-checked; confirm the type-only import doesn't pull handlers into content bundles.

**30. L4-08.**
- Problem: the library revision is bumped by a constructor callback, a per-call `onCacheChanged`, and manual bumps in the handlers.
- Fix: bump only from the library when it reports `changed`. Verified.

**31–53 (low impact).** The table holds the evidence. Notes:
- L9-05: both validate RPCs have zero callers outside their definitions.
- L1-01: impact lowered from medium to low. The hook imports no domain code; only its host-name map is site-specific. Move it to `content/core`.
- L1-02/L9-06: remove the Playwright plugin and blocks and `eslint-plugin-testing-library` (no test imports `@testing-library`). **Keep** `eslint-import-resolver-typescript`, because the `import-x` TypeScript preset configures it.
- L4-10: move `revision-signals.ts` to `background/`, not `shared/`, because it imports `Provider`.
- L2-02 and L2-04: impact lowered to low. Both need an unusual server condition (a body that stalls after the headers) or cost one cheap GET.
- L6-11 is a product trade-off, so it's your call.
- ORCH-02: AGENTS.md is ambiguous here ("Do not require duplicated file-path comments"), and 229 files have path headers that go stale on rename. Delete them in the Prettier commit.
- ORCH-03: `eslint-plugin-import-x` is already installed. About 20 lines of `import-x/no-restricted-paths` zones would enforce the rules in section 6 instead of leaving them as prose. The code already complies, so the rule is cheap to add.

### Contradictions resolved

- **decisions.md "keep RPC handlers separate" vs L4-02 "merge them":** keep the handler objects separate and share only the pure status helper, which decisions.md allows for identical behavior.
- **L4-10 "move `revision-signals` to `shared`" vs AGENTS.md "shared has no domain knowledge":** the file imports `Provider`, so `background/` is the right home.
- **L6-01 and L8-01 render-slot or generic designs vs the "less code" goal:** use one component with plain `provider` branches. Slots and generics would add API surface for two callers.
- **L1-01 (medium) vs L9-04 (low)** for the same theme-hook move: low. Nothing breaks today.

## 6. AGENTS.md review

Measured import graph (non-test, `@/` imports):
- `features` imports `providers` 97 times and `rpc` 31 times.
- `options-page` imports `settings` 12 times.
- `content` imports `rpc` 7 times.
- `settings` imports `providers` 18 times.
- `mapping` imports `providers` 17 times and `anilist` 14 times.

No UI file imports a client, store, `background` or `rpc/handlers`. `providers` imports only `shared`. `shared` imports nothing. The diagram `features/options-page/content -> queries -> rpc` therefore describes neither the code nor the rule that actually holds.

| Section / rule | Verdict | Reason |
|---|---|---|
| "Use global base skills when relevant." | Delete | Changes nothing. |
| Project Shape (AniList/AniChart) | Rewrite | Omits MyAnimeList, a first-class source. |
| Skills list (6 skills) | Rewrite | `boring-architecture`, `code-simplicity-review` and `small-code` overlap each other and the code rules. Keep 3 and add the React Compiler note (66 redundant memo hooks). |
| Review/explain/diagnose is read-only | Keep | Changes agent behavior. |
| State Goal / Non-goals / Done when | Keep | Cheap and useful. |
| Inspect callers, canonical types, active plans, dirty worktree | Rewrite | No "active plans" exist; point to `docs/decisions.md` and the mapping README instead. |
| No wrapper/helper/type/prop/file without need | Rewrite | Ignored (L8-04, L4-05 deps, L6-10). The real failure mode is copying files per provider, which the rule doesn't cover. |
| No internal compatibility shims | Merge into the LEGACY rule | Same topic. |
| Plain English / concrete examples | Delete | Communication style, already in the global AGENTS.md. |
| Test only critical behavior | Keep, merge, make concrete | Duplicated by "Keep tests focused". Name what not to test (L4-11). |
| Commands | Rewrite | Add `pnpm compile` and Prettier, which is otherwise never run (ORCH-01). |
| KISS / YAGNI | Delete | Generic, and duplicates the wrapper rule. |
| Purpose comment / file-path comments | Rewrite | The wording is confusing and 229 files carry path headers. State "no path headers". |
| `LEGACY:` marker | Rewrite | Only 4 markers exist. `mapping/migrate.ts` and the bootstrap migration have none. Say which legacy code is permanent (manual-store decoder). |
| No barrel exports | Keep | Followed (0 barrels). Short. |
| Read functions must be pure | Rewrite | Vague. Cache getters deliberately refresh, and `parse*` functions write the DOM (L5-03). Make it concrete. |
| Do not persist derived UI state | Rewrite | `settings/store.ts` deliberately persists public connection status; name that exception. |
| Flat discriminated unions | Keep | Followed and useful. Add an example. |
| Keep tests focused | Delete | Duplicate. |
| Ownership list | Rewrite | `mapping` is "AniList ID → provider", but MAL sources and aliases live there too. `shared` needs a clear line on site-specific code. |
| Allowed / forbidden flow | Rewrite and enforce | The diagram is wrong (see above). Replace it with the rules that actually hold, and enforce them with `import-x/no-restricted-paths` (ORCH-03). |
| "If one file answers multiple domain questions, split it" | Rewrite | Vague. Use a size-and-jobs cue. |
| (missing) Sonarr/Radarr sharing rule | Add | Would have prevented about 2,500 duplicated lines. |
| (missing) pointer to `docs/decisions.md` and `src/mapping/README.md` | Add | These hold settled decisions that agents keep relitigating. |

### Proposed replacement `AGENTS.md`

```markdown
# ani2arr agent notes

WXT browser extension (MV3 Chrome, MV2 Firefox) that adds Sonarr, Radarr and
Seerr actions to AniList, AniChart and MyAnimeList pages.

Read before changing mapping or provider-sharing behavior:
- `docs/decisions.md`: settled decisions, including the anti-churn rule.
- `src/mapping/README.md`: mapping source of truth.

## Skills

- `wxt-browser-extension` for entrypoints, background, content scripts, storage,
  messaging and manifest work.
- `react-best-practices` for React UI. The React Compiler is enabled: do not add
  `useMemo`/`useCallback` just for memoization.
- `context7` for current dependency docs; do not rely on training data.

## Working method

- Review, explain and diagnose requests are read-only unless editing is asked for.
- For non-trivial work, state Goal, Non-goals and Done when.
- Before moving code across folders, check current callers with `rg` and the
  dirty worktree.

## Commands

- Format and lint touched files:
  `pnpm exec prettier --write <files> && pnpm lint:target <files>`
- Type check: `pnpm compile`
- Focused tests: `pnpm test <files-or-patterns>`
- Broad changes: `pnpm validate`

## Code rules

- Add a wrapper, helper, type, prop or file only when a second caller or a real
  boundary needs it today. Inline functions that only rename arguments.
- When Sonarr and Radarr code differs only by names, ID type or a few fields,
  keep one implementation with a `provider` parameter and branch on the
  differences. Do not copy a file per provider. Library cache instances and RPC
  handler objects stay separate (see `docs/decisions.md`); their shared logic
  does not.
- Split a file over ~300 non-test lines when it does more than one job.
- Parsers, selectors and store reads must not write storage or the host DOM.
  Cache getters may start a background refresh.
- Do not persist state that can be derived. Exception: public connection status
  in `settings/store.ts`, which lets content scripts see status without
  credentials.
- Prefer flat discriminated unions, e.g.
  `{ kind: "mapped"; providerId } | { kind: "unmapped" }`, over parallel enums or
  wide optional bags.
- Migration and compatibility code carries `LEGACY: <removal condition>`. The
  manual-mapping legacy decoder is permanent while direct upgrades from those
  releases are supported. Do not add other compatibility shims unless asked.
- No barrel files. No `// src/path` header comments; a one-line purpose comment
  is fine.
- Tests only for behavior with real regression risk: stores, mapping selection,
  resolvers, DOM parsers, races. Do not assert option literals, stale times or
  exact invalidation key lists.

## Ownership

- `anilist`, `myanimelist`: source IDs, API clients, metadata, caches.
- `mapping`: source identity (AniList or MAL) to provider ID records, stores,
  precedence and automatic resolvers.
- `providers`: Sonarr, Radarr and Seerr clients, schemas, IDs, library caches.
- `settings`: persisted options and provider connections.
- `background`: service wiring, lifecycle, refresh, reset, revision signals.
- `rpc`: RPC client, DTO types and handlers that compose background services.
- `queries`: React Query hooks over the RPC client and the settings snapshot.
- `content`: page detection, DOM parsing, injection, portals, host theme.
- `features`: modal, overlays, provider actions, mapping UI.
- `options-page`: options UI only.
- `shared`: generic utilities and UI primitives; no site- or provider-specific
  logic.

## Import rules (enforced by `import-x/no-restricted-paths`)

- `shared` imports nothing from other `src` folders.
- `providers` never imports `mapping`, `rpc`, `background` or `queries`.
- `mapping` may import provider ID schemas and types, never provider clients or
  library caches.
- `features`, `options-page` and `content` never import provider clients,
  stores, `background` or `rpc/handlers`. They read data through `queries`, may
  call the RPC client directly for one-shot commands, and may import pure types
  and helpers from domain folders.
- `queries` never imports provider clients; its only direct storage read is the
  settings snapshot.
```

Note: the proposal moves revision signals to `background` (L4-10) and host theme detection to `content` (L1-01). Apply it together with those two moves, or adjust those two lines.

## 7. Looks fine (combined from all lanes)

- **MV3 lifecycle:** listeners are registered synchronously, the alarm persists, state lives in storage with memory only as a cache, and the 15 s library debounce stays under the idle limit.
- **Ownership:** no provider→mapping/RPC imports, no UI→client/store imports, no queries→client imports, and `shared` has no `src` imports.
- **Mapping store split:** manual, upstream and automatic stores with per-value precedence; the different writers and lifetimes justify it.
- **AniList client:** request coalescing, rate-limit handling and retry tests are worth keeping. The MyAnimeList (Jikan) client and queue are small and clear.
- **Providers:** Arr clients share transport while keeping endpoints explicit. Seerr session and CSRF handling are rightly separate. The library contract tests (server isolation, coalescing, reset mid-refresh) are valuable.
- **RPC:** `mapping-validation.ts`, `handlers/index.ts` and the thin handlers (provider, options, anilist, maintenance, myanimelist) are fine.
- **Background:** `provider-candidate-search`, `provider-config`, `connection-workflows` and `mapping-refresh` are single-purpose.
- **Content:** React roots, observers and portal containers have explicit cleanup. Large anime-page and overlay components hold real provider-specific composition.
- **Media modal:** the Seerr half (`seerr-selection`, request and change-target views, connection recovery) is sound, and so is the folder layout. Reducing duplication, not flattening, is the lever.
- **Other features:** the Sonarr/Radarr action hooks already share their workflow, the viewport observer is shared, and Seerr action-state derivation is small.
- **Options UI:** the Seerr and Arr connection forms differ enough to stay separate. `seerr-connection-actions.ts` is a coherent state machine. The mapping page pieces are small and pure. The Seerr form and state tests cover fragile logic.
- **Settings and shared:** settings persistence has one owner, the TTL cache is generic, and entrypoint wiring is thin.
- **Tests:** `query-keys.test.ts`, setup-values tests, `anilist-modal-data.test.ts` and `seerr-selection.test.ts` cover real regression risk.

## 8. Rejected findings

No whole finding was rejected. These sub-claims were filtered out:

- **L9-06:** "`eslint-import-resolver-typescript` is never configured." Rejected: the `import-x` TypeScript flat preset sets `import-x/resolver: { typescript: true }`.
- **Orchestrator:** "`@typescript-eslint/parser` is redundant." Rejected: the `import-x` TypeScript preset names it in `import-x/parsers`.
- **L4-02:** drift evidence "`validateTmdbId` checks differ from Sonarr's." Dropped: both methods are dead (L9-05).
- **L4-10:** "move `revision-signals.ts` to `shared`." Rejected: it imports `Provider`, which is domain knowledge. Use `background/`.
- **L6-01 and L8-01:** the render-slot and generic `ArrDefaultsDraft<T>` designs. Rejected as over-correction; replaced by one component with plain `provider` branches.
