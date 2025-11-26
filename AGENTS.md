# ani2arr

This file is for AI agents working in this repository.
It defines the extension’s structure, conventions, and operational rules so agents can modify the code safely and efficiently.

## Keep this guide up to date

Treat `AGENTS.md` as the source of truth for structure and conventions.

* When the user requests process/structure changes (e.g., “move all types to `/example/types` instead of `/src/types`”), update this document in the same change.
* Reflect new paths, responsibilities, and checklists; update all path references accordingly.
* Document contract changes alongside code changes so future contributors and agents remain aligned.

---

## 1. Repository snapshot

* Browser extension integrating **Sonarr** into **AniList** and **AniChart** (Chromium + Firefox via **WXT**).
* Stack: **TypeScript (strict)**, **React 19**, **TanStack Query 5**, **Radix UI**, **Tailwind CSS 4**.
* RPC via `@webext-core/proxy-service`; local-only storage via `@wxt-dev/storage`; persistent caching via IndexedDB.
* Domain: map AniList anime → TVDB → Sonarr library; allow quick-add with customizable defaults.

---

## 2. Commands

Run all commands from the project root.

* `npm install` — installs dependencies and runs `wxt prepare`.
* `npm run dev` / `npm run dev:firefox` — starts the WXT dev server with hot reload.
* `npm run build` — creates a production bundle in `dist/`.
* `npm run zip` — builds distributable extension archives.
* `npm run lint` — ESLint 9 with TypeScript config. Must pass clean.

Always run **lint and build** after code edits.
Do **not** ask for confirmation before running these commands.

---

## 3. Entry points (`src/entrypoints/`)

| Path                       | Purpose                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background/`              | Registers RPC services, schedules static mapping refresh, handles readiness pings and message routing. Must contain exactly one `registerAni2arrApi()` call. |
| `anilist-anime.content/`   | Injects the `MediaActions` component into AniList anime detail pages via `createShadowRootUi({ cssInjection: 'ui' })`. Skips movies and music.                  |
| `anilist-browse.content/`  | Adds overlay buttons on AniList browse/search pages using `CardOverlay` + portals. Includes AniList media prefetch. Uses `cssInjection: 'ui'` and imports `@/styles/base.css` + per-entry `style.css` overrides. |
| `anichart-browse.content/` | Adds overlays for AniChart browse pages. Uses `cssInjection: 'ui'` and imports `@/styles/base.css` + per-entry `style.css` overrides.                      |
| `options/`                 | Options page with sidebar routes: Sonarr (connection + defaults), Radarr (placeholder), Mappings & overrides, UI & injection, Advanced. Handles runtime permission requests; Sonarr defaults use `layout="grid"` in options. |
| `popup/`                   | Exists but is not referenced by the manifest.                                                                                                                     |

---

## 4. Core services and modules

### Mapping (`src/services/mapping/`)

* `StaticMappingProvider`: provides cached static payloads.
* `SonarrLookupClient`: inflight dedupe, positive/negative TTL caches, internal concurrency (5).
* Search-term scoring pipeline with bounded depth and early-stop.
* TTLs:
  * Resolved mapping success = 30d soft / 180d hard.
  * No-match (validation) failure = 24h soft / 48h hard.
  * Config/permission/API failure = 30m soft / 60m hard.
  * Network failure = 5m soft / 15m hard.
* Sonarr lookup cache TTLs:
  * Positive = 10m soft / 30m hard (unchanged).
  * Negative (no results) = 24h soft / 48h hard. Manual retries from the overlay bypass caches.
* Mapping overrides: background-resident in-memory map with sync/local storage hydration.
  * Storage keys: `sync:mappingOverrides` (authoritative), `local:mappingOverridesCache` (mirror for hot reads).
  * Shape: `{ [anilistId: string]: { tvdbId: number; updatedAt: number } }`.
  * `MappingService` checks overrides first; overrides are authoritative.
  * Per-ID cache eviction helper used when overrides change.

### AniList API (`src/api/anilist.api.ts`)

* Single-lane queue (concurrency 1).
* Inflight deduplication and 429 `Retry-After` handling.
* Batch size 50.
* Multi-hop prequel traversal.

### Sonarr API (`src/api/sonarr.api.ts`)

* Permission-checked fetch wrapper with retries/backoff on 429.
* All requests authenticate via `X-Api-Key` header. Do not place API keys in URLs.
* Accept CORS preflights; extensions have host permissions to allow these requests.
* JSON requests use `Content-Type: application/json`.
* ETag caching for read endpoints: `series`, `qualityprofile`, `rootfolder`, `tag` using `If-None-Match`/`ETag` with an in-memory cache in the background; cleared on `settings-changed`.

### Library (`src/services/library.service.ts`)

* Lean local Set/Map index of Sonarr series.
* TTL: 1h soft / 24h hard.
* Broadcasts `series-updated` on add/remove.

---

## 5. Query and persistence

* Query keys: `src/shared/hooks/use-api-queries.ts`. Always reuse existing keys.
* IndexedDB persister: `src/cache/query-cache.ts` with strict `shouldPersistQuery` filtering.
* TanStack persistence wrapper: `src/utils/query-persist-options.ts`.
* Guards `DataCloneError` and excludes credential-bearing queries.
* Mapping overrides are persisted via `@wxt-dev/storage` sync storage (no secrets) with a local mirror for fast reads.

---

## 6. UI and component patterns

* **Forms:** `src/shared/components/form.tsx` (Radix). Use `SelectContent` with `container` prop to render dropdowns inside the shadow DOM.
* **Overlays:** `src/features/media-overlay/components/media-overlay.tsx` and `src/features/media-overlay/components/card-overlay.tsx` use `IntersectionObserver` with visibility gating. Browse/AniChart portals attach to site card anchors (page DOM), so those entrypoints inject CSS into BOTH the UI shadow root and `document.head` (concat of `@/styles/base.css` + per-entry overrides). Anime detail UI mounts inside the shadow root and relies on WXT injection only.
* **Settings hooks:**

  * `useExtensionOptions()` = full snapshot (public + secrets)
  * `usePublicOptions()` = public-only (safe for content scripts).
* Cache invalidation via `useA2aBroadcasts` on `settings-changed` and `series-updated`.
* **Media modal:** Split-view layout with `viewMode` (`setup`/`mapping`): left panel swaps between the Sonarr form and mapping search, right panel is a sticky single preview card. The preview’s pencil jumps into mapping; selecting results updates the preview immediately; saving or cancelling mapping returns to setup.

---

## 7. Messages and broadcasts

All messages and broadcasts must include `_a2a: true`.

### Background messages

* `OPEN_OPTIONS_PAGE` — open the options page.
* `a2a:mapping:refresh` — trigger static mapping refresh.
* `a2a:match:score-batch` — compute title match scores.
* `{ type: 'a2a:ping' }` — readiness probe.

### Broadcast topics

* `series-updated` — invalidates series queries and bumps epoch.
* `settings-changed` — clears query cache and bumps epoch.
* Overrides set/clear also broadcast via `series-updated` with `{ action: 'override:set' | 'override:clear' }` for UI invalidation.

---

## 8. Security and permissions

* Credentials are stored only in `browser.storage.local` (never synced).
* Each Sonarr fetch checks `hasSonarrPermission()`; runtime requests use `requestSonarrPermission()`.
* Logger (`src/shared/utils/logger.ts`) redacts sensitive fields. Verbose logs disabled outside dev.
* Do not include credentials in URLs. Headers are preferred and safer for logs/proxies.

Never:

* Write credentials to IndexedDB or persisted TanStack caches.
* Add new host permissions without updating `wxt.config.ts` and following the checklist.

---

## 9. Caching and resilience

* `createTtlCache` stores both `staleAt` and `expiresAt`. Stale reads return cached data while refreshing in background.
* Mapping caches: categorized by result (success, config error, network).
* AniList media cache TTL: 14d soft / 60d hard.
* Library cache TTL: 1h soft / 24h hard.
* Persistent cache namespaces live in `src/cache/namespaces.ts`. Use only these constants.

---

## 10. Coding conventions

* Use `@/*` path aliases. No relative traversals.
* Keep helpers pure in `utils/`; limit side effects to services or hooks.
* Always wrap cross-context RPC calls in `try/catch` and pass errors through `normalizeError()`.
* Use `withRetry()` for all retry logic (in `src/shared/utils/retry.ts`). Do not hand-roll loops.
* Follow strict TypeScript. Do not disable type checking or introduce `any`.
* Keep PRs minimal and consistent with existing naming patterns.

* Favor KISS, DRY, and YAGNI — solve the current problem simply, avoid duplication, and do not build speculative features.
* Prefer well-maintained, reputable libraries over custom implementations; do not reinvent the wheel when a solid package exists.
* Avoid needless complexity or verbosity; write clear, concise, production-grade code only.
* Do not add superfluous comments; let code be self-explanatory and include focused docs only when they add real value.
* Fix problems at the root; never ship hacky workarounds if a proper fix is feasible.
* Keep edits precise and minimal; limit scope and avoid churn unrelated to the change.
* Think holistically about the project; optimize for overall goals and user outcomes, not just local changes.

### File size limits (max LOC per file)

Keep files focused and small. Split concerns early to avoid “god files.”

* Utilities/services (TypeScript): prefer ≤ 400 LOC (excluding imports/exports).
* React components: prefer ≤ 250 LOC (JSX + logic). Extract subcomponents/hooks.
* Mapping/algorithms: may go up to ~500 LOC only if tightly cohesive; otherwise split.
* If a file exceeds these limits, add a follow-up task to split it and note the rationale in the PR description.

### Function and code structure best practices

* Keep functions small (≈ 40–60 LOC) and single-responsibility; avoid deep nesting; use early returns.
* Prefer pure helpers in `src/utils/`; keep side effects confined to services or hooks.
* Reuse existing helpers instead of rolling your own:
  * `withRetry()` in `src/shared/utils/retry.ts`
  * `normalizeError()` in `src/shared/utils/error-handling.tsx`
  * Logger in `src/shared/utils/logger.ts` (redacts sensitive fields)
* Type safety: no `any`; use precise unions, discriminated unions, and `readonly` where practical.
* Keep cross-context payloads lean and serializable; avoid giant parameter objects.
* Consistency: reuse query keys and caches; don’t duplicate logic; never log credentials.

### Type conventions (project-specific)

Centralize shared types in `src/shared/types/` and re-export curated surfaces via `src/shared/types/index.ts`.

* Organization
  * AniList domain: `src/shared/types/anilist.ts`
  * Sonarr domain: `src/shared/types/sonarr.ts`
  * Extension/options and payloads: `src/shared/types/extension.ts`
  * Mapping: `src/shared/types/mapping.ts`
  * Overlay/UI adapters: `src/shared/types/browse-overlay.ts`
* Patterns
  * Use discriminated unions for statuses/results; prefer string literal unions over enums.
  * Mark arrays/records `readonly` when possible for immutability.
  * Separate “public” vs “sensitive” shapes (e.g., public options safe for content scripts vs. full options with secrets).
* Cross-context contracts
  * RPC payloads should reference `src/shared/types/*` and validate via `src/rpc/schemas.ts`.
  * Do not redefine ad-hoc types inside feature files; add or reuse in `src/shared/types/` and re-export from `src/shared/types/index.ts`.
  * `CheckSeriesStatusResponse` includes optional `overrideActive?: boolean` to signal active manual mapping.

---

## 11. Operational notes

* MV2 background pages may suspend `browser.alarms`; fallback to `setInterval` guarded by `__a2a_fallback_interval__`.
* `registerAni2arrApi()` runs **once** in the background; all other contexts call `getAni2arrApi()`.
* Avoid persisting credential-bearing queries; filters in `query-cache.ts` enforce this.
* Browse overlays must throttle DOM scans and mark processed cards with `data-a2a-processed`.

---

## 12. Change recipes

### Add new host permission

1. Edit `wxt.config.ts` under `host_permissions` (MV3).
2. If runtime permission is required, call `requestSonarrPermission()` from the options UI.
3. Validate the new domain in `shared/utils/validation.ts`.

### Add a Sonarr form field

1. Extend form schema in `src/rpc/schemas.ts`.
2. Update the UI in `src/shared/components/sonarr-form.tsx`.
3. Ensure selects/dialogs use the `portalContainer` prop for shadow DOM rendering.

### Extend mapping logic

1. Modify files in `src/services/mapping/*`.
2. Maintain correct TTLs and inflight deduplication behavior.
3. Categorize and cache failures by type.

### Add a query that must not persist

1. Define its key in `src/shared/hooks/use-api-queries.ts`.
2. Update `shouldPersistQuery` to explicitly exclude it.

### Add a new overlay action

1. Implement in `src/features/media-overlay/components/media-overlay.tsx` or `src/features/media-overlay/components/card-overlay.tsx`.
2. Guard duplicates with `data-a2a-processed`.
3. Mount portals into the shadow root.

---

## 13. Tests and validation

Run targeted tests first, then full suite if shared modules changed.

```bash
npm run lint
npm run compile
```

Smoke validation checklist:

* Background responds to readiness ping.
* Options page saves and restores Sonarr settings correctly.
* Content injection occurs once per AniList page.
* Radix portals render inside the shadow DOM.
* AniList and Sonarr requests stay within documented concurrency and respect 429 `Retry-After`.
* No credential data appears in IndexedDB or persisted queries.

---

## 14. File pointers

| Area          | Path                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| RPC           | `src/rpc/index.ts`, `src/rpc/schemas.ts`                                      |
| Mapping       | `src/services/mapping/*`                                                      |
| AniList API   | `src/api/anilist.api.ts`                                                      |
| Sonarr API    | `src/api/sonarr.api.ts`                                                       |
| Library       | `src/services/library.service.ts`                                             |
| Persistence   | `src/cache/query-cache.ts`, `src/shared/utils/query-persist-options.ts`              |
| Overrides     | `src/shared/utils/overrides-storage.ts`, `src/services/mapping/overrides.service.ts` |
| Broadcasts    | `src/shared/hooks/use-broadcasts.ts`                                                 |
| UI            | `src/shared/components/media-actions.tsx`, `src/shared/components/form.tsx`, `src/features/media-overlay/components/media-overlay.tsx` |
| Config        | `wxt.config.ts`                                                               |
| Retry helpers | `src/shared/utils/retry.ts`                                                          |

---

## 15. Final checklist before commit

* ✅ `npm run lint` passes with no warnings.
* ✅ `npm run build` completes successfully.
* ✅ Background service responds to ping.
* ✅ Options page permission flow works.
* ✅ AniList overlay injects once and renders correctly.
* ✅ No new persisted queries contain secrets.
* ✅ 429 handling and TTL logic unchanged or extended safely.
* ✅ No additional host permissions added without manifest update.
