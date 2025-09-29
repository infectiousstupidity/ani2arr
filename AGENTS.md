# Kitsunarr Agents Guide

## 1. Project Snapshot
- Kitsunarr adds Sonarr integration to AniList pages via a WXT browser extension targeting Chromium and Firefox.
- Core stack: TypeScript (strict), React 19, TanStack Query 5, Radix UI primitives, Tailwind CSS 4, WebExtension APIs via `wxt`.
- Services rely on `@webext-core/proxy-service` for background/foreground RPC, `@wxt-dev/storage` for options sync, `idb-keyval` for query caching.
- Domain: map AniList anime -> TVDB -> Sonarr library, allowing quick add with customizable defaults.

## 2. Tooling & Commands
- `npm install` seeds deps and runs `wxt prepare` via `postinstall`.
- `npm run dev` (or `npm run dev:firefox`) launches the WXT dev server with fast reload.
- `npm run build` produces a production bundle in `dist`; `npm run zip` creates distributable archives.
- `npm run lint` uses ESLint 9 with TypeScript config; keep it passing.
- Type-check with `npm run compile`; run targeted tests with `npx vitest` when suites are added.

## 3. Architecture Overview
### Entry points (`src/entrypoints`)
- `background/index.ts` registers proxy services, seeds mapping caches on install/start, and handles alarms/messages.
- `options/index.tsx` renders the settings page (`SettingsForm`) under `options/index.html`.
- `popup/index.tsx` shows a lightweight status/shortcut UI when the toolbar icon is opened.
- `anilist-anime.content/index.tsx` injects the main action group on AniList title pages, hydrating TanStack Query with an IndexedDB persister.
- `anilist-browse.content/index.tsx` handles list/grid views, mirroring the action group logic for cards rendered during browsing.

### Shared services (`src/services`)
- `index.ts` exposes `registerKitsunarrApi` / `getKitsunarrApi` using `@webext-core/proxy-service`; every consumer must assume RPC semantics (async, serialized).
- `library.service.ts` maintains a lean Sonarr series cache with soft/hard TTLs and derives status for AniList IDs.
- `mapping.service.ts` resolves AniList IDs to TVDB IDs via static mapping tables (GitHub JSON mirrors), AniList fallbacks, and Sonarr lookups.
- `src/cache/ttl-cache.ts` exposes TTL-aware caches backed by IndexedDB; use them for cross-context persistence.

### Hooks & State (`src/hooks`)
- `use-api-queries.ts` centralizes TanStack Query keys, option fetches, Sonarr metadata retrieval, and mutations for add/test/save flows.
- `use-settings-manager.ts` orchestrates the options form, including dirty tracking, optimistic saves, connection tests, and metadata hydration.
- `use-add-series-manager.ts`, `use-network-status.ts`, and `use-theme.ts` provide focused UI helpers (network polling, theme sync, etc.).

## 4. Domain Model & Data Flow
- Types live in `src/types.ts`; key shapes include `ExtensionOptions` (stored in sync storage), `SonarrFormState`, `AddRequestPayload`, and `CheckSeriesStatusResponse`.
- Settings flow: options UI -> `use-settings-manager` -> `extensionOptions` storage item -> background services for Sonarr credentials.
- Content flow: AniList content script queries `library.getSeriesStatus`, optionally `mapping.resolveTvdbId`, then calls `sonarr.addSeries`. Successful adds update caches and invalidate relevant TanStack keys.
- Permissions: Sonarr host access is requested on demand via `requestSonarrPermission`; every outbound fetch verifies with `hasSonarrPermission`.

## 5. Key Modules At A Glance
- `src/api/sonarr.api.ts`: wraps Sonarr v3 endpoints with retry, permission checks, and `ExtensionError` normalization.
- `src/api/anilist.api.ts`: fetches AniList GraphQL metadata required for title disambiguation (see file for queries and caching guards).
- `src/ui/Form.tsx`: shared form primitives (Context + Radix wrappers) with Tailwind styling and consistent ID wiring.
- `src/ui/SonarrActionGroup.tsx`: renders the injected button group, bridging quick-add, modal launch, and status indicators.
- `src/ui/SonarrForm.tsx` / `src/ui/SelectContent.tsx`: override Radix Select portal/container behavior to play well inside shadow DOM.
- `src/utils/error-handling.tsx`: defines `ExtensionError`, factory helpers, and a React error boundary; always `normalizeError` before surfacing to UI.
- `src/utils/retry.ts`: exponential backoff with jitter; avoid writing bespoke retry loops.
- `src/utils/cache-persister.ts`: TanStack Query persister using `idb-keyval` (key `kitsunarr-query-client-cache`).
- `wxt.config.ts`: single source of truth for manifest data, modules, Tailwind plugin, and host permissions.

## 6. Patterns & Conventions
- Use the `@/*` path alias (configured in `tsconfig.json`) instead of relative traversals.
- Stick to functional React components with `React.memo` / `React.forwardRef` when creating reusable primitives.
- TanStack Query keys live in `queryKeys`; reuse them to avoid accidental cache fragmentation.
- Always wrap cross-context service calls in `try/catch` and pass errors through `normalizeError` so UI can present `userMessage`.
- Prefer pure helpers in `utils/` and keep side effects (storage, fetches) inside services or hooks.
- Tailwind utility classes drive styling; co-locate component-specific `.css` only when shadow DOM or global overrides are required.
- Logging goes through `logger.create(scope)` to honor build-time log gating.

## 7. Caching & Resilience
- `CacheService` entries store both `staleAt` and `expiresAt`; stale data is returned while background refresh runs. Respect those semantics when adding new cache keys.
- Mapping resolution caches both successes and categorized failures (config, permission, network). Use the provided TTL helpers to avoid hammering third parties.
- TanStack Query persistence keeps AniList page state snappy; invalidate via `queryClient.invalidateQueries` with matching keys after mutations.

## 8. UI System Notes
- Shadow DOM constraints: content scripts mount UIs via `createShadowRootUi`. When building new portals, pass `portalContainer` down (see `SelectContent`).
- Forms rely on `FormField` context to link labels/inputs; avoid breaking the `useFormField` contract.
- Tooltips, dialogs, selects, and accordion components come from Radix UI; style through Tailwind classes applied to the composed primitives.

## 9. Testing & Validation
- Lint before committing (`npm run lint`); ESLint is strict about hooks rules, exhaustive deps, and unused vars.
- Use `npm run compile` to ensure the TypeScript project (including partner tsconfigs under `.wxt/`) stays error free.
- For runtime verification, run `npm run dev`, load `dist` or dev server via the browser, and exercise AniList pages plus the options view.
- When adding networked code, mock services in Vitest (see existing utilities) and prefer dependency injection for testability.

## 10. Operational Tips & Pitfalls
- New hosts require manifest updates in `wxt.config.ts` and may also need runtime permission prompts.
- Background alarms do not fire in MV2 on Chromium when suspended; `MappingService` falls back to `setInterval` via a global guard.
- `registerKitsunarrApi()` must execute exactly once (background). Content scripts should only ever call `getKitsunarrApi()`.
- Respect rate limits on AniList and Sonarr: batch lookups via `MappingService` queue rather than issuing parallel fetches.
- Keep AGENTS.md in sync when adding core flows or changing service contracts so future agents stay aligned.

