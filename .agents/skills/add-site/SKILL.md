---
name: add-site
description: Add or repair ani2arr website integrations, including browse overlays and anime detail actions. Inspect real rendered HTML, identify anime reliably, choose existing UI components, implement a small site adapter, and validate in browsers.
---

# Add or repair a supported site

Input: website URL and requested page types (browse, detail, or both). If repairing, include the failing surface. Do not expand scope to unrelated surfaces. For research-only requests, stop after the implementation plan; do not edit code.

Follow root AGENTS.md and relevant global skills. Read the current source, not a cached copy of this workflow's examples. Reuse existing implementation and review workflows; additional agents are optional.

## 0. Preflight

- Record the starting commit and dirty worktree; preserve unrelated changes.
- State goal, non-goals and done conditions. Identify requested URLs and candidate variations. Do not assume all pages on a domain are supported.
- Read [browser.md](references/browser.md) for browser access, commands, safety and test profiles. Confirm ability to inspect rendered DOM and screenshots, not just accessibility snapshots.
- Check website terms, permitted API access, authentication and restrictions before automating. Do not bypass blocking or access controls.
- Use [evidence.md](references/evidence.md) as a compact task-local record; store sanitized artifacts outside the tracked tree unless a minimal fixture is needed in tests.
- If browser access or a necessary permitted identity source is missing, report the blocker. Continue only with independently verified surfaces; do not invent DOM evidence.

## 1. Discover each requested surface

For each distinct layout, including list/grid variants when in scope:

1. Open a representative URL. Capture a screenshot before changes, including surrounding host controls; inspect the rendered DOM and computed styles.
2. Record the precise URL predicate, card/root selector, actual title/ID/format/poster sources, and proposed mount element. Capture a small real HTML sample and selector counts. Check unrelated or nested links are excluded.
3. Sample representative TV, movie, sequel/split cour, OVA/ONA/special, repeated entries and missing-ID cases when available. Check actual IDs against authoritative links/data, not just titles.
4. Determine whether navigation reloads the document or is client-side. Exercise filters, sorting, pagination, infinite scrolling, card replacement and display modes that exist. Note whether the root is replaced, nodes are reused, or identity changes without href/text/child mutations.
5. Inspect only relevant embedded data or permitted network responses when DOM links are insufficient. Do not collect account details or full private pages.

## 2. Decide identity and placement before coding

### Identity

Read `src/mapping/source-identity.ts`, `src/content/browse/types.ts`, `src/content/browse/browse-overlays.tsx`, and the relevant ID parsers in `src/anilist/types.ts` and `src/myanimelist/{types,url}.ts`.

- Prefer explicit, validated AniList IDs; otherwise use explicit MAL IDs. Validate host, route, positive numeric IDs and link agreement. Never treat a site slug or internal ID as an AniList/MAL ID.
- If IDs are absent from cards, inspect accessible page data, then documented/permitted identity sources. A slug is a discovery key, not a new persistent mapping namespace.
- MAL-to-AniList crosswalks may be missing or ambiguous. Preserve existing MAL behavior; do not claim cross-site consistency without a confirmed link. If both external IDs disagree with authoritative evidence, skip the card until resolved.
- Title, year and format can help investigate ambiguity but are not sufficient to silently choose an identity. Never strip sequel/cour distinctions for identity matching.
- Unknown format: use null and existing metadata/routing behavior; do not assume TV or guess MOVIE. Skip unsupported music entries as appropriate. Check unresolved MAL identities with unknown format explicitly.
- The browse parser is synchronous. No fetches, timers or async mutations inside parseCard. If permitted external lookups are genuinely necessary, plan the smallest separate lookup mechanism with deduplication, bounded concurrency, failure/expiry handling, stale-result protection and appropriate background RPC/permissions. Demonstrate the contract limitation before changing shared code. Never silently fall back to an unrelated title match.
- Verify coverage on representative pages; report how many cards are identifiable and how many are skipped. If safe identity resolution is impossible, do not attach actions to those cards.

### Placement

Choose an existing presentation: poster overlay (default), action-row, or status-column. For detail pages use the existing ContentRoot, optionally compactActions. Inspect mount size, positioning context, overflow, stacking, nearby host controls, score/title/episode badges, hover/focus and narrow layouts. Keep native card clicks functional. Prefer a dedicated non-interactive mount region where possible; check event handling if the target is a link.

BrowseAdapter supports top-left/bottom-left and up/down stacking at adapter level. Prefer one active browse shell per document with a stable configuration, or prove safe teardown before switching layouts. Do not start concurrent browse shells: current cleanup is document-wide. Only extend the contract if real layout evidence requires it.

**Implementation gate:** for each surface record URL scope, verified selectors/HTML, an authoritative identity method, format source, placement and lifecycle behavior, expected coverage, and before screenshot. If a critical field is unverified, mark that surface blocked; do not implement guessed selectors or identity. Proceed with verified surfaces only; a partial implementation is not complete support.

## 3. Implement the smallest integration

Use these existing files as the source of truth:

| Need | Read / reuse |
| --- | --- |
| Card contract | `src/content/browse/types.ts`: BrowseAdapter, HostMediaTarget |
| Browse composition | `src/content/browse/create-browse-entrypoint.tsx`, BrowseOverlays in `browse-overlays.tsx` |
| Discovery, placement and teardown | `src/content/browse/use-browse-card-targets.ts` |
| Overlay UI, actions and modal | `src/content/browse/browse-card-overlay.tsx`, `src/features/media-overlay/`, `src/features/media-modal/` |
| Detail page | `src/content/anime-page/root.tsx`: AnimePageTarget, ContentRoot |
| Content lifecycle | `src/content/core/create-content-script-shell.ts` |
| Identity and provider routing | `src/mapping/source-identity.ts`, `src/content/target-provider.ts`, `src/content/browse/browse-card-provider.ts` |
| Format labels | `src/shared/types/anime-format.ts`: parseAnimeFormatLabel |
| Settings, queries and RPC | existing `src/settings/`, `src/queries/`, `src/rpc/` boundaries; do not duplicate |

Reference implementations:
- `src/content/anichart/browse/` + `src/entrypoints/anichart.content.tsx`: simple AniList-ID browse adapter.
- `src/content/myanimelist/browse/`: MAL IDs, multiple card layouts, status/action rows and scoped URL predicates.
- `src/content/anilist/browse/` + `src/entrypoints/anilist.content.tsx`: SPA-aware browse/detail startup.
- `src/content/myanimelist/anime-page/`: compact detail actions and DOM readers.
- `src/content/anilist/anime-page/`: dynamic detail placement and cleanup.
- `src/entrypoints/myanimelist.content.tsx`: initial-URL dispatch only; use this pattern only when full document navigation is verified.

Typical structure (create only needed files):

    src/content/<site>/browse/adapter.ts
    src/content/<site>/browse/adapter.test.ts
    src/content/<site>/browse/index.tsx
    src/content/<site>/browse/style.css
    src/content/<site>/browse/surface.ts       # if URL logic merits its own file
    src/content/<site>/anime-page/layout.ts    # if requested
    src/content/<site>/anime-page/index.tsx
    src/content/<site>/anime-page/layout.test.ts
    src/entrypoints/<site>.content.tsx

Rules:
- Return existing HostMediaTarget objects or null; include the actual mount element. Use a single physical card instance per mount, not one overlay per anime ID or per link.
- Reuse the browse shell, shared overlay CSS and existing detail root. Namespace site CSS to observed card/mount selectors; check shared hover rules that depend on .media-card. Do not copy entire overlay CSS or invent new UI.
- Add narrow WXT matches and explicit surface eligibility. Honor all existing provider visibility/enabled settings. For SPA navigation, start the needed shells or use a verified equivalent; handle back/forward and unsupported pages. Do not copy initial-URL-only dispatch blindly.
- Prefer a stable observer root and scoped scan root. Shared discovery observes href/text/child changes, not arbitrary class/data/image changes; signatures do not include all parsed fields. Reproduce a missed update before changing observation or equality. Never introduce a second independent observer/poll loop when existing lifecycle suffices.
- Async work must respect invalidation and current identity. Clean up created nodes, attributes, listeners, styles and observers. Use existing cleanup markers for created mount elements where applicable.
- Do not modify mapping precedence, provider clients, storage, routing, modals or query architecture for convenience. No generic registry, generator, plugin framework or new dependency without demonstrated need. Shared fixes must have a focused regression test and be explained separately.
- Review generated manifests for Firefox and Chromium. Add only required origins/permissions, and only permitted background requests. Update README, package/locale descriptions, PRIVACY.md and store-facing text when their claims change. Do not change release version or publish.

## 4. Verify

Use the browser procedures in [browser.md](references/browser.md) and record results in [evidence.md](references/evidence.md).

- Add focused Vitest/happy-dom tests using sanitized minimal markup from real layouts. Assert correct ID, format, mount and rejection of malformed/conflicting IDs, missing title/mount and unrelated links. For detail pages assert relevant anchor/data and URL behavior. Fixtures must not contain live scripts or private data.
- Exercise relevant existing shared tests, including dynamic mount replacement/cleanup and routing when those paths change. Use existing provider mocks for write behavior; never submit a real add/edit/request to test.
- Test actual built extension in isolated Chromium and Firefox where available. Capture after screenshots at normal and narrow widths, including hover/expanded or focused UI. Verify correct IDs, repeated cards, provider routing, shared status for confirmed crosswalks, native clicks, navigation, settings toggle, missing IDs and no duplicate/stale mounts. Check console and relevant request counts; no request per rescan or per duplicate card.
- With no real provider configured, check configuration UI; use a disposable/mock provider for library state, add/edit/request and failure behavior. Clearly distinguish mocked from observed results. Do not use live server credentials.
- Run `pnpm lint:target <changed-ts-files>`, `pnpm compile`, focused `pnpm test <paths>`, `pnpm validate` (audit, lint, compile, all tests, both builds). Skip the first command if no TS files changed. Record failures rather than claiming success. Check manifest content scripts match only intended hosts.
- Smoke-check a representative existing site in addition to shared automated tests. If a browser or permitted live site is unavailable, use an approved fixture/manual evidence where possible and report the remaining test as BLOCKED, not PASS.

## 5. Review and finish

- Review the diff against scope and the implementation gate; remove speculative code. Ensure no evidence files, browser profiles, credentials or unrelated changes are staged.
- Report each surface as PASS, FAIL, BLOCKED or NOT APPLICABLE for each applicable acceptance check, with evidence. A surface is fully verified only when its required checks pass; no false completion.
- Summarize supported URLs, identity coverage, placement, limitations, commands and results, evidence paths and any shared changes.
- If implementation and a commit were requested or implied by the repository workflow, commit only scoped changes using a conventional commit; report SHA. Do not merge, publish or push to another branch without authorization. Update a linked issue only if requested and reflect actual status.
- For a fresh-session trial of this skill, record human interventions, incorrect assumptions, missed checks, unnecessary edits and what blocked execution. Change instructions or tooling only for demonstrated problems.
