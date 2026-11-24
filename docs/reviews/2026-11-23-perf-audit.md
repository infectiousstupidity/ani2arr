# ani2arr performance audit — 2026-11-23

Baseline commit: `50372dd`. Changes are uncommitted.

## How the numbers were taken

- `pnpm perf` runs the timing harnesses in `perf/` (separate vitest config, not part of `pnpm test`).
- Storage reads in the harness return a `structuredClone` of the stored value. Real `storage.local.get`
  also returns a freshly deserialized copy on every call; fake-browser returns live references.
- Dataset: the real AniBridge v3 `mappings.min.json` (9.36 MB raw → 30,329 parsed records, 3.2 MB
  stored). Put it at `/tmp/a2a-perf-data/mappings.min.json` or set `A2A_ANIBRIDGE_FIXTURE`; without it
  the harness uses a synthetic dataset of similar shape.
- "Fresh worker" = a new module graph per run (`vi.resetModules()`), i.e. an MV3 service-worker wake.
- Times are from one developer desktop. Expect 3–5× on a slow laptop. Real-browser IPC, layout and
  paint are not measured here; see "Needs a browser" below.

## Ranked candidates

Ranked by user-visible cost × how often it runs.

| # | Candidate | Runs | Before | After | Status |
|---|---|---|---|---|---|
| P1 | Every status RPC decoded the whole AniBridge snapshot, the manual store (4 local + 2 sync keys), the auto store, and settings (twice) from `storage.local` | per visible card | 50-card batch: **3.77 s** (warm worker), **3.26 s** (fresh worker); 10 storage reads per RPC | **0.91 ms** (warm), **67 ms** (fresh); 0 storage reads per RPC | fixed |
| P8 | Every automatic result re-serialized the whole auto store 3–4× and wrote it, which broadcasts old+new to every tab with a `storage.onChanged` listener (each AniList/AniChart/MAL tab) | per resolved card | 50 results **631 ms** background CPU; 150 results → **150** writes. Each broadcast ≈ **3 ms** main-thread decode per tab at 1,500 records, **12 ms** at 5,000 | **192 ms**; 150 results → **1** write | fixed |
| L4-03 | Revision bump after automatic results invalidated every card's status in every tab | ≤ 1/s during resolve bursts (after `19f686c`) | **101** RPCs per tab per bump with 100 cards visible (**201** with Seerr) | **3** (**5** with Seerr) | fixed (scoped bump) |
| P2 | Worker wake: `migrateMappingStorage` decoded upstream twice, manual/auto twice, walked every upstream record to build MAL aliases | every MV3 wake | **169 ms** | **72 ms** (one upstream decode, then reused by status calls) | fixed |
| P4 | Anime page background work (identities + status) | per anime page | fresh **126 ms**, warm **148 ms** | fresh **58 ms**, warm **0.16 ms** | fixed by P1 |
| P5 (L5-02) | Browse observer rescanned every card on any body mutation, including overlay portal renders, tooltips, and host changes outside cards; scans rewrote unchanged attributes | per mutation frame | each overlay re-render → 1 full scan; mount → 2 scans; scan **1.80 ms** (50 cards) / **4.27 ms** (200 cards) in happy-dom | overlay re-render → **0** scans; mount → **1**; scan **0.30 ms** / **0.91 ms** | fixed |
| P3 (L9-01 rest) | Identities query keyed by the whole visible ID set: each scroll batch re-sent every ID and briefly cleared every card's identities, flipping some cards to the wrong provider | per scroll batch | append 50 → **100** IDs sent, **61** RPCs (10 wasted wrong-provider status calls) with a 200 ms identity response | **50** IDs, **51** RPCs (0 wasted) | fixed (per-ID queries, batched loader) |
| L3-04 | Manual point lookups read legacy keys and decoded the full store | per lookup | part of P1 | decoded once per worker | fixed with P1 |
| L3-05 | Seerr resolver fetched TV details before knowing a season was needed | per Seerr TV resolve | 1 extra Seerr request per TV match | 0 unless a season is inferred | fixed |
| L2-04 | Tag resolution fetched all tags even with no new labels | per add/update | 1 extra Sonarr/Radarr GET | 0 when no new labels | fixed |
| L9-01 | Identity lookups cloned the whole dataset | per batch | fixed on HEAD (`50372dd`), but still decoded 3 stores per call (**78 ms**) | **0.36 ms** | fixed with P1/P3 |
| P6 | Status is one RPC per card (no batching) | per visible card | 51 messages per 50 cards (101 with Seerr) | unchanged | skipped: see below |
| P7 | Content-script size / eval | every page load on 3 sites | 716–741 KB raw, ~225 KB gzip; ~13 ms compile (node `vm.Script`) | 722–747 KB raw, ~230 KB gzip | skipped: see below |

## Skipped, with reasons

- **P6 status batching.** Background work per status call is now microseconds, so a batch would only
  save per-message IPC overhead, which cannot be measured outside a browser. A batched response also
  waits for the slowest item: an unmapped card can spend seconds on AniList and Sonarr lookups, so fast
  cards would show "checking" until the slowest card in their batch finished. That is a user-visible
  regression for an unmeasured gain.
- **P7 bundle split.** About 40% of each content script is the media modal and its Radix deps, which
  only load on click. WXT builds content scripts as single IIFE bundles, so lazy-loading needs a
  web-accessible ESM chunk sharing React with the IIFE: a build restructure with real breakage risk.
  Measured compile cost is ~13 ms per page on this machine; needs a browser trace to justify it.
- **Text changes inside cards still rescan.** One rescan costs ≤ 1 ms for 200 cards (happy-dom) after
  P5; incremental per-card parsing is below the 5% threshold.
- **AniList metadata store.** Per-ID IndexedDB gets run one at a time, but only for IDs missing a format
  (usually 0–1 per page). Its wake work is a 225-byte manifest fetch and one IndexedDB read.
- **Anime-page `waitForElement` and layout observers.** Three body observers live only until the
  elements appear; the anchor keeper watches the hero subtree only. No measurable cost here.

## Behavior changes

- Automatic results reach `storage.local` up to 1 s after they are computed (write-behind). The
  background reads the pending state, so nothing in the extension sees stale data. If the browser
  crashes inside that second, those results are re-resolved later. Clears and resets write immediately.
- Automatic revision bumps now refetch only the changed AniList entries in AniList/AniChart tabs.
  MAL-keyed cards, manual edits, upstream refreshes and connection changes still refresh everything.
- Browse cards whose mapping identity is still loading show "checking" and wait to fetch status, instead
  of fetching by format and possibly switching provider a moment later.
- The Seerr resolver no longer fails a show-only match when the TV-details request fails and no season
  was inferred.

## Risks noted

- AniBridge raw payload is 9.36 MB; `MAX_ANIBRIDGE_BYTES` is 10 MB. Refreshes will start failing when
  upstream grows ~7%.
- MV3 `storage.local` quota without `unlimitedStorage` is 10 MB; upstream alone is 3.2 MB stored.

## Needs a browser

See the final report for capture steps (worker wake, browse scroll trace, cross-tab broadcast cost).
